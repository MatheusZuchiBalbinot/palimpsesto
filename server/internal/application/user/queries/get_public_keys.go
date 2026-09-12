package userqueries

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/user/dto"
)

// GetPublicKeysHandler fetches a user's own public keys by ID — the
// profile page's "show my sigil" (docs/CRYPTO.md), which already knows
// the caller's user ID from the auth token and doesn't need to go
// through an email lookup the way a stranger sharing a document would.
type GetPublicKeysHandler struct {
	keys user.KeyRepository
}

func NewGetPublicKeysHandler(keys user.KeyRepository) *GetPublicKeysHandler {
	return &GetPublicKeysHandler{keys: keys}
}

func (h *GetPublicKeysHandler) Handle(ctx context.Context, userID user.ID) (userdto.PublicKeysView, error) {
	keys, err := h.keys.FindPublicKeys(ctx, userID)
	if errors.Is(err, user.ErrKeysNotFound) {
		return userdto.PublicKeysView{}, user.ErrKeysNotFound
	}
	if err != nil {
		return userdto.PublicKeysView{}, fmt.Errorf("user: getting public keys: %w", err)
	}
	return userdto.FromPublicKeys(userID, keys), nil
}
