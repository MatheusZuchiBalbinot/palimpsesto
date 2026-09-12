import type { DocumentId } from '../api/ids';
import type { Session } from '../auth/session';
import type { DocumentDEK } from '../crypto/documentDek';
import { loadIdentityKeyPair } from '../crypto/identityStore';
import { restoreDocumentText, type RestoreDocumentTextParams } from '../realtime/restore';

export type RestoreHistoryTextParams = {
	docId: DocumentId | undefined;
	session: Session | null;
	selectedId: number | null;
	documentKeyRing: DocumentDEK[];
	text: string;
};

/** Restores the replayed text at the point selectedId marks, as a new
 * write (realtime/restore.ts's "restore lands as a new layer"
 * semantics) — does nothing (returns false) if any of the prerequisites
 * (a real document, an active session, a selected point, a ready key
 * ring, a local identity) aren't met yet. */
export async function restoreHistoryText({ docId, session, selectedId, documentKeyRing, text }: RestoreHistoryTextParams): Promise<boolean> {
	if (!docId || !session || selectedId === null || documentKeyRing.length === 0) {
		return false;
	}
	const identity = await loadIdentityKeyPair(session.user.user_id);
	if (!identity) {
		return false;
	}
	const restoreInput: RestoreDocumentTextParams = {
		docId,
		token: session.accessToken,
		text,
		userId: session.user.user_id,
		signingPrivate: identity.signingPrivate,
		keyRing: documentKeyRing,
	};
	await restoreDocumentText(restoreInput);
	return true;
}
