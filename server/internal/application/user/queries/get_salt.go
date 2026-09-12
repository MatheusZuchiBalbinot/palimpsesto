package userqueries

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/user"
)

// GetSaltHandler resolves an email to the account's salt_mk — the one
// piece of master-key material (docs/CRYPTO.md) a client needs before
// being authenticated, in order to derive MK = Argon2id(password,
// salt_mk) and, from that, the loginKey it actually logs in with.
// Deliberately public/unauthenticated; docs/CRYPTO.md documents this
// trade-off (it leaks whether an email is registered) explicitly instead
// of pretending it doesn't exist.
type GetSaltHandler struct {
	users user.Repository
}

func NewGetSaltHandler(users user.Repository) *GetSaltHandler {
	return &GetSaltHandler{users: users}
}

func (h *GetSaltHandler) Handle(ctx context.Context, email user.Email) ([]byte, error) {
	credentials, err := h.users.FindByEmail(ctx, email)
	if errors.Is(err, user.ErrNotFound) {
		return nil, user.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("user: getting salt: %w", err)
	}
	return credentials.SaltMK, nil
}
