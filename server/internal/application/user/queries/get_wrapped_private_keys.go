package userqueries

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/user"
)

// GetWrappedPrivateKeysHandler returns the caller's own wrapped private
// keys — never anyone else's; the caller's ID always comes from the auth
// token, never from a request parameter, so there's no path to fetching
// another user's ciphertext, even though it couldn't be decrypted
// without their wrapKey anyway.
type GetWrappedPrivateKeysHandler struct {
	keys user.KeyRepository
}

func NewGetWrappedPrivateKeysHandler(keys user.KeyRepository) *GetWrappedPrivateKeysHandler {
	return &GetWrappedPrivateKeysHandler{keys: keys}
}

func (h *GetWrappedPrivateKeysHandler) Handle(ctx context.Context, callerID user.ID) (user.WrappedPrivateKeys, error) {
	keys, err := h.keys.FindWrappedPrivateKeys(ctx, callerID)
	if errors.Is(err, user.ErrPrivateKeysNotFound) {
		return user.WrappedPrivateKeys{}, user.ErrPrivateKeysNotFound
	}
	if err != nil {
		return user.WrappedPrivateKeys{}, fmt.Errorf("user: getting wrapped private keys: %w", err)
	}
	return keys, nil
}
