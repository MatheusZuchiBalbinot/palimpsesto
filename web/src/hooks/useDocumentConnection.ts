import type { TFunction } from 'i18next';
import { useEffect, useState, type RefObject } from 'react';

import type { DocumentId, UserId } from '../api/ids';
import type { Session } from '../auth/session';
import type { DocumentDEK } from '../crypto/documentDek';
import { loadIdentityKeyPair } from '../crypto/identityStore';
import { connectDocument, type ConnectDocumentParams, type ConnectionStateSetters } from '../realtime/documentConnection';
import type { ConnectionStatus } from '../realtime/provider';

type OpenDocumentConnectionEffectParams = {
	id: DocumentId | undefined;
	session: Session | null;
	documentKey: DocumentDEK | null;
	documentKeyRing: DocumentDEK[];
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	t: TFunction;
	setters: ConnectionStateSetters;
};

function openDocumentConnectionEffect(params: OpenDocumentConnectionEffectParams): () => void {
	const { id, session, documentKey, documentKeyRing, textareaRef, t, setters } = params;
	const textarea = textareaRef.current;

	let isCancelled = false;
	let cleanup: (() => void) | undefined;

	if (id && textarea && session && documentKey && documentKeyRing.length > 0) {
		// loadIdentityKeyPair is async (crypto/identityStore.ts's non-extractable
		// device key needs a WebCrypto round-trip) — everything past this point
		// used to run synchronously within the effect; isCancelled now guards
		// it the same way connectDocument's own async result already was below.
		void (async () => {
			const identity = await loadIdentityKeyPair(session.user.user_id);
			if (isCancelled || !identity) {
				return;
			}

			// oxlint-disable-next-line react/set-state-in-effect -- intentional: resets presence for the new connection this effect is about to open, not a derivable render value
			setters.setOnlineUserIds(new Set([session.user.user_id]));

			const connectDocumentInput: ConnectDocumentParams = {
				id,
				session,
				identity,
				documentKey,
				documentKeyRing,
				textarea,
				t,
				setters,
				isCancelled: () => isCancelled,
			};
			// If a future change to connectDocument/wireEditorSession ever adds an
			// await after its own isCancelled() checks settle, this handles it too
			// instead of relying solely on connectDocument's internal guards to
			// keep this in sync — a cleanup that arrives after isCancelled flips
			// runs immediately instead of being silently dropped into `cleanup`,
			// which would otherwise leak a live DocProvider (socket + timers).
			const c = await connectDocument(connectDocumentInput);
			if (isCancelled) {
				c?.();
				return;
			}
			cleanup = c;
		})();
	}

	return () => {
		isCancelled = true;
		cleanup?.();
	};
}

export type UseDocumentConnectionParams = {
	id: DocumentId | undefined;
	session: Session | null;
	documentKey: DocumentDEK | null;
	documentKeyRing: DocumentDEK[];
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	t: TFunction;
};

export function useDocumentConnection({ id, session, documentKey, documentKeyRing, textareaRef, t }: UseDocumentConnectionParams) {
	const [onlineUserIds, setOnlineUserIds] = useState<Set<UserId>>(new Set());
	const [awayUserIds, setAwayUserIds] = useState<Set<UserId>>(new Set());
	const [typingUserIds, setTypingUserIds] = useState<Set<UserId>>(new Set());
	const [status, setStatus] = useState<ConnectionStatus>('connecting');
	const [pendingCount, setPendingCount] = useState(0);
	const [charCount, setCharCount] = useState(0);
	const [wordCountValue, setWordCountValue] = useState(0);
	const setters: ConnectionStateSetters = {
		setStatus,
		setPendingCount,
		setOnlineUserIds,
		setAwayUserIds,
		setTypingUserIds,
		setCharCount,
		setWordCountValue,
	};

	useEffect(() => {
		const effectInput: OpenDocumentConnectionEffectParams = { id, session, documentKey, documentKeyRing, textareaRef, t, setters };
		return openDocumentConnectionEffect(effectInput);
		// setters is a fresh object every render (its fields are the stable
		// setState functions above) — including it here would reconnect on
		// every render instead of only when the connection's own inputs change.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id, session, documentKey, documentKeyRing, t, textareaRef]);

	return {
		onlineUserIds,
		setOnlineUserIds,
		awayUserIds,
		typingUserIds,
		status,
		pendingCount,
		charCount,
		wordCountValue,
	};
}
