package user

import (
	"context"
	"crypto/sha256"
	"fmt"
)

// identityPubLen and signingPubLen are the sizes of raw X25519 and
// Ed25519 public keys respectively — both 32 bytes, but named separately
// since they're conceptually different keys that coincidentally share a
// size.
const (
	identityPubLen = 32
	signingPubLen  = 32
)

// PublicKeys is a user's long-term identity keypair — public halves only.
// Generated client-side (X25519 for ECDH key agreement, Ed25519 for
// signing); the private halves never reach the server. See the key
// hierarchy diagram in docs/CRYPTO.md for where these fit in.
type PublicKeys struct {
	IdentityPub []byte // X25519, 32 bytes
	SigningPub  []byte // Ed25519, 32 bytes
}

// Validate checks that the keys are the correct length. It can't (and
// doesn't try to) verify they're valid curve points — that's ECDH's
// problem at the moment someone actually tries to use an invalid key, not
// this constructor's.
func (k PublicKeys) Validate() error {
	if len(k.IdentityPub) != identityPubLen {
		return fmt.Errorf("%w: identity_pub must be %d bytes, got %d", ErrInvalidPublicKeys, identityPubLen, len(k.IdentityPub))
	}
	if len(k.SigningPub) != signingPubLen {
		return fmt.Errorf("%w: signing_pub must be %d bytes, got %d", ErrInvalidPublicKeys, signingPubLen, len(k.SigningPub))
	}
	return nil
}

// Fingerprint is SHA-256(identity_pub || signing_pub), rendered as 12
// groups of 5 digits — docs/CRYPTO.md, "Sigils: identity verification".
// Two people comparing this (or the sigil glyph derived from it) over a
// different channel is the real defense against a lying server handing
// out a substituted public key.
type Fingerprint string

// ComputeFingerprint derives k's fingerprint. Pure function, no I/O — the
// same bytes always produce the same fingerprint, which is the whole
// point.
func ComputeFingerprint(k PublicKeys) Fingerprint {
	h := sha256.Sum256(append(append([]byte{}, k.IdentityPub...), k.SigningPub...))
	return formatFingerprint(h[:])
}

// formatFingerprint turns hash bytes into 12 groups of 5 decimal digits —
// 60 digits total, each group independently readable on a voice call ("my
// sigil starts with one-two-three-four-five..."). Each digit comes from a
// hash byte mod 10; 32 hash bytes cover the first 32 digits, and the
// remaining 28 digits loop back over the same bytes (mod 32) instead of
// needing a second hash — 60 digits from a 256-bit hash is already far
// more entropy than needed for visual comparison, so that repetition
// costs nothing in practice.
func formatFingerprint(hash []byte) Fingerprint {
	const (
		totalDigits    = 60
		digitsPerGroup = 5
	)

	digits := make([]byte, totalDigits)
	for i := range digits {
		digits[i] = '0' + hash[i%len(hash)]%10
	}

	groups := make([]byte, 0, totalDigits+totalDigits/digitsPerGroup)
	for i, d := range digits {
		if i > 0 && i%digitsPerGroup == 0 {
			groups = append(groups, ' ')
		}
		groups = append(groups, d)
	}
	return Fingerprint(groups)
}

// wrapNonceLen matches WRAP_NONCE_LENGTH from crypto/wrapPrivateKeys.ts —
// a full XChaCha20 nonce, not the shorter XChaCha20-Poly1305 prime.
const wrapNonceLen = 24

// WrappedPrivateKeys are the identity private keys (X25519 + Ed25519,
// packed together client-side), sealed with wrapKey —
// docs/CRYPTO.md's "kept encrypted ON THE SERVER (enables multi-device)".
// Opaque to the server: it stores and serves this blob but, without
// wrapKey, can never decrypt it.
type WrappedPrivateKeys struct {
	Ciphertext []byte
	Nonce      []byte
}

// Validate checks that the nonce is the correct length. It can't validate
// the ciphertext beyond that — a wrong wrapKey or a tampered ciphertext
// only surfaces when the legitimate owner tries to unwrap it client-side
// and the Poly1305 authentication fails there (docs/CRYPTO.md rule #6).
func (k WrappedPrivateKeys) Validate() error {
	if len(k.Nonce) != wrapNonceLen {
		return fmt.Errorf("%w: nonce must be %d bytes, got %d", ErrInvalidPrivateKeys, wrapNonceLen, len(k.Nonce))
	}
	if len(k.Ciphertext) == 0 {
		return fmt.Errorf("%w: ciphertext must not be empty", ErrInvalidPrivateKeys)
	}
	return nil
}

// KeyRepository is the persistence contract for a user's identity keys —
// the public halves and the wrapped private halves — kept separate from
// Repository (the account itself) since not every caller that needs an
// Account needs to touch keys, and vice versa.
type KeyRepository interface {
	// SetPublicKeys stores (or replaces) userID's public keys. Replacing
	// an existing key is a real, security-relevant event — every document
	// shared with that user should warn other members to re-verify
	// (docs/CRYPTO.md's "warning on key change") — but that warning is
	// wired up elsewhere, alongside document-level key epochs, not here.
	SetPublicKeys(ctx context.Context, userID ID, keys PublicKeys) error

	// FindPublicKeys looks up userID's public keys. Returns
	// ErrKeysNotFound if they haven't published any yet.
	FindPublicKeys(ctx context.Context, userID ID) (PublicKeys, error)

	// SetWrappedPrivateKeys stores (or replaces) userID's wrapped private
	// keys — called once at registration, and again at password change
	// (rewrapped with the new wrapKey, same underlying private keys).
	SetWrappedPrivateKeys(ctx context.Context, userID ID, keys WrappedPrivateKeys) error

	// FindWrappedPrivateKeys looks up userID's wrapped private keys.
	// Returns ErrPrivateKeysNotFound if none have been published yet (for
	// example, an account that only went through the initial public-keys
	// flow).
	FindWrappedPrivateKeys(ctx context.Context, userID ID) (WrappedPrivateKeys, error)
}
