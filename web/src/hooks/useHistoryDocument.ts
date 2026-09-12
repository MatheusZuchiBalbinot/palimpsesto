import { useEffect, useState } from 'react';

import { getDocument, getLatestSnapshot, listMembers, listUpdates } from '../api/docs';
import type { DocumentDTO, MemberDTO, UpdateItemDTO } from '../api/docTypes';
import type { DocumentId } from '../api/ids';
import type { Session } from '../auth/session';
import { resolveTrustedSigningKeys } from '../crypto/authorKeys';
import { decryptSnapshotWithAnyKey } from '../crypto/documentCipher';
import { fetchKeyRing, type DocumentDEK } from '../crypto/documentDek';
import { base64ToBytes } from '../crypto/identity';
import { loadIdentityKeyPair } from '../crypto/identityStore';

type HistorySession = Session | null;

/** The document info, member list, and raw update stream — the first of
 * History's three independent data-loading concerns (see
 * useHistoryDocument's comment for why this is split up). */
function useHistoryUpdates(id: DocumentId | undefined) {
	const [docInfo, setDocInfo] = useState<DocumentDTO | null>(null);
	const [members, setMembers] = useState<MemberDTO[]>([]);
	const [updates, setUpdates] = useState<UpdateItemDTO[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	// Resolved as soon as updates load — reconstructTextAt stays synchronous
	// (it reruns on every scrubber step and playback tick) by never
	// resolving a signing key over the network itself
	// (crypto/authorKeys.ts).
	const [authorSigningKeys, setAuthorSigningKeys] = useState<Map<string, Uint8Array | null>>(new Map());

	useEffect(() => {
		if (!id) {
			return;
		}
		let isCancelled = false;
		getDocument(id)
			.then((doc) => {
				if (!isCancelled) {
					setDocInfo(doc);
				}
			})
			.catch((e) => console.error('history: failed to load document info', e));
		listMembers(id)
			.then((items) => {
				if (!isCancelled) {
					setMembers(items);
				}
			})
			.catch((e) => console.error('history: failed to load members', e));
		listUpdates(id)
			.then((items) => {
				if (isCancelled) {
					return new Map<string, Uint8Array | null>();
				}
				setUpdates(items);
				setIsLoading(false);
				if (items.length > 0) {
					setSelectedId(items[items.length - 1].id);
				}
				return resolveTrustedSigningKeys(items.map((u) => u.author_id));
			})
			.then((keys) => {
				if (!isCancelled) {
					setAuthorSigningKeys(keys);
				}
			})
			.catch((e) => {
				console.error('history: failed to load updates', e);
				if (!isCancelled) {
					setIsLoading(false);
				}
			});
		return () => {
			isCancelled = true;
		};
	}, [id]);

	return { docInfo, members, updates, isLoading, selectedId, setSelectedId, authorSigningKeys };
}

/** The caller's key ring for this document — the second of History's
 * data-loading concerns. */
function useHistoryKeyRing(id: DocumentId | undefined, session: HistorySession) {
	const [documentKeyRing, setDocumentKeyRing] = useState<DocumentDEK[]>([]);

	useEffect(() => {
		if (!id || !session) {
			return;
		}
		let isCancelled = false;
		void (async () => {
			const identity = await loadIdentityKeyPair(session.user.user_id);
			if (isCancelled || !identity) {
				return;
			}
			try {
				const ring = await fetchKeyRing(id, identity.identityPrivate);
				if (!isCancelled) {
					setDocumentKeyRing(ring);
				}
			} catch (e) {
				console.error('history: failed to load key ring', e);
			}
		})();
		return () => {
			isCancelled = true;
		};
	}, [id, session]);

	return documentKeyRing;
}

/** The document's latest compaction snapshot, decrypted — the third of
 * History's data-loading concerns. Undefined until it's been fetched (or
 * confirmed that none exists) — reconstructTextAt seeds the replay with
 * this, since updates before a compacted document's snapshot no longer
 * exist server-side at all. */
function useHistorySnapshot(id: DocumentId | undefined, documentKeyRing: DocumentDEK[]) {
	const [snapshotPlaintext, setSnapshotPlaintext] = useState<Uint8Array | undefined>(undefined);

	useEffect(() => {
		if (!id || documentKeyRing.length === 0) {
			return;
		}
		let isCancelled = false;
		getLatestSnapshot(id)
			.then((snapshot) => {
				if (isCancelled || !snapshot) {
					return;
				}
				const plaintext = decryptSnapshotWithAnyKey(documentKeyRing, id, base64ToBytes(snapshot.ciphertext));
				setSnapshotPlaintext(plaintext);
			})
			.catch((e) => console.error('history: failed to load snapshot', e));
		return () => {
			isCancelled = true;
		};
	}, [id, documentKeyRing]);

	return snapshotPlaintext;
}

/** Composes History's three independent data-loading hooks (updates, key
 * ring, snapshot) into the single shape HistoryPage actually renders
 * from — split into three so each stays a single focused effect, instead
 * of one function juggling three unrelated endpoints. */
export function useHistoryDocument(id: DocumentId | undefined, session: HistorySession) {
	const { docInfo, members, updates, isLoading, selectedId, setSelectedId, authorSigningKeys } = useHistoryUpdates(id);
	const documentKeyRing = useHistoryKeyRing(id, session);
	const snapshotPlaintext = useHistorySnapshot(id, documentKeyRing);

	return {
		docInfo,
		members,
		updates,
		isLoading,
		selectedId,
		setSelectedId,
		documentKeyRing,
		authorSigningKeys,
		snapshotPlaintext,
	};
}
