import { useMemo } from 'react';

import type { UpdateItemDTO } from '../api/docTypes';
import type { DocumentDEK } from '../crypto/documentDek';
import { reconstructTextAt, type ReconstructTextAtParams } from '../lib/yjsHistory';

export type UseReconstructedTextParams = {
	updates: UpdateItemDTO[];
	selectedId: number | null;
	docId: string | undefined;
	documentKeyRing: DocumentDEK[];
	authorSigningKeys: Map<string, Uint8Array | null>;
	snapshotPlaintext: Uint8Array | undefined;
};

/** The replayed text at the point selectedId marks — memoized since
 * decryption plus a full CRDT replay is real work that shouldn't rerun
 * on every render (e.g. `isRestoring` changing while a restore is in
 * progress), only when one of its actual inputs changed. */
export function useReconstructedText({
	updates,
	selectedId,
	docId,
	documentKeyRing,
	authorSigningKeys,
	snapshotPlaintext,
}: UseReconstructedTextParams): string {
	// A signing key can take a network round trip to resolve the first
	// time (crypto/authorKeys.ts) — reconstructing before every update's
	// author is resolved would verify some of them against a key that
	// simply doesn't exist yet. Skipped entirely when there are no updates
	// (a fresh, still-empty document).
	const hasSigningKeysReady = updates.length === 0 || authorSigningKeys.size > 0;
	const canReconstructText = selectedId !== null && !!docId && documentKeyRing.length > 0 && hasSigningKeysReady;

	return useMemo(() => {
		if (!canReconstructText) {
			return '';
		}
		const reconstructInput: ReconstructTextAtParams = {
			updates,
			upToId: selectedId,
			docId,
			keyRing: documentKeyRing,
			authorSigningKeys,
			snapshotPlaintext,
		};
		return reconstructTextAt(reconstructInput);
	}, [canReconstructText, updates, selectedId, docId, documentKeyRing, authorSigningKeys, snapshotPlaintext]);
}
