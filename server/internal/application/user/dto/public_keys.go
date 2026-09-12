package userdto

import "palimpsesto/internal/domain/user"

// PublicKeysView is a user's published identity keys plus the derived
// fingerprint — what GET /api/users/lookup returns so the caller can wrap
// a document DEK for them (docs/CRYPTO.md's envelope encryption) and show
// a sigil for verification.
type PublicKeysView struct {
	UserID      user.ID
	IdentityPub []byte
	SigningPub  []byte
	Fingerprint user.Fingerprint
	// DisplayName is only set by LookupUserHandler (the invite-by-email
	// flow, which already loads the account) — empty for
	// GetPublicKeysHandler, which only ever fetches keys and has no
	// reason to pay for an extra account lookup just to fill this in.
	DisplayName user.DisplayName
}

func FromPublicKeys(userID user.ID, keys user.PublicKeys) PublicKeysView {
	return PublicKeysView{
		UserID:      userID,
		IdentityPub: keys.IdentityPub,
		SigningPub:  keys.SigningPub,
		Fingerprint: user.ComputeFingerprint(keys),
	}
}
