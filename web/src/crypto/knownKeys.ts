// "Warn on key change" — trust-on-first-use (TOFU) for OTHER users'
// identity keys. The server distributes public keys; if it ever lies
// (a compromise, or a malicious server from the start), the only
// client-side defense is noticing that the key is not the same one
// this browser saw last time, and refusing to silently wrap a
// document key against it. This module only compares — it never
// fetches, nor decides on its own that a key is safe to trust.
import type { UserId } from '../api/ids';

const STORAGE_PREFIX = 'palimpsesto:knownKey:';

type KnownKey = {
	identityPub: string;
	signingPub: string;
};

/** identityPub and signingPub are two different base64 blobs of the same
 * shape (`string`) — passed as a named object, not positionally, so a
 * caller can't silently transpose them the way three positional `string`
 * parameters would allow. */
export type KeyIdentity = {
	userId: UserId;
	identityPub: string;
	signingPub: string;
};

function load(userId: UserId): KnownKey | null {
	try {
		const raw = localStorage.getItem(STORAGE_PREFIX + userId);
		if (!raw) {
			return null;
		}
		return JSON.parse(raw) as KnownKey;
	} catch {
		return null;
	}
}

export type KeyTrustStatus = 'first-time' | 'unchanged' | 'changed';

/** Returns whatever this browser currently trusts for userId, or null
 * if it has never seen them before. Read-only — same guarantee as
 * checkKnownKey, just returning the value instead of a comparison. */
export function getKnownKey(userId: UserId): KnownKey | null {
	return load(userId);
}

/** Compares against the last key this browser trusted for this user.
 * Never writes — trustKey() is the only thing authorized to do that,
 * and only after the caller has explicitly confirmed a change. */
export function checkKnownKey({ userId, identityPub, signingPub }: KeyIdentity): KeyTrustStatus {
	const known = load(userId);
	if (!known) {
		return 'first-time';
	}
	if (known.identityPub === identityPub && known.signingPub === signingPub) {
		return 'unchanged';
	}
	return 'changed';
}

/** Records identityPub/signingPub as trusted for this user — call once
 * on first sight (TOFU) or after the user explicitly confirms a key
 * change out of band. */
export function trustKey({ userId, identityPub, signingPub }: KeyIdentity): void {
	try {
		localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify({ identityPub, signingPub } satisfies KnownKey));
	} catch {
		// best effort: if storage is unavailable, this just makes TOFU fire again next time
	}
}
