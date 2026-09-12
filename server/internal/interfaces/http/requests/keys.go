package requests

// SetPublicKeys is what a client sends to publish its identity keys
// (generated client-side — see docs/CRYPTO.md). Both fields are
// standard base64.
type SetPublicKeys struct {
	IdentityPub string `json:"identity_pub"`
	SigningPub  string `json:"signing_pub"`
}

// SetWrappedPrivateKeys is what a client sends to publish its sealed
// private keys. Both fields are standard base64.
type SetWrappedPrivateKeys struct {
	Ciphertext string `json:"ciphertext"`
	Nonce      string `json:"nonce"`
}
