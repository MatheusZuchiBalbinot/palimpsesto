// Package commands implements the user application service's write use
// cases: register, login, refresh, logout.
package usercommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/user"
)

// RegisterInput is what a client sends to create an account. LoginKey
// already arrives derived via client-side HKDF from the master key
// (docs/CRYPTO.md) — never the raw password. SaltMK is generated
// client-side and stored as-is so any device can later derive the same
// master key.
type RegisterInput struct {
	Email       user.Email
	LoginKey    user.LoginKey
	DisplayName user.DisplayName
	SaltMK      []byte
}

// RegisterHandler creates new accounts.
type RegisterHandler struct {
	users user.Repository
}

func NewRegisterHandler(users user.Repository) *RegisterHandler {
	return &RegisterHandler{users: users}
}

// saltMKLength matches the client's SALT_MK_LENGTH in crypto/masterKey.ts.
const saltMKLength = 16

// Handle creates a new account. Fails with user.ErrEmailTaken if the
// email is already registered.
func (h *RegisterHandler) Handle(ctx context.Context, in RegisterInput) error {
	if len(in.SaltMK) != saltMKLength {
		return fmt.Errorf("%w: salt_mk must be %d bytes, got %d", user.ErrInvalidSalt, saltMKLength, len(in.SaltMK))
	}
	if err := in.LoginKey.Validate(); err != nil {
		return err
	}

	loginKeyHash, argonParams, err := user.HashLoginKey(in.LoginKey)
	if err != nil {
		return err
	}

	newAccount := user.NewAccount{
		Email:        in.Email,
		DisplayName:  in.DisplayName,
		LoginKeyHash: loginKeyHash,
		ArgonParams:  argonParams,
		SaltMK:       in.SaltMK,
	}

	_, err = h.users.Create(ctx, newAccount)
	if errors.Is(err, user.ErrEmailTaken) {
		return user.ErrEmailTaken
	}
	if err != nil {
		return fmt.Errorf("user: registering: %w", err)
	}
	return nil
}
