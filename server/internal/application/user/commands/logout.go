package usercommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/session"
)

// LogoutHandler revokes every session in the family a presented refresh
// token belongs to.
type LogoutHandler struct {
	sessions session.Repository
}

func NewLogoutHandler(sessions session.Repository) *LogoutHandler {
	return &LogoutHandler{sessions: sessions}
}

// Handle is idempotent: a token that's already gone isn't an error.
func (h *LogoutHandler) Handle(ctx context.Context, presentedToken string) error {
	existing, err := h.sessions.FindByRefreshHash(ctx, session.HashRefreshToken(presentedToken))
	if errors.Is(err, session.ErrInvalidRefreshToken) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("user: looking up session: %w", err)
	}
	return h.sessions.RevokeFamily(ctx, existing.FamilyID)
}
