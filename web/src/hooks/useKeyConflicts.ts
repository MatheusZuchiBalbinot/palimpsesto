import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { setMemberWrappedDEK } from '../api/docs';
import type { MemberDTO } from '../api/docTypes';
import type { DocumentId, UserId } from '../api/ids';
import type { DocumentDEK } from '../crypto/documentDek';
import { base64ToBytes, bytesToBase64 } from '../crypto/identity';
import { trustKey } from '../crypto/knownKeys';
import { seal } from '../crypto/sealedBox';
import { reconcilePendingMember, type PendingMemberConflict } from '../lib/pendingMemberAccess';
import type { DocumentKeyState } from './useDocumentKeyRing';

export type KeyConflict = PendingMemberConflict;

function addKeyConflict(prev: KeyConflict[], conflict: KeyConflict): KeyConflict[] {
	return prev.some((c) => c.userId === conflict.userId) ? prev : [...prev, conflict];
}

type CreateKeyConflictActionsParams = {
	id: DocumentId | undefined;
	documentKey: DocumentDEK | null;
	setKeyConflicts: Dispatch<SetStateAction<KeyConflict[]>>;
};

function createKeyConflictActions({ id, documentKey, setKeyConflicts }: CreateKeyConflictActionsParams) {
	async function handleTrustKeyConflict(conflict: KeyConflict) {
		trustKey({ userId: conflict.userId, identityPub: conflict.identityPub, signingPub: conflict.signingPub });
		setKeyConflicts((prev) => prev.filter((c) => c.userId !== conflict.userId));
		if (!id || !documentKey) {
			return;
		}
		try {
			const wrapped = seal(base64ToBytes(conflict.identityPub), documentKey.dek);
			await setMemberWrappedDEK(id, conflict.userId, { wrapped_dek: bytesToBase64(wrapped) });
		} catch {
			// Best-effort, same as the reconciliation this conflict came from.
		}
	}

	function handleDismissKeyConflict(userId: UserId) {
		setKeyConflicts((prev) => prev.filter((c) => c.userId !== userId));
	}

	return { handleTrustKeyConflict, handleDismissKeyConflict };
}

export type UseKeyConflictsParams = {
	id: DocumentId | undefined;
	keyStatus: DocumentKeyState['keyStatus'];
	documentKey: DocumentDEK | null;
	members: MemberDTO[];
};

// Pending-member reconciliation: a member who joined via invite link
// doesn't have a wrapped DEK yet — any existing member (this one, once
// their own key is ready) opportunistically fills this in the next time
// they have both the DEK and the member list loaded. Best-effort and
// silent: this isn't a current-user action to report success or failure
// for, it's just background maintenance.
export function useKeyConflicts({ id, keyStatus, documentKey, members }: UseKeyConflictsParams) {
	const [keyConflicts, setKeyConflicts] = useState<KeyConflict[]>([]);

	useEffect(() => {
		if (!id || keyStatus !== 'ready' || !documentKey) {
			return;
		}
		const pendingMembers = members.filter((m) => !m.has_wrapped_dek);
		if (pendingMembers.length === 0) {
			return;
		}

		let isCancelled = false;
		void (async () => {
			for (const member of pendingMembers) {
				if (isCancelled) {
					return;
				}
				const conflict = await reconcilePendingMember(id, member, documentKey.dek);
				if (conflict) {
					setKeyConflicts((prev) => addKeyConflict(prev, conflict));
				}
			}
		})();

		return () => {
			isCancelled = true;
		};
	}, [id, keyStatus, documentKey, members]);

	const keyConflictActionsInput: CreateKeyConflictActionsParams = { id, documentKey, setKeyConflicts };
	const { handleTrustKeyConflict, handleDismissKeyConflict } = createKeyConflictActions(keyConflictActionsInput);

	return { keyConflicts, handleTrustKeyConflict, handleDismissKeyConflict };
}
