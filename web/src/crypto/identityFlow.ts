// Identity private keys live wrapped on the server (crypto/wrapPrivateKeys.ts),
// so any device that can derive wrapKey from the account password can
// recover the *same* identity instead of generating a new one each time.
import { ed25519, x25519 } from '@noble/curves/ed25519.js';

import { ApiError } from '../api/http';
import { getOwnWrappedPrivateKeys, setPublicKeys, setWrappedPrivateKeys } from '../api/keys';
import type { SetPublicKeysRequest, SetWrappedPrivateKeysRequest } from '../api/keysTypes';
import { base64ToBytes, bytesToBase64, generateIdentityKeyPair, type IdentityKeyPair } from './identity';
import { loadIdentityKeyPair, saveIdentityKeyPair } from './identityStore';
import { unwrapPrivateKeys, wrapPrivateKeys } from './wrapPrivateKeys';

async function publishIdentity(userId: string, wrapKey: Uint8Array, keys: IdentityKeyPair): Promise<void> {
	const publicKeysInput: SetPublicKeysRequest = { identity_pub: bytesToBase64(keys.identityPublic), signing_pub: bytesToBase64(keys.signingPublic) };
	await setPublicKeys(publicKeysInput);
	const wrapped = wrapPrivateKeys(wrapKey, keys);
	const wrappedPrivateKeysInput: SetWrappedPrivateKeysRequest = {
		ciphertext: bytesToBase64(wrapped.ciphertext),
		nonce: bytesToBase64(wrapped.nonce),
	};
	await setWrappedPrivateKeys(wrappedPrivateKeysInput);
	await saveIdentityKeyPair(userId, keys, true);
}

/** Called right after registration: this is the first device on this
 * account, so there's nothing to recover — generates a fresh identity,
 * publishes both halves (public in the clear, private wrapped with
 * wrapKey), and caches it locally. */
export async function setupIdentityForNewAccount(userId: string, wrapKey: Uint8Array): Promise<IdentityKeyPair> {
	const keys = generateIdentityKeyPair();
	await publishIdentity(userId, wrapKey, keys);
	return keys;
}

/** Called right after login: recovers this account's single true identity —
 * from this device's local cache if it's already there, otherwise by
 * fetching the wrapped blob and unwrapping it with wrapKey (derived from
 * the password that just authenticated). A decrypt failure here is a real
 * error (never silently fall back to garbage) — the only thing this
 * self-heals is a 404 (no wrapped keys published yet), which means an old
 * account with no published keys, not a wrong password. Never throws for
 * anything else the caller couldn't already infer from the prior login
 * having succeeded. */
export async function recoverIdentityOnLogin(userId: string, wrapKey: Uint8Array): Promise<IdentityKeyPair> {
	const cached = await loadIdentityKeyPair(userId);
	if (cached?.published) {
		return cached;
	}

	try {
		const dto = await getOwnWrappedPrivateKeys();
		const wrapped = {
			ciphertext: base64ToBytes(dto.ciphertext),
			nonce: base64ToBytes(dto.nonce),
		};
		const { identityPrivate, signingPrivate } = unwrapPrivateKeys(wrapKey, wrapped);
		const keys: IdentityKeyPair = {
			identityPrivate,
			identityPublic: x25519.getPublicKey(identityPrivate),
			signingPrivate,
			signingPublic: ed25519.getPublicKey(signingPrivate),
		};
		await saveIdentityKeyPair(userId, keys, true);
		return keys;
	} catch (e) {
		const hasNoPublishedKeysYet = e instanceof ApiError && e.code === 'private_keys_not_found';
		if (!hasNoPublishedKeysYet) {
			throw e;
		}

		const keys = generateIdentityKeyPair();
		await publishIdentity(userId, wrapKey, keys);
		return keys;
	}
}
