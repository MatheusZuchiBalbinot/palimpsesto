import { describe, expect, it } from 'vitest';

import { generateIdentityKeyPair } from '../../crypto/identity';
import { unwrapPrivateKeys, wrapPrivateKeys } from '../../crypto/wrapPrivateKeys';

const WRAP_KEY_LENGTH = 32;
const WRAP_KEY_FILL_BYTE = 3;
const WRONG_WRAP_KEY_FILL_BYTE = 99;

describe('wrapPrivateKeys / unwrapPrivateKeys', () => {
	it('round-trips the private keys', () => {
		const keys = generateIdentityKeyPair();
		const wrapKey = new Uint8Array(WRAP_KEY_LENGTH).fill(WRAP_KEY_FILL_BYTE);

		const wrapped = wrapPrivateKeys(wrapKey, keys);
		const unwrapped = unwrapPrivateKeys(wrapKey, wrapped);

		expect(unwrapped.identityPrivate).toEqual(keys.identityPrivate);
		expect(unwrapped.signingPrivate).toEqual(keys.signingPrivate);
	});

	it('uses a fresh nonce every time', () => {
		const keys = generateIdentityKeyPair();
		const wrapKey = new Uint8Array(WRAP_KEY_LENGTH).fill(WRAP_KEY_FILL_BYTE);

		const a = wrapPrivateKeys(wrapKey, keys);
		const b = wrapPrivateKeys(wrapKey, keys);
		expect(a.nonce).not.toEqual(b.nonce);
		expect(a.ciphertext).not.toEqual(b.ciphertext);
	});

	it('throws rather than silently returning garbage for the wrong wrapKey', () => {
		const keys = generateIdentityKeyPair();
		const wrapped = wrapPrivateKeys(new Uint8Array(WRAP_KEY_LENGTH).fill(WRAP_KEY_FILL_BYTE), keys);
		const wrongWrapKey = new Uint8Array(WRAP_KEY_LENGTH).fill(WRONG_WRAP_KEY_FILL_BYTE);
		expect(() => unwrapPrivateKeys(wrongWrapKey, wrapped)).toThrow();
	});

	it('throws on a tampered ciphertext', () => {
		const keys = generateIdentityKeyPair();
		const wrapKey = new Uint8Array(WRAP_KEY_LENGTH).fill(WRAP_KEY_FILL_BYTE);
		const wrapped = wrapPrivateKeys(wrapKey, keys);
		wrapped.ciphertext[0] ^= 0xff;
		expect(() => unwrapPrivateKeys(wrapKey, wrapped)).toThrow();
	});
});
