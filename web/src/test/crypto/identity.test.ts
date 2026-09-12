import { x25519 } from '@noble/curves/ed25519.js';
import { describe, expect, it } from 'vitest';

import { base64ToBytes, bytesToBase64, computeFingerprint, formatFingerprint, generateIdentityKeyPair } from '../../crypto/identity';

const X25519_KEY_LENGTH = 32;

describe('generateIdentityKeyPair', () => {
	it('produces keys of the expected sizes', () => {
		const keys = generateIdentityKeyPair();
		expect(keys.identityPrivate).toHaveLength(X25519_KEY_LENGTH);
		expect(keys.identityPublic).toHaveLength(X25519_KEY_LENGTH);
		expect(keys.signingPrivate).toHaveLength(X25519_KEY_LENGTH);
		expect(keys.signingPublic).toHaveLength(X25519_KEY_LENGTH);
	});

	it('produces different keys on every call', () => {
		const a = generateIdentityKeyPair();
		const b = generateIdentityKeyPair();
		expect(a.identityPrivate).not.toEqual(b.identityPrivate);
		expect(a.signingPrivate).not.toEqual(b.signingPrivate);
	});

	// The whole point of the identity_pub key: two people can actually agree
	// on a shared secret with it (that's what envelope encryption depends on).
	it('the identity key pair actually works for X25519 ECDH', () => {
		const alice = generateIdentityKeyPair();
		const bob = generateIdentityKeyPair();

		const sharedFromAlice = x25519.getSharedSecret(alice.identityPrivate, bob.identityPublic);
		const sharedFromBob = x25519.getSharedSecret(bob.identityPrivate, alice.identityPublic);
		expect(bytesToBase64(sharedFromAlice)).toBe(bytesToBase64(sharedFromBob));
	});
});

const FINGERPRINT_GROUP_COUNT = 12;
const ARBITRARY_HASH_FILL_BYTE = 9;

describe('formatFingerprint', () => {
	it('produces 12 groups of 5 digits', () => {
		const hash = new Uint8Array(X25519_KEY_LENGTH).fill(ARBITRARY_HASH_FILL_BYTE);
		const fp = formatFingerprint(hash);
		const groups = fp.split(' ');
		expect(groups).toHaveLength(FINGERPRINT_GROUP_COUNT);
		for (const g of groups) {
			expect(g).toMatch(/^\d{5}$/);
		}
	});

	it('matches a hand-computed value for a known hash', () => {
		// hash[i % 32] % 10, for i in 0..59 — byte 0 is 5, so digit 0 is 5;
		// byte 1 is 250 % 10 = 0. The specific values 5/250 are the point of
		// the test (chosen to check the digit math by hand), not domain
		// constants, so they stay as literals here.
		const hash = new Uint8Array(X25519_KEY_LENGTH);
		hash[0] = 5;
		hash[1] = 250;
		const fp = formatFingerprint(hash);
		expect(fp.startsWith('50')).toBe(true);
	});
});

describe('computeFingerprint', () => {
	it('is deterministic', () => {
		const keys = generateIdentityKeyPair();
		const a = computeFingerprint(keys.identityPublic, keys.signingPublic);
		const b = computeFingerprint(keys.identityPublic, keys.signingPublic);
		expect(a).toBe(b);
	});

	it('differs for different keys', () => {
		const a = generateIdentityKeyPair();
		const b = generateIdentityKeyPair();
		expect(computeFingerprint(a.identityPublic, a.signingPublic)).not.toBe(computeFingerprint(b.identityPublic, b.signingPublic));
	});
});

describe('base64 round-trip', () => {
	it('bytesToBase64/base64ToBytes round-trips arbitrary bytes', () => {
		// eslint-disable-next-line no-magic-numbers -- arbitrary test payload
		const original = new Uint8Array([0, 1, 2, 253, 254, 255, 42]);
		expect(base64ToBytes(bytesToBase64(original))).toEqual(original);
	});
});
