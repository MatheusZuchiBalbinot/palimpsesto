package usercommands

import (
	"context"
	"errors"
	"fmt"
	"time"

	"palimpsesto/internal/domain/auth"
	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/user/dto"
)

// RefreshInput is what a client sends to rotate its refresh token.
type RefreshInput struct {
	PresentedToken string
	DeviceLabel    string
}

// RefreshHandler rotates a refresh token: the presented one is retired
// and a new one is issued in the same family.
type RefreshHandler struct {
	users     user.Repository
	sessions  session.Repository
	jwtSecret []byte
}

func NewRefreshHandler(users user.Repository, sessions session.Repository, jwtSecret []byte) *RefreshHandler {
	return &RefreshHandler{users: users, sessions: sessions, jwtSecret: jwtSecret}
}

// Handle treats an already-retired token presented again as theft — the
// whole family is revoked immediately, including whoever's legitimate
// session it was.
func (h *RefreshHandler) Handle(ctx context.Context, in RefreshInput) (userdto.TokenPair, error) {
	presentedHash := session.HashRefreshToken(in.PresentedToken)

	existing, err := h.sessions.FindByRefreshHash(ctx, presentedHash)
	if errors.Is(err, session.ErrInvalidRefreshToken) {
		return userdto.TokenPair{}, session.ErrInvalidRefreshToken
	}
	if err != nil {
		return userdto.TokenPair{}, fmt.Errorf("user: looking up session: %w", err)
	}

	if err := existing.DetectReuse(time.Now()); err != nil {
		if errors.Is(err, session.ErrRefreshTokenReused) {
			if revokeErr := h.sessions.RevokeFamily(ctx, existing.FamilyID); revokeErr != nil {
				return userdto.TokenPair{}, fmt.Errorf("user: revoking family after reuse: %w", revokeErr)
			}
		}
		return userdto.TokenPair{}, session.ErrInvalidRefreshToken
	}

	if err := h.sessions.Revoke(ctx, existing.ID); err != nil {
		return userdto.TokenPair{}, fmt.Errorf("user: revoking rotated session: %w", err)
	}

	refreshToken, refreshHash, err := session.NewRefreshToken()
	if err != nil {
		return userdto.TokenPair{}, err
	}

	rotatedExpiresAt := time.Now().Add(refreshTokenTTL)
	if _, err := h.sessions.Rotate(ctx, existing.FamilyID, existing.UserID, refreshHash, in.DeviceLabel, rotatedExpiresAt); err != nil {
		return userdto.TokenPair{}, fmt.Errorf("user: rotating session: %w", err)
	}

	accessToken, accessExpiresAt, err := auth.NewAccessToken(h.jwtSecret, existing.UserID, existing.FamilyID)
	if err != nil {
		return userdto.TokenPair{}, err
	}

	// TokenPair.Account here originally only carried the ID, since nothing
	// needed the rest — until client-side session bootstrapping came to
	// depend on a refresh response looking exactly like a login response,
	// so a reloaded page can restore session.user without a second round
	// trip to the server. account.ID is already known and trusted (it
	// came from the session row itself, not the client); if this lookup
	// fails, the token pair would still be valid to return since the
	// tokens themselves don't depend on it — but email/display_name would
	// be missing, which the client also can't work with, so failing
	// explicitly here is the more honest choice.
	account, err := h.users.FindByID(ctx, existing.UserID)
	if err != nil {
		return userdto.TokenPair{}, fmt.Errorf("user: loading account for refresh: %w", err)
	}

	return userdto.TokenPair{
		AccessToken:           accessToken,
		AccessTokenExpiresAt:  accessExpiresAt,
		RefreshToken:          refreshToken,
		RefreshTokenExpiresAt: rotatedExpiresAt,
		Account: userdto.AccountView{
			ID:          account.ID,
			Email:       account.Email,
			DisplayName: account.DisplayName,
		},
	}, nil
}
