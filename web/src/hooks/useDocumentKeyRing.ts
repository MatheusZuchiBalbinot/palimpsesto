import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/http';
import type { DocumentId } from '../api/ids';
import type { Session } from '../auth/session';
import { fetchKeyRing, type DocumentDEK } from '../crypto/documentDek';
import { loadIdentityKeyPair } from '../crypto/identityStore';

export type DocumentKeyState = {
	documentKey: DocumentDEK | null;
	documentKeyRing: DocumentDEK[];
	keyStatus: 'loading' | 'ready' | 'pending' | 'error';
};

// Fetches and unwraps the document's DEK before anything else can happen —
// the editor, the title, the history, everything needs this first.
// 'pending' is a real and expected state (joined via invite link, no
// existing member has wrapped the key for this account yet), not an error —
// see the pending-member reconciliation in useKeyConflicts, which is what
// eventually resolves this for the *next* person in that state.
export function useDocumentKeyRing(id: DocumentId | undefined, session: Session | null) {
	const [documentKey, setDocumentKey] = useState<DocumentDEK | null>(null);
	// Every DEK this account has legitimate access to for this document —
	// documentKey.dek plus whatever is archived from a rotation this account
	// has followed. Only decrypting potentially-old ciphertext (the title,
	// history replay on join) needs this; anything this session *writes*
	// always uses documentKey, the current epoch.
	const [documentKeyRing, setDocumentKeyRing] = useState<DocumentDEK[]>([]);
	const [keyStatus, setKeyStatus] = useState<DocumentKeyState['keyStatus']>('loading');
	// Incremented after removing a member rotates the document key
	// (ShareModal's onKeyRotated), to force the fetch effect below to run
	// again — without this it only depends on id/session, and neither of
	// those changes here.
	const [keyRefreshToken, setKeyRefreshToken] = useState(0);

	useEffect(() => {
		if (!id || !session) {
			return;
		}
		let isCancelled = false;
		// Resets on every id change (not just on mount) — DocumentPage doesn't
		// remount between two documents under the same route, so without this
		// the previous document's key/status would persist into the next one
		// until the new fetch resolves.
		// oxlint-disable-next-line react/set-state-in-effect -- intentional: synchronizing with the id param, not a derivable render value
		setKeyStatus('loading');
		setDocumentKey(null);
		setDocumentKeyRing([]);

		void (async () => {
			const identity = await loadIdentityKeyPair(session.user.user_id);
			if (isCancelled) {
				return;
			}
			if (!identity) {
				setKeyStatus('error');
				return;
			}

			try {
				const ring = await fetchKeyRing(id, identity.identityPrivate);
				if (isCancelled) {
					return;
				}
				setDocumentKey(ring[0]);
				setDocumentKeyRing(ring);
				setKeyStatus('ready');
			} catch (e) {
				if (isCancelled) {
					return;
				}
				const isPending = e instanceof ApiError && e.code === 'pending_wrapped_dek';
				setKeyStatus(isPending ? 'pending' : 'error');
			}
		})();

		return () => {
			isCancelled = true;
		};
	}, [id, session, keyRefreshToken]);

	const bumpKeyRefresh = useCallback(() => setKeyRefreshToken((n) => n + 1), []);

	return { documentKey, documentKeyRing, keyStatus, bumpKeyRefresh };
}
