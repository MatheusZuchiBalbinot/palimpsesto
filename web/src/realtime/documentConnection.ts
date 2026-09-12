import type { TFunction } from 'i18next';
import { type Dispatch, type SetStateAction } from 'react';
import { TextAreaBinding } from 'y-textarea';
import * as Y from 'yjs';

import { getLatestSnapshot } from '../api/docs';
import { toUserId, type DocumentId, type UserId } from '../api/ids';
import type { Session } from '../auth/session';
import { resolveTrustedSigningKey } from '../crypto/authorKeys';
import {
	bytesToUuidString,
	decryptSnapshotWithAnyKey,
	signAndEncryptUpdate,
	verifyAndDecryptUpdateWithAnyKey,
	type SignAndEncryptUpdateParams,
	type VerifyAndDecryptUpdateWithAnyKeyParams,
} from '../crypto/documentCipher';
import type { DocumentDEK } from '../crypto/documentDek';
import { base64ToBytes } from '../crypto/identity';
import { loadIdentityKeyPair } from '../crypto/identityStore';
import { cursorColorForId } from '../lib/presenceColor';
import { showToast } from '../lib/toast';
import { setupContentTracking, setupUndoRedo, type SetupContentTrackingParams } from './editorTracking';
import { makeMemberJoinedHandler, makeMemberLeftHandler, setupActivityTracking, setupPresenceTracking } from './presenceTracking';
import { DocProvider, type ConnectionStatus, type ProviderOptions } from './provider';
import { startSnapshotChecks, type MaybeCreateSnapshotParams } from './snapshotChecks';

// ---------------------------------------------------------------------------
// Connection setup for DocumentPage.tsx: the Yjs doc, DocProvider, and the
// textarea binding. Presence/activity tracking lives in presenceTracking.ts,
// undo/redo and content-tracking in editorTracking.ts, and snapshot
// compaction in snapshotChecks.ts — this file wires those pieces together
// around a single DocProvider connection instead of owning all of them
// itself.
// ---------------------------------------------------------------------------

/** Every piece of connection state a component watching this document
 * needs to react to. Bundled into one object because most of the functions
 * below only forward it another layer deeper (to whichever inner piece
 * actually calls the setter) rather than using it themselves — passing it
 * as seven separate parameters at every layer was pure noise. */
export type ConnectionStateSetters = {
	setStatus: Dispatch<SetStateAction<ConnectionStatus>>;
	setPendingCount: Dispatch<SetStateAction<number>>;
	setOnlineUserIds: Dispatch<SetStateAction<Set<UserId>>>;
	setAwayUserIds: Dispatch<SetStateAction<Set<UserId>>>;
	setTypingUserIds: Dispatch<SetStateAction<Set<UserId>>>;
	setCharCount: Dispatch<SetStateAction<number>>;
	setWordCountValue: Dispatch<SetStateAction<number>>;
};

type YjsSeed = { ydoc: Y.Doc; initialSinceId: bigint | undefined };

// Fetched and applied before the provider even connects, so the replay only
// needs to ask the server for what's left after it — never the full log
// since the document's creation.
export async function loadYjsSeed(docId: DocumentId, documentKeyRing: DocumentDEK[]): Promise<YjsSeed> {
	const ydoc = new Y.Doc();
	let initialSinceId: bigint | undefined;

	try {
		const snapshot = await getLatestSnapshot(docId);
		if (snapshot) {
			const plaintext = decryptSnapshotWithAnyKey(documentKeyRing, docId, base64ToBytes(snapshot.ciphertext));
			Y.applyUpdate(ydoc, plaintext);
			initialSinceId = BigInt(snapshot.up_to_update_id);
		}
	} catch {
		// Best-effort — worst case, the replay just starts from the
		// beginning, as it did before snapshots existed.
	}

	return { ydoc, initialSinceId };
}

type MakeEncryptUpdateParams = {
	dek: Uint8Array;
	signingPrivate: Uint8Array;
	docId: DocumentId;
	keyEpoch: number;
	authorUserId: UserId;
};

export function makeEncryptUpdate({ dek, signingPrivate, docId, keyEpoch, authorUserId }: MakeEncryptUpdateParams) {
	return (plaintext: Uint8Array) => {
		const signAndEncryptInput: SignAndEncryptUpdateParams = { dek, signingPrivate, docId, keyEpoch, authorUserId, plaintext };
		return signAndEncryptUpdate(signAndEncryptInput);
	};
}

