package user

import "context"

// NewLoginKeyMaterial is what a password change replaces — a new
// Argon2id hash/params pair (from a new loginKey, itself derived from a
// new password) and a new salt_mk. Never touches the identity private
// keys themselves; those are rewrapped separately with the new wrapKey
// (see KeyRepository.SetWrappedPrivateKeys), same underlying keys.
type NewLoginKeyMaterial struct {
	LoginKeyHash string
	ArgonParams  string
	SaltMK       []byte
}

// NewAccount is what registering a user persists: the hashed login key
// and its encoded Argon2id parameters, never the raw key — plus salt_mk,
// generated client-side (docs/CRYPTO.md's master key hierarchy).
type NewAccount struct {
	Email        Email
	DisplayName  DisplayName
	LoginKeyHash string
	ArgonParams  string
	SaltMK       []byte
}

// Repository is the persistence contract for user accounts. The
// infrastructure implements this; the domains and application layer
// depend only on the interface.
type Repository interface {
	// Create inserts a new account. Returns ErrEmailTaken if the email is
	// already registered.
	Create(ctx context.Context, in NewAccount) (ID, error)

	// FindByEmail looks up an account's full credentials by email.
	// Returns ErrNotFound if there's no match.
	FindByEmail(ctx context.Context, email Email) (Credentials, error)

	// FindByID looks up an account's full credentials by ID — used where
	// the caller already has an authenticated user ID (from the access
	// token) and needs its credentials, for example to verify the
	// current login key before a password change. Returns ErrNotFound if
	// there's no match.
	FindByID(ctx context.Context, userID ID) (Credentials, error)

	// UpdateLoginKeyMaterial replaces userID's login key hash, its
	// Argon2id parameters, and salt_mk — a password change. Returns
	// ErrNotFound if userID doesn't exist.
	UpdateLoginKeyMaterial(ctx context.Context, userID ID, material NewLoginKeyMaterial) error

	// UpdateDisplayName replaces userID's display name. Returns
	// ErrNotFound if userID doesn't exist.
	UpdateDisplayName(ctx context.Context, userID ID, displayName DisplayName) error
}
