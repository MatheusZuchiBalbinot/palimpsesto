// Resolves the signing_pub needed to verify the Ed25519 signature of
// an update (verifyAndDecryptUpdateWithAnyKey in documentCipher.ts).
// Reuses the trust-on-first-use storage in crypto/knownKeys.ts — the
// same store that ShareModal and DocumentPage's pending-member
// reconciliation already populate — so a member whose key this browser
// already trusts never needs a network round trip just to verify their
// next update.
import type { UserId } from '../api/ids';
import { getPublicKeysByID } from '../api/keys';
import { base64ToBytes } from './identity';
import { checkKnownKey, getKnownKey, trustKey } from './knownKeys';

const sessionCache = new Map<UserId, Uint8Array | null>();

/** Resolves the signing_pub for userId, or null if it cannot be trusted —
 * the first time a key is seen it is trusted automatically (TOFU,
 * following the same model as the rest of the app), but a key that
 * conflicts with one already trusted for this user is never returned:
 * the caller must treat that update's signature as unverifiable, not
 * silently accept the new key ("warn on key change"). The network
 * lookup (by ID, not email — the author may no longer even be a member
 * of the document) only happens the first time within a session; after
 * that this is cheap and synchronous via the in-memory cache. */
export async function resolveTrustedSigningKey(userId: UserId): Promise<Uint8Array | null> {
	const cached = sessionCache.get(userId);
	if (cached !== undefined) {
		return cached;
	}

	const known = getKnownKey(userId);
	if (known) {
		const signingPub = base64ToBytes(known.signingPub);
		sessionCache.set(userId, signingPub);
		return signingPub;
	}

	try {
		const keys = await getPublicKeysByID(userId);
		const trust = checkKnownKey({ userId, identityPub: keys.identity_pub, signingPub: keys.signing_pub });
		if (trust === 'changed') {
			sessionCache.set(userId, null);
			return null;
		}
		if (trust === 'first-time') {
			trustKey({ userId, identityPub: keys.identity_pub, signingPub: keys.signing_pub });
		}
		const signingPub = base64ToBytes(keys.signing_pub);
		sessionCache.set(userId, signingPub);
		return signingPub;
	} catch {
		// Unreachable, or the account has no published keys — nothing to
		// verify against. Not cached: it's worth retrying on the next
		// update rather than giving up permanently for the rest of the
		// session.
		return null;
	}
}

/** resolveTrustedSigningKey for each distinct id in userIds, resolved
 * concurrently — for callers that need synchronous access afterward
 * (history reconstruction, re-run on every scrubber step or replay
 * tick) instead of resolving one signature at a time. */
export async function resolveTrustedSigningKeys(userIds: Iterable<UserId>): Promise<Map<UserId, Uint8Array | null>> {
	const distinct = [...new Set(userIds)];
	const resolved = await Promise.all(distinct.map((id) => resolveTrustedSigningKey(id)));
	return new Map(distinct.map((id, i) => [id, resolved[i]]));
}