export function makeDecryptUpdate(keyRing: DocumentDEK[], docId: DocumentId) {
	return async (ciphertext: Uint8Array, authorIdBytes: Uint8Array): Promise<Uint8Array> => {
		const authorId = toUserId(bytesToUuidString(authorIdBytes));
		const authorSigningPublic = await resolveTrustedSigningKey(authorId);
		const verifyInput: VerifyAndDecryptUpdateWithAnyKeyParams = {
			keyRing,
			authorSigningPublic,
			docId,
			authorUserId: authorId,
			signedWire: ciphertext,
		};
		return verifyAndDecryptUpdateWithAnyKey(verifyInput);
	};
}

type MakeStatusChangeHandlerParams = {
	setStatus: Dispatch<SetStateAction<ConnectionStatus>>;
	snapshotParams: MaybeCreateSnapshotParams;
	isCancelled: () => boolean;
	getSnapshotTimer: () => ReturnType<typeof setInterval> | undefined;
	setSnapshotTimer: (timer: ReturnType<typeof setInterval>) => void;
};

// Kicks off startSnapshotChecks (snapshotChecks.ts) the first time the
// connection reaches 'connected' — see that function's own comment for why
// the timer is started once per connection instead of on every reconnect.
export function makeStatusChangeHandler({
	setStatus,
	snapshotParams,
	isCancelled,
	getSnapshotTimer,
	setSnapshotTimer,
}: MakeStatusChangeHandlerParams) {
	return (nextStatus: ConnectionStatus) => {
		setStatus(nextStatus);
		if (nextStatus === 'connected' && !getSnapshotTimer()) {
			setSnapshotTimer(startSnapshotChecks(snapshotParams, isCancelled));
		}
	};
}

type BuildDocProviderParams = {
	id: DocumentId;
	session: Session;
	identity: NonNullable<Awaited<ReturnType<typeof loadIdentityKeyPair>>>;
	dek: Uint8Array;
	keyEpoch: number;
	documentKeyRing: DocumentDEK[];
	ydoc: Y.Doc;
	initialSinceId: bigint | undefined;
	t: TFunction;
	setters: ConnectionStateSetters;
	snapshotParams: MaybeCreateSnapshotParams;
	isCancelled: () => boolean;
	getSnapshotTimer: () => ReturnType<typeof setInterval> | undefined;
	setSnapshotTimer: (timer: ReturnType<typeof setInterval>) => void;
};

function buildDocProvider(params: BuildDocProviderParams): DocProvider {
	const {
		id,
		session,
		identity,
		dek,
		keyEpoch,
		documentKeyRing,
		ydoc,
		initialSinceId,
		t,
		setters,
		snapshotParams,
		isCancelled,
		getSnapshotTimer,
		setSnapshotTimer,
	} = params;
	const { setStatus, setPendingCount, setOnlineUserIds } = setters;
	const encryptUpdateInput: MakeEncryptUpdateParams = {
		dek,
		signingPrivate: identity.signingPrivate,
		docId: id,
		keyEpoch,
		authorUserId: session.user.user_id,
	};
	const statusChangeInput: MakeStatusChangeHandlerParams = { setStatus, snapshotParams, isCancelled, getSnapshotTimer, setSnapshotTimer };
	const providerOptions: ProviderOptions = {
		docId: id,
		token: session.accessToken,
		userId: session.user.user_id,
		ydoc,
		initialSinceId,
		encryptUpdate: makeEncryptUpdate(encryptUpdateInput),
		decryptUpdate: makeDecryptUpdate(documentKeyRing, id),
		onUpdateVerificationFailed: () => showToast(t('editor.updateVerificationFailed'), 'error'),
		onStatusChange: makeStatusChangeHandler(statusChangeInput),
		onPendingCountChange: setPendingCount,
		onJoinedSnapshot: (memberIds) => setOnlineUserIds(new Set([session.user.user_id, ...memberIds.map(toUserId)])),
		onMemberJoined: makeMemberJoinedHandler(setOnlineUserIds),
		onMemberLeft: makeMemberLeftHandler(setOnlineUserIds),
	};
	return new DocProvider(providerOptions);
}

type WireEditorSessionParams = {
	provider: DocProvider;
	textarea: HTMLTextAreaElement;
	ytext: Y.Text;
	ydoc: Y.Doc;
	docId: DocumentId;
	session: Session;
	setters: ConnectionStateSetters;
};

type WiredEditorSession = {
	binding: TextAreaBinding;
	stopPresenceTracking: () => void;
	stopActivityTracking: () => void;
	stopUndoRedo: () => void;
	stopContentTracking: () => void;
};

