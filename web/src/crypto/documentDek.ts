// Fetches, caches, and generates a document's DEK. The DEK itself only
// ever exists in memory here — unlike identity private keys
// (crypto/identityStore.ts), it's cheap to re-derive on every page load
// (a GET + a local unseal, no Argon2id), so there's no reason to persist
// it to localStorage and give it a longer on-disk lifetime than
// necessary.
import { getKeyHistory, getWrappedDEK, setMemberWrappedDEK } from '../api/docs';
import type { DocumentId, UserId } from '../api/ids';
import { base64ToBytes, bytesToBase64 } from './identity';
import { seal, unseal } from './sealedBox';

export type DocumentDEK = {
	dek: Uint8Array;
	keyEpoch: number;
};

const cache = new Map<DocumentId, DocumentDEK>();
const keyRingCache = new Map<DocumentId, DocumentDEK[]>();
const DEK_LENGTH = 32;

export function generateDEK(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(DEK_LENGTH));
}

/** Fetches and unwraps a document's DEK for the caller, or returns the
 * cached copy from earlier in this page session. Throws ApiError with
 * code 'pending_wrapped_dek' if the caller is a member but nobody's
 * wrapped the DEK for them yet (see documentPendingMembers.ts for the
 * reconciliation that resolves that), or a decrypt error if
 * ownIdentityPrivate is wrong — never silently returns garbage. */
export async function fetchAndUnwrapDEK(docId: DocumentId, ownIdentityPrivate: Uint8Array): Promise<DocumentDEK> {
	const cached = cache.get(docId);
	if (cached) {
		return cached;
	}

	const dto = await getWrappedDEK(docId);
	const dek = unseal(ownIdentityPrivate, base64ToBytes(dto.wrapped_dek));
	const result: DocumentDEK = { dek, keyEpoch: dto.key_epoch };
	cache.set(docId, result);
	return result;
}

/** Generates a new DEK and wraps it for the caller's own identity — called
 * once, right after creating a document (there's nobody to share with
 * yet, nor an existing wrapped copy to unwrap). */
export async function createAndWrapOwnDEK(docId: DocumentId, ownUserId: UserId, ownIdentityPublic: Uint8Array): Promise<DocumentDEK> {
	const dek = generateDEK();
	const wrapped = seal(ownIdentityPublic, dek);
	await setMemberWrappedDEK(docId, ownUserId, { wrapped_dek: bytesToBase64(wrapped) });
	const result: DocumentDEK = { dek, keyEpoch: 1 };
	cache.set(docId, result);
	return result;
}

/** Fetches every DEK the caller has legitimate access to for a document —
 * the current epoch's (via fetchAndUnwrapDEK) plus every older epoch
 * archived for them by a rotation they lived through ("client decrypts
 * per-epoch, keeping old keys around for history"). Current epoch first,
 * since that's by far the most common case when decrypting a live
 * update. Cached alongside the single-DEK cache; clearDEKCache
 * invalidates both. */
export async function fetchKeyRing(docId: DocumentId, ownIdentityPrivate: Uint8Array): Promise<DocumentDEK[]> {
	const cached = keyRingCache.get(docId);
	if (cached) {
		return cached;
	}

	const current = await fetchAndUnwrapDEK(docId, ownIdentityPrivate);
	const history = await getKeyHistory(docId);
	const ring: DocumentDEK[] = [
		current,
		...history.map((h) => ({
			dek: unseal(ownIdentityPrivate, base64ToBytes(h.wrapped_dek)),
			keyEpoch: h.key_epoch,
		})),
	];
	keyRingCache.set(docId, ring);
	return ring;
}

export function clearDEKCache(docId: DocumentId): void {
	cache.delete(docId);
	keyRingCache.delete(docId);
}
