// A user's long-term identity keys — generated here, on the client, and
// never sent to the server in private form. Key hierarchy: identityPrivate
// (X25519) is for ECDH key agreement (wrapping/unwrapping document DEKs),
// signingPrivate (Ed25519) is for signing updates. Both follow the same
// curve25519 math, which is why @noble/curves ships them from a single
// module.
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';

export type IdentityKeyPair = {
	identityPrivate: Uint8Array;
	identityPublic: Uint8Array;
	signingPrivate: Uint8Array;
	signingPublic: Uint8Array;
};

/** Generates a brand-new identity key pair. Never reuses entropy between the
 * two curves — a fresh random secret for each, following the "every key has
 * one purpose" rule. */
export function generateIdentityKeyPair(): IdentityKeyPair {
	const identityPrivate = x25519.utils.randomSecretKey();
	const identityPublic = x25519.getPublicKey(identityPrivate);
	const { secretKey: signingPrivate, publicKey: signingPublic } = ed25519.keygen();
	return { identityPrivate, identityPublic, signingPrivate, signingPublic };
}

/** SHA-256(identity_pub || signing_pub) — the raw hash from which both the
 * fingerprint and the sigil are derived. Exposed separately from
 * formatFingerprint/Sigil.tsx because the sigil needs the raw bytes, not
 * the decimal-digit rendering. */
export function identityHash(identityPublic: Uint8Array, signingPublic: Uint8Array): Uint8Array {
	const combined = new Uint8Array(identityPublic.length + signingPublic.length);
	combined.set(identityPublic, 0);
	combined.set(signingPublic, identityPublic.length);
	return sha256(combined);
}

const FINGERPRINT_TOTAL_DIGITS = 60;
const FINGERPRINT_DIGITS_PER_GROUP = 5;
const DECIMAL_BASE = 10;

/** Renders a hash as 12 groups of 5 decimal digits — mirrors exactly the
 * formatFingerprint in server/internal/domain/user/keys.go (same algorithm,
 * same digit count), so a fingerprint computed on the client and the
 * server's response for the same keys always read identically. */
export function formatFingerprint(hash: Uint8Array): string {
	const digits: string[] = [];
	for (let i = 0; i < FINGERPRINT_TOTAL_DIGITS; i++) {
		digits.push(String(hash[i % hash.length] % DECIMAL_BASE));
	}

	const groups: string[] = [];
	for (let i = 0; i < digits.length; i += FINGERPRINT_DIGITS_PER_GROUP) {
		groups.push(digits.slice(i, i + FINGERPRINT_DIGITS_PER_GROUP).join(''));
	}
	return groups.join(' ');
}

export function computeFingerprint(identityPublic: Uint8Array, signingPublic: Uint8Array): string {
	return formatFingerprint(identityHash(identityPublic, signingPublic));
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
