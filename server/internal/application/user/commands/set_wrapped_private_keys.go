package usercommands

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/user"
)

// SetWrappedPrivateKeysHandler publishes (or replaces, e.g. on a password
// change) a user's wrapped private keys.
type SetWrappedPrivateKeysHandler struct {
	keys user.KeyRepository
}

func NewSetWrappedPrivateKeysHandler(keys user.KeyRepository) *SetWrappedPrivateKeysHandler {
	return &SetWrappedPrivateKeysHandler{keys: keys}
}

func (h *SetWrappedPrivateKeysHandler) Handle(ctx context.Context, callerID user.ID, keys user.WrappedPrivateKeys) error {
	if err := keys.Validate(); err != nil {
		return err
	}
	if err := h.keys.SetWrappedPrivateKeys(ctx, callerID, keys); err != nil {
		return fmt.Errorf("user: setting wrapped private keys: %w", err)
	}
	return nil
}
