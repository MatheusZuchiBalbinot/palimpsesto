// Package user is the user domain: the account entity, its value objects,
// the password hashing rules, and the repository contract that the
// infrastructure needs to satisfy. Never imports net/http or database
// drivers.
package user

// Account is a user, without any secret material — what the rest of the
// system is allowed to know about who someone is.
type Account struct {
	ID          ID
	Email       Email
	DisplayName DisplayName
}

// Credentials is the full stored row a repository returns for login
// verification: an Account plus its Argon2id hash, encoded parameters, and
// salt_mk — the one piece of master key material (docs/CRYPTO.md) that's
// public by design, so a client can derive the MK before it even has
// something to authenticate with.
type Credentials struct {
	Account
	LoginKeyHash string
	ArgonParams  string
	SaltMK       []byte
}
