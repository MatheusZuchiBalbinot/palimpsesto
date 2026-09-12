package userqueries

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/user/dto"
)

// LookupUserHandler resolves an email to a user's public keys — what a
// client needs before it can wrap a document DEK for a new collaborator
// (docs/CRYPTO.md's envelope encryption; the wrap itself happens
// client-side, this just supplies the public key to wrap against).
type LookupUserHandler struct {
	users user.Repository
	keys  user.KeyRepository
}

func NewLookupUserHandler(users user.Repository, keys user.KeyRepository) *LookupUserHandler {
	return &LookupUserHandler{users: users, keys: keys}
}

// Handle returns the sentinel errors as-is (never distinguishing "no such
// account exists" from "account exists but hasn't published keys yet"
// beyond the returned sentinel) so a caller can't use this to enumerate
// which emails have registered versus which have set up their keys.
func (h *LookupUserHandler) Handle(ctx context.Context, email user.Email) (userdto.PublicKeysView, error) {
	account, err := h.users.FindByEmail(ctx, email)
	if errors.Is(err, user.ErrNotFound) {
		return userdto.PublicKeysView{}, user.ErrNotFound
	}
	if err != nil {
		return userdto.PublicKeysView{}, fmt.Errorf("user: looking up account: %w", err)
	}

	keys, err := h.keys.FindPublicKeys(ctx, account.ID)
	if errors.Is(err, user.ErrKeysNotFound) {
		return userdto.PublicKeysView{}, user.ErrKeysNotFound
	}
	if err != nil {
		return userdto.PublicKeysView{}, fmt.Errorf("user: looking up public keys: %w", err)
	}

	view := userdto.FromPublicKeys(account.ID, keys)
	view.DisplayName = account.DisplayName
	return view, nil
}
