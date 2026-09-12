package responses

import (
	"encoding/base64"

	"palimpsesto/internal/application/user/dto"
)

// PublicKeys is a user's published identity keys plus the derived
// fingerprint, as sent to the client — docs/CRYPTO.md's "sigil".
type PublicKeys struct {
	UserID      string `json:"user_id"`
	IdentityPub string `json:"identity_pub"`
	SigningPub  string `json:"signing_pub"`
	Fingerprint string `json:"fingerprint"`
	// DisplayName is only populated for GET /api/users/lookup — see
	// userdto.PublicKeysView.DisplayName.
	DisplayName string `json:"display_name"`
}

func FromPublicKeys(v userdto.PublicKeysView) PublicKeys {
	return PublicKeys{
		UserID:      string(v.UserID),
		IdentityPub: base64.StdEncoding.EncodeToString(v.IdentityPub),
		SigningPub:  base64.StdEncoding.EncodeToString(v.SigningPub),
		Fingerprint: string(v.Fingerprint),
		DisplayName: string(v.DisplayName),
	}
}

// Salt is an account's salt_mk, in base64 — docs/CRYPTO.md's master-key
// hierarchy, fetched before login.
type Salt struct {
	SaltMK string `json:"salt_mk"`
}

// WrappedPrivateKeys is a user's sealed identity private keys, as sent
// to the client (always only to their own owner — see
// GetOwnWrappedPrivateKeys).
type WrappedPrivateKeys struct {
	Ciphertext string `json:"ciphertext"`
	Nonce      string `json:"nonce"`
}
