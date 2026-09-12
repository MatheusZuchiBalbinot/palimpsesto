package usercommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/user"
)

// ChangePasswordInput is what a client sends to change its password.
// CurrentLoginKey/NewLoginKey already arrive derived via client-side HKDF
// (docs/CRYPTO.md) — the server never sees a raw password. NewSaltMK is a
// fresh salt generated for the new derivation.
type ChangePasswordInput struct {
	UserID          user.ID
	CurrentLoginKey user.LoginKey
	NewLoginKey     user.LoginKey
	NewSaltMK       []byte
}

// ChangePasswordHandler replaces a user's login-key material. Never
// touches the identity private keys themselves — those are re-wrapped
// with the new wrapKey and republished via SetWrappedPrivateKeys
// separately (docs/CRYPTO.md: "without touching the private key
// itself").
type ChangePasswordHandler struct {
	users user.Repository
}

func NewChangePasswordHandler(users user.Repository) *ChangePasswordHandler {
	return &ChangePasswordHandler{users: users}
}

// Handle re-verifies CurrentLoginKey against the stored hash before
// accepting the change — an access token alone authenticates "you are
// this session," not "you still know the password," and a password
// change is exactly the kind of action a hijacked but still-valid
// session shouldn't be able to push through silently.
func (h *ChangePasswordHandler) Handle(ctx context.Context, in ChangePasswordInput) error {
	if len(in.NewSaltMK) != saltMKLength {
		return fmt.Errorf("%w: salt_mk must be %d bytes, got %d", user.ErrInvalidSalt, saltMKLength, len(in.NewSaltMK))
	}
	if err := in.NewLoginKey.Validate(); err != nil {
		return err
	}

	credentials, err := h.users.FindByID(ctx, in.UserID)
	if errors.Is(err, user.ErrNotFound) {
		return user.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("user: finding account for password change: %w", err)
	}

	isCurrentKeyValid, err := user.VerifyLoginKey(in.CurrentLoginKey, credentials.LoginKeyHash, credentials.ArgonParams)
	if err != nil {
		return fmt.Errorf("user: verifying current login key: %w", err)
	}
	if !isCurrentKeyValid {
		return user.ErrInvalidCredentials
	}

	newHash, newParams, err := user.HashLoginKey(in.NewLoginKey)
	if err != nil {
		return err
	}

	material := user.NewLoginKeyMaterial{LoginKeyHash: newHash, ArgonParams: newParams, SaltMK: in.NewSaltMK}
	if err := h.users.UpdateLoginKeyMaterial(ctx, in.UserID, material); err != nil {
		return fmt.Errorf("user: updating login key material: %w", err)
	}
	return nil
}