function wireEditorSession({ provider, textarea, ytext, ydoc, docId, session, setters }: WireEditorSessionParams): WiredEditorSession {
	const { setAwayUserIds, setTypingUserIds, setCharCount, setWordCountValue } = setters;
	const stopPresenceTracking = setupPresenceTracking(provider, setAwayUserIds, setTypingUserIds);
	const stopActivityTracking = setupActivityTracking(provider);

	// y-textarea's cursor overlay uses the textarea's DOM id as the key for
	// its awareness field, and throws in the constructor if there isn't one.
	textarea.id = `document-editor-${docId}`;
	const binding = new TextAreaBinding(ytext, textarea, {
		awareness: provider.awareness,
		clientName: session.user.display_name || session.user.email,
		color: cursorColorForId(session.user.user_id),
	});

	const stopUndoRedo = setupUndoRedo(textarea, ytext);
	const contentTrackingInput: SetupContentTrackingParams = { ydoc, ytext, textarea, binding, provider, setCharCount, setWordCountValue };
	const stopContentTracking = setupContentTracking(contentTrackingInput);

	return {
		binding,
		stopPresenceTracking,
		stopActivityTracking,
		stopUndoRedo,
		stopContentTracking,
	};
}

type OpenProviderParams = {
	id: DocumentId;
	session: Session;
	identity: NonNullable<Awaited<ReturnType<typeof loadIdentityKeyPair>>>;
	dek: Uint8Array;
	keyEpoch: number;
	documentKeyRing: DocumentDEK[];
	ydoc: Y.Doc;
	initialSinceId: bigint | undefined;
	t: TFunction;
	setters: ConnectionStateSetters;
	isCancelled: () => boolean;
};

type OpenedProvider = {
	provider: DocProvider;
	getSnapshotTimer: () => ReturnType<typeof setInterval> | undefined;
};

function openProvider(params: OpenProviderParams): OpenedProvider {
	const { id, session, identity, dek, keyEpoch, documentKeyRing, ydoc, initialSinceId, t, setters, isCancelled } = params;
	let snapshotCheckTimer: ReturnType<typeof setInterval> | undefined;
	const snapshotParams: MaybeCreateSnapshotParams = { docId: id, dek, keyEpoch, ydoc };
	const buildDocProviderInput: BuildDocProviderParams = {
		id,
		session,
		identity,
		dek,
		keyEpoch,
		documentKeyRing,
		ydoc,
		initialSinceId,
		t,
		setters,
		snapshotParams,
		isCancelled,
		getSnapshotTimer: () => snapshotCheckTimer,
		setSnapshotTimer: (timer) => {
			snapshotCheckTimer = timer;
		},
	};
	const provider = buildDocProvider(buildDocProviderInput);
	return { provider, getSnapshotTimer: () => snapshotCheckTimer };
}

export type ConnectDocumentParams = {
	id: DocumentId;
	session: Session;
	identity: NonNullable<Awaited<ReturnType<typeof loadIdentityKeyPair>>>;
	documentKey: DocumentDEK;
	documentKeyRing: DocumentDEK[];
	textarea: HTMLTextAreaElement;
	t: TFunction;
	setters: ConnectionStateSetters;
	isCancelled: () => boolean;
};

export async function connectDocument(params: ConnectDocumentParams): Promise<(() => void) | undefined> {
	const { id, documentKey, documentKeyRing, textarea, isCancelled } = params;
	const { dek, keyEpoch } = documentKey;
	const { ydoc, initialSinceId } = await loadYjsSeed(id, documentKeyRing);

	if (isCancelled()) {
		ydoc.destroy();
		return undefined;
	}

	const ytext = ydoc.getText('content');
	const openProviderInput: OpenProviderParams = { ...params, dek, keyEpoch, ydoc, initialSinceId };
	const { provider, getSnapshotTimer } = openProvider(openProviderInput);

	if (isCancelled()) {
		provider.destroy();
		ydoc.destroy();
		return undefined;
	}

	const { binding, stopPresenceTracking, stopActivityTracking, stopUndoRedo, stopContentTracking } = wireEditorSession({
		...params,
		provider,
		textarea,
		ytext,
		ydoc,
		docId: id,
	});

	return () => {
		stopContentTracking();
		stopUndoRedo();
		const snapshotCheckTimer = getSnapshotTimer();
		if (snapshotCheckTimer) {
			clearInterval(snapshotCheckTimer);
		}
		stopActivityTracking();
		stopPresenceTracking();
		binding.destroy();
		provider.destroy();
		ydoc.destroy();
	};
}
