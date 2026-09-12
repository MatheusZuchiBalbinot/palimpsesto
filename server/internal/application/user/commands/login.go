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

const refreshTokenTTL = 30 * 24 * time.Hour

// LoginInput is what a client sends to start a session.
type LoginInput struct {
	Email       user.Email
	LoginKey    user.LoginKey
	DeviceLabel string
}

// LoginHandler verifies credentials and starts a new session (a new
// rotation family).
type LoginHandler struct {
	users     user.Repository
	sessions  session.Repository
	jwtSecret []byte
}

func NewLoginHandler(users user.Repository, sessions session.Repository, jwtSecret []byte) *LoginHandler {
	return &LoginHandler{users: users, sessions: sessions, jwtSecret: jwtSecret}
}

// Handle always fails with user.ErrInvalidCredentials — the caller never
// finds out whether it was the email or the login key that was wrong.
func (h *LoginHandler) Handle(ctx context.Context, in LoginInput) (userdto.TokenPair, error) {
	credentials, err := h.users.FindByEmail(ctx, in.Email)
	if errors.Is(err, user.ErrNotFound) {
		return userdto.TokenPair{}, user.ErrInvalidCredentials
	}
	if err != nil {
		return userdto.TokenPair{}, fmt.Errorf("user: logging in: %w", err)
	}

	isLoginKeyValid, err := user.VerifyLoginKey(in.LoginKey, credentials.LoginKeyHash, credentials.ArgonParams)
	if err != nil {
		return userdto.TokenPair{}, fmt.Errorf("user: verifying login key: %w", err)
	}
	if !isLoginKeyValid {
		return userdto.TokenPair{}, user.ErrInvalidCredentials
	}

	refreshToken, refreshHash, err := session.NewRefreshToken()
	if err != nil {
		return userdto.TokenPair{}, err
	}

	sessionExpiresAt := time.Now().Add(refreshTokenTTL)
	newSession, err := h.sessions.Create(ctx, credentials.ID, refreshHash, in.DeviceLabel, sessionExpiresAt)
	if err != nil {
		return userdto.TokenPair{}, fmt.Errorf("user: creating session: %w", err)
	}

	accessToken, accessExpiresAt, err := auth.NewAccessToken(h.jwtSecret, credentials.ID, newSession.FamilyID)
	if err != nil {
		return userdto.TokenPair{}, err
	}

	return userdto.TokenPair{
		AccessToken:           accessToken,
		AccessTokenExpiresAt:  accessExpiresAt,
		RefreshToken:          refreshToken,
		RefreshTokenExpiresAt: sessionExpiresAt,
		Account: userdto.AccountView{
			ID:          credentials.ID,
			Email:       credentials.Email,
			DisplayName: credentials.DisplayName,
		},
	}, nil
}
