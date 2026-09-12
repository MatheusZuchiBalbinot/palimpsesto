import { useMemo } from 'react';

import type { UpdateItemDTO } from '../api/docTypes';
import type { DocumentDEK } from '../crypto/documentDek';
import { computeGroupDeltas, type ComputeGroupDeltasParams, type GroupDelta, type VersionGroup } from '../lib/yjsHistory';

export type UseGroupDeltasParams = {
	updates: UpdateItemDTO[];
	groups: VersionGroup[];
	docId: string | undefined;
	documentKeyRing: DocumentDEK[];
	authorSigningKeys: Map<string, Uint8Array | null>;
	snapshotPlaintext: Uint8Array | undefined;
};

/** The per-version "+240 −12" summary (UX_REVIEW.md 5.2) — memoized the
 * same way useReconstructedText is, since it's a full decrypt-and-replay
 * pass over every update. */
export function useGroupDeltas({
	updates,
	groups,
	docId,
	documentKeyRing,
	authorSigningKeys,
	snapshotPlaintext,
}: UseGroupDeltasParams): Map<number, GroupDelta> {
	const hasSigningKeysReady = updates.length === 0 || authorSigningKeys.size > 0;
	const canCompute = !!docId && documentKeyRing.length > 0 && hasSigningKeysReady;

	return useMemo(() => {
		if (!canCompute || !docId) {
			return new Map<number, GroupDelta>();
		}
		const input: ComputeGroupDeltasParams = { updates, groups, docId, keyRing: documentKeyRing, authorSigningKeys, snapshotPlaintext };
		return computeGroupDeltas(input);
	}, [canCompute, docId, updates, groups, documentKeyRing, authorSigningKeys, snapshotPlaintext]);
}
