// Anonymous sealed box (envelope encryption): wraps a document's DEK for
// a recipient's identity_pub without the sender needing a long-term key
// of their own — an ephemeral X25519 keypair is generated for each seal
// and discarded right after. Sharing is "decrypt the DEK with your
// private key and re-encrypt it with the person's public key" — this
// module is that seal/unseal pair.
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

const EPHEMERAL_PUB_LEN = 32;
const NONCE_LEN = 24;
const WRAP_KEY_INFO = utf8ToBytes('palimpsesto/dek-wrap/v1');
const DERIVED_KEY_LENGTH = 32;

/** Seals `plaintext` (the document's DEK) for recipientIdentityPub. The
 * result — ephemeral_pub || nonce || ciphertext — is what gets stored as
 * a member's wrapped_dek. Only the private key corresponding to
 * recipientIdentityPub can unseal it; the sender doesn't need one. */
export function seal(recipientIdentityPub: Uint8Array, plaintext: Uint8Array): Uint8Array {
	const ephemeralPriv = x25519.utils.randomSecretKey();
	const ephemeralPub = x25519.getPublicKey(ephemeralPriv);
	const shared = x25519.getSharedSecret(ephemeralPriv, recipientIdentityPub);
	const wrapKey = hkdf(sha256, shared, undefined, WRAP_KEY_INFO, DERIVED_KEY_LENGTH);

	const nonce = randomBytes(NONCE_LEN);
	const ciphertext = xchacha20poly1305(wrapKey, nonce).encrypt(plaintext);

	const sealed = new Uint8Array(EPHEMERAL_PUB_LEN + NONCE_LEN + ciphertext.length);
	sealed.set(ephemeralPub, 0);
	sealed.set(nonce, EPHEMERAL_PUB_LEN);
	sealed.set(ciphertext, EPHEMERAL_PUB_LEN + NONCE_LEN);
	return sealed;
}

/** Unseals a sealed blob for the public key corresponding to
 * recipientIdentityPriv. Throws with the wrong key or a tampered blob —
 * never silently falls back to garbage. */
export function unseal(recipientIdentityPriv: Uint8Array, sealed: Uint8Array): Uint8Array {
	const ephemeralPub = sealed.slice(0, EPHEMERAL_PUB_LEN);
	const nonce = sealed.slice(EPHEMERAL_PUB_LEN, EPHEMERAL_PUB_LEN + NONCE_LEN);
	const ciphertext = sealed.slice(EPHEMERAL_PUB_LEN + NONCE_LEN);

	const shared = x25519.getSharedSecret(recipientIdentityPriv, ephemeralPub);
	const wrapKey = hkdf(sha256, shared, undefined, WRAP_KEY_INFO, DERIVED_KEY_LENGTH);
	return xchacha20poly1305(wrapKey, nonce).decrypt(ciphertext);
}
