package usercommands

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/user"
)

// SetPublicKeysHandler publishes (or replaces) a user's identity keys.
type SetPublicKeysHandler struct {
	keys user.KeyRepository
}

func NewSetPublicKeysHandler(keys user.KeyRepository) *SetPublicKeysHandler {
	return &SetPublicKeysHandler{keys: keys}
}

// Handle stores callerID's public keys, generated client-side (the
// server never sees a private key). Rejects malformed input before it
// reaches the database.
func (h *SetPublicKeysHandler) Handle(ctx context.Context, callerID user.ID, keys user.PublicKeys) error {
	if err := keys.Validate(); err != nil {
		return err
	}
	if err := h.keys.SetPublicKeys(ctx, callerID, keys); err != nil {
		return fmt.Errorf("user: setting public keys: %w", err)
	}
	return nil
}
