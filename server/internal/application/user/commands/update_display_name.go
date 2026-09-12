package usercommands

import (
	"context"
	"fmt"
	"strings"

	"palimpsesto/internal/domain/user"
)

const maxDisplayNameLength = 80

// UpdateDisplayNameHandler changes the caller's own display name — the
// one piece of a user's account that appears to other people (comments,
// member lists, presence) and, unlike email, has no other way to fix a
// typo made at registration.
type UpdateDisplayNameHandler struct {
	users user.Repository
}

func NewUpdateDisplayNameHandler(users user.Repository) *UpdateDisplayNameHandler {
	return &UpdateDisplayNameHandler{users: users}
}

func (h *UpdateDisplayNameHandler) Handle(ctx context.Context, callerID user.ID, displayName user.DisplayName) error {
	trimmed := strings.TrimSpace(string(displayName))
	if trimmed == "" || len(trimmed) > maxDisplayNameLength {
		return user.ErrInvalidDisplayName
	}

	if err := h.users.UpdateDisplayName(ctx, callerID, user.DisplayName(trimmed)); err != nil {
		return fmt.Errorf("user: updating display name: %w", err)
	}
	return nil
}
