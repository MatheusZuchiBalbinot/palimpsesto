import { describe, expect, it } from 'vitest';

import { deriveLoginKey, deriveMasterKey, deriveWrapKey, generateSaltMK } from '../../crypto/masterKey';

// Argon2id at the real m=64MiB/t=3 cost is slow by design — this suite
// gets a longer timeout instead of weakening the tested parameters.
const ARGON2_TEST_TIMEOUT_MS = 15_000;
const SALT_MK_LENGTH = 16;
const MASTER_KEY_LENGTH = 32;
const ARBITRARY_MASTER_KEY_FILL_BYTE = 9;
const TEST_PASSWORD = 'correct horse battery staple';

describe('generateSaltMK', () => {
	it('produces 16 random bytes, different each call', () => {
		const a = generateSaltMK();
		const b = generateSaltMK();
		expect(a).toHaveLength(SALT_MK_LENGTH);
		expect(a).not.toEqual(b);
	});
});

describe(
	'deriveMasterKey',
	() => {
		it(
			'is deterministic for the same password and salt',
			async () => {
				const salt = generateSaltMK();
				const a = await deriveMasterKey(TEST_PASSWORD, salt);
				const b = await deriveMasterKey(TEST_PASSWORD, salt);
				expect(a).toEqual(b);
			},
			ARGON2_TEST_TIMEOUT_MS,
		);

		it(
			'a different password produces a different master key',
			async () => {
				const salt = generateSaltMK();
				const a = await deriveMasterKey(TEST_PASSWORD, salt);
				const b = await deriveMasterKey('wrong horse battery staple', salt);
				expect(a).not.toEqual(b);
			},
			ARGON2_TEST_TIMEOUT_MS,
		);

		it(
			'a different salt produces a different master key for the same password',
			async () => {
				const a = await deriveMasterKey(TEST_PASSWORD, generateSaltMK());
				const b = await deriveMasterKey(TEST_PASSWORD, generateSaltMK());
				expect(a).not.toEqual(b);
			},
			ARGON2_TEST_TIMEOUT_MS,
		);

		it(
			'reports progress',
			async () => {
				const progress: number[] = [];
				await deriveMasterKey(TEST_PASSWORD, generateSaltMK(), (f) => progress.push(f));
				expect(progress.length).toBeGreaterThan(0);
				expect(progress[progress.length - 1]).toBe(1);
			},
			ARGON2_TEST_TIMEOUT_MS,
		);
	},
	ARGON2_TEST_TIMEOUT_MS,
);

describe('deriveLoginKey / deriveWrapKey', () => {
	it('are different from each other and from the master key', () => {
		const mk = new Uint8Array(MASTER_KEY_LENGTH).fill(ARBITRARY_MASTER_KEY_FILL_BYTE);
		const loginKey = deriveLoginKey(mk);
		const wrapKey = deriveWrapKey(mk);
		expect(loginKey).not.toEqual(wrapKey);
		expect(loginKey).not.toEqual(mk);
		expect(wrapKey).not.toEqual(mk);
	});

	it('are each deterministic for the same master key', () => {
		const mk = new Uint8Array(MASTER_KEY_LENGTH).fill(ARBITRARY_MASTER_KEY_FILL_BYTE);
		expect(deriveLoginKey(mk)).toEqual(deriveLoginKey(mk));
		expect(deriveWrapKey(mk)).toEqual(deriveWrapKey(mk));
	});
});
