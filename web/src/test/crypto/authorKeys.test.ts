import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toUserId } from '../../api/ids';
import { getPublicKeysByID } from '../../api/keys';
import { resolveTrustedSigningKey, resolveTrustedSigningKeys } from '../../crypto/authorKeys';
import { bytesToBase64, generateIdentityKeyPair } from '../../crypto/identity';

vi.mock('../../api/keys', () => ({
	getPublicKeysByID: vi.fn(),
}));

const mockedGetPublicKeysByID = vi.mocked(getPublicKeysByID);

describe('resolveTrustedSigningKey', () => {
	beforeEach(() => {
		localStorage.clear();
		mockedGetPublicKeysByID.mockReset();
	});

	it('fetches and trusts a key on first sight (TOFU), then never fetches again', async () => {
		const alice = generateIdentityKeyPair();
		mockedGetPublicKeysByID.mockResolvedValue({
			user_id: toUserId('alice'),
			identity_pub: bytesToBase64(alice.identityPublic),
			signing_pub: bytesToBase64(alice.signingPublic),
			fingerprint: 'irrelevant',
			display_name: 'irrelevant',
		});

		const first = await resolveTrustedSigningKey(toUserId('alice'));
		expect(first).not.toBeNull();
		expect(Array.from(first!)).toEqual(Array.from(alice.signingPublic));
		expect(mockedGetPublicKeysByID).toHaveBeenCalledTimes(1);

		const second = await resolveTrustedSigningKey(toUserId('alice'));
		expect(Array.from(second!)).toEqual(Array.from(alice.signingPublic));
		expect(mockedGetPublicKeysByID).toHaveBeenCalledTimes(1); // cached, no second lookup
	});

	it('refuses to trust a key that conflicts with one already trusted for that user', async () => {
		// A fresh user id (never touched by this module's in-memory cache
		// in this test run) whose localStorage entry already has a
		// trusted key — simulates a browser that has already seen bob's
		// real key before, now asked to verify an update that claims to
		// be from bob but whose fetched key is actually an impostor's.
		const bobReal = generateIdentityKeyPair();
		const impostor = generateIdentityKeyPair();
		localStorage.setItem(
			'palimpsesto:knownKey:bob-conflict',
			JSON.stringify({
				identityPub: bytesToBase64(bobReal.identityPublic),
				signingPub: bytesToBase64(bobReal.signingPublic),
			}),
		);
		mockedGetPublicKeysByID.mockResolvedValue({
			user_id: toUserId('bob-conflict'),
			identity_pub: bytesToBase64(impostor.identityPublic),
			signing_pub: bytesToBase64(impostor.signingPublic),
			fingerprint: 'irrelevant',
			display_name: 'irrelevant',
		});

		const resolved = await resolveTrustedSigningKey(toUserId('bob-conflict'));
		expect(resolved).not.toBeNull();
		expect(Array.from(resolved!)).toEqual(Array.from(bobReal.signingPublic));
		expect(Array.from(resolved!)).not.toEqual(Array.from(impostor.signingPublic));
		// The conflicting fetched key should never even reach the network
		// on this path — the local getKnownKey record already resolves it.
		expect(mockedGetPublicKeysByID).not.toHaveBeenCalled();
	});

	it('returns null when the account has no published keys', async () => {
		mockedGetPublicKeysByID.mockRejectedValue(new Error('404'));
		const result = await resolveTrustedSigningKey(toUserId('nobody'));
		expect(result).toBeNull();
	});
});

describe('resolveTrustedSigningKeys', () => {
	beforeEach(() => {
		localStorage.clear();
		mockedGetPublicKeysByID.mockReset();
	});

	it('resolves every distinct user id concurrently', async () => {
		const ALICE_BULK_ID = 'alice-bulk';
		const alice = generateIdentityKeyPair();
		const bob = generateIdentityKeyPair();
		// Needs to stay async with no internal await: mocking a function
		// whose real implementation returns a Promise, so the caller that
		// awaits it needs this to actually resolve as one.
		// eslint-disable-next-line @typescript-eslint/require-await
		mockedGetPublicKeysByID.mockImplementation(async (userId) => ({
			user_id: userId,
			identity_pub: bytesToBase64(userId === ALICE_BULK_ID ? alice.identityPublic : bob.identityPublic),
			signing_pub: bytesToBase64(userId === ALICE_BULK_ID ? alice.signingPublic : bob.signingPublic),
			fingerprint: 'irrelevant',
			display_name: 'irrelevant',
		}));

		const keys = await resolveTrustedSigningKeys([toUserId(ALICE_BULK_ID), toUserId('bob-bulk'), toUserId(ALICE_BULK_ID)]);
		expect(keys.size).toBe(2);
		expect(Array.from(keys.get(toUserId(ALICE_BULK_ID))!)).toEqual(Array.from(alice.signingPublic));
		expect(Array.from(keys.get(toUserId('bob-bulk'))!)).toEqual(Array.from(bob.signingPublic));
		expect(mockedGetPublicKeysByID).toHaveBeenCalledTimes(2); // deduplicated, not 3
	});
});
