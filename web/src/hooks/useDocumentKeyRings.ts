import { useEffect, useState } from 'react';

import type { DocumentSummaryDTO } from '../api/docTypes';
import type { DocumentId } from '../api/ids';
import type { Session } from '../auth/session';
import { fetchKeyRing, type DocumentDEK } from '../crypto/documentDek';
import { loadIdentityKeyPair } from '../crypto/identityStore';

async function fetchDocKeyRingEntries(documents: DocumentSummaryDTO[], identityPrivate: Uint8Array): Promise<[DocumentId, DocumentDEK[]][]> {
	const entries = await Promise.all(
		documents.map(async (doc): Promise<[DocumentId, DocumentDEK[]] | null> => {
			try {
				const ring = await fetchKeyRing(doc.id, identityPrivate);
				return [doc.id, ring];
			} catch {
				return null;
			}
		}),
	);
	return entries.filter((entry): entry is [DocumentId, DocumentDEK[]] => entry !== null);
}

// One DEK per listed document, fetched and unwrapped in the background —
// the vault list can't show a real title without it. A missing entry means
// "still loading" or "pending" (this account joined via invite link and
// nobody has wrapped it yet); either way titleFor falls back to a
// placeholder instead of breaking.
export function useDocumentKeyRings(session: Session | null, documents: DocumentSummaryDTO[]) {
	const [docKeyRings, setDocKeyRings] = useState<Map<DocumentId, DocumentDEK[]>>(new Map());

	useEffect(() => {
		if (!session || documents.length === 0) {
			return;
		}
		let isCancelled = false;
		void (async () => {
			const identity = await loadIdentityKeyPair(session.user.user_id);
			if (isCancelled || !identity) {
				return;
			}
			const entries = await fetchDocKeyRingEntries(documents, identity.identityPrivate);
			if (isCancelled) {
				return;
			}
			setDocKeyRings((prev) => {
				const next = new Map(prev);
				for (const [id, ring] of entries) {
					next.set(id, ring);
				}
				return next;
			});
		})();

		return () => {
			isCancelled = true;
		};
	}, [session, documents]);

	return { docKeyRings, setDocKeyRings };
}
