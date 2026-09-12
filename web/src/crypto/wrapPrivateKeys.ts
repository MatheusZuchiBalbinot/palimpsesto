// Wraps/unwraps the identity private keys with wrapKey ("identityPrivate
// (X25519) + signingPrivate (Ed25519) kept encrypted ON THE SERVER").
// XChaCha20-Poly1305 — a random 24-byte nonce per encryption, safe to
// generate with no coordination at all (unlike AES-GCM's 12-byte nonce,
// which can't be trusted to never collide across many documents/keys
// without a counter).
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';

import type { IdentityKeyPair } from './identity';

export const WRAP_NONCE_LENGTH = 24;

export type WrappedPrivateKeys = {
	ciphertext: Uint8Array;
	nonce: Uint8Array;
};

/** Packs the two private scalars into a single plaintext buffer before
 * sealing — one ciphertext/nonce pair to store and fetch, instead of
 * two. */
function packPrivateKeys(keys: Pick<IdentityKeyPair, 'identityPrivate' | 'signingPrivate'>): Uint8Array {
	const packed = new Uint8Array(keys.identityPrivate.length + keys.signingPrivate.length);
	packed.set(keys.identityPrivate, 0);
	packed.set(keys.signingPrivate, keys.identityPrivate.length);
	return packed;
}

export function wrapPrivateKeys(wrapKey: Uint8Array, keys: Pick<IdentityKeyPair, 'identityPrivate' | 'signingPrivate'>): WrappedPrivateKeys {
	const nonce = randomBytes(WRAP_NONCE_LENGTH);
	const ciphertext = xchacha20poly1305(wrapKey, nonce).encrypt(packPrivateKeys(keys));
	return { ciphertext, nonce };
}

/** Unwraps a previously wrapped private key blob. Throws if wrapKey is
 * wrong or the ciphertext has been tampered with — a decrypt failure is
 * always an error here, never a silent fallback: a wrong password needs
 * to surface as "wrong password", not as invalid keys that silently
 * fail to decrypt anything further down the line. */
export function unwrapPrivateKeys(wrapKey: Uint8Array, wrapped: WrappedPrivateKeys): Pick<IdentityKeyPair, 'identityPrivate' | 'signingPrivate'> {
	const packed = xchacha20poly1305(wrapKey, wrapped.nonce).decrypt(wrapped.ciphertext);
	const identityPrivateLength = 32;
	return {
		identityPrivate: packed.slice(0, identityPrivateLength),
		signingPrivate: packed.slice(identityPrivateLength),
	};
}
