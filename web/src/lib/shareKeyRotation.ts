import type { Dispatch, SetStateAction } from 'react';

import type { DocumentId, UserId } from '../api/ids';
import { clearDEKCache, fetchKeyRing, type DocumentDEK } from '../crypto/documentDek';
import { loadIdentityKeyPair } from '../crypto/identityStore';

/** Refreshes a document's key ring in the vault's local cache after a
 * ShareModal removal rotates its DEK — the vault list can't just reuse the
 * DEK it already held, since that's the one that was just rotated away. */
export async function rotateShareKey(
	docId: DocumentId,
	userId: UserId,
	setDocKeyRings: Dispatch<SetStateAction<Map<DocumentId, DocumentDEK[]>>>,
): Promise<void> {
	const identity = await loadIdentityKeyPair(userId);
	if (!identity) {
		return;
	}
	clearDEKCache(docId);
	try {
		const ring = await fetchKeyRing(docId, identity.identityPrivate);
		setDocKeyRings((prev) => new Map(prev).set(docId, ring));
	} catch {
		// Best-effort, same as before.
	}
}
