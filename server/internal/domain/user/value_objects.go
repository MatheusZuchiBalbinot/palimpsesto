package user

// ID identifies a user. Always comes from the database, never constructed
// client-side.
type ID string

// Email is a user's email address, used as their login identifier.
type Email string

// LoginKey is what the client sends in place of a password. Today it's
// the password itself; the intent is for it to eventually become a value
// derived via Argon2id, from which the server never sees the raw
// password. Already named for its eventual purpose.
type LoginKey string

// minLoginKeyLength is enforced server-side because LoginKey is, today,
// the raw password (see the type's own comment) — once client-side HKDF
// derivation lands, the derived value's fixed length makes this check
// moot.
const minLoginKeyLength = 8

// Validate reports whether the login key meets the minimum length
// requirement.
func (k LoginKey) Validate() error {
	if len(k) < minLoginKeyLength {
		return ErrLoginKeyTooShort
	}
	return nil
}

// DisplayName is how a user is referred to in the UI — avatars, member
// lists, presence. Never used for identification, only display.
type DisplayName string
