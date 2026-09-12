package user

import "errors"

// Sentinel errors. The HTTP layer maps each one to a status code in a
// single place — see internal/interfaces/http/responses.
var (
	ErrEmailTaken          = errors.New("user: email already registered")
	ErrInvalidCredentials  = errors.New("user: invalid email or login key")
	ErrNotFound            = errors.New("user: no user with that identity")
	ErrKeysNotFound        = errors.New("user: no public keys published for this user")
	ErrInvalidPublicKeys   = errors.New("user: invalid public keys")
	ErrInvalidSalt         = errors.New("user: invalid salt_mk")
	ErrPrivateKeysNotFound = errors.New("user: no wrapped private keys published for this user")
	ErrInvalidPrivateKeys  = errors.New("user: invalid wrapped private keys")
	ErrInvalidDisplayName  = errors.New("user: display name must be 1 to 80 characters")
	ErrLoginKeyTooShort    = errors.New("user: login key is too short")
)
