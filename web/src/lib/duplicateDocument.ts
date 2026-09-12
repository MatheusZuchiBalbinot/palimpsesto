import { createDocument, updateDocument } from '../api/docs';
import type { DocumentId } from '../api/ids';
import type { Session } from '../auth/session';
import { encryptTitle, type EncryptTitleParams } from '../crypto/documentCipher';
import { createAndWrapOwnDEK, type DocumentDEK } from '../crypto/documentDek';
import { bytesToBase64 } from '../crypto/identity';
import { loadIdentityKeyPair } from '../crypto/identityStore';
import { restoreDocumentText, type RestoreDocumentTextParams } from '../realtime/restore';
import { reconstructDocumentPlaintext } from './documentPlaintext';

export type DuplicateDocumentParams = {
	/** Only `id` is read — any object identifying the source document
	 * works, whether the vault's DocumentSummaryDTO or the editor's
	 * DocumentDTO. */
	doc: { id: DocumentId };
	session: Session;
	identity: NonNullable<Awaited<ReturnType<typeof loadIdentityKeyPair>>>;
	sourceRing: DocumentDEK[];
	copyTitle: string;
};

/** Creates a new document with a copy of `doc`'s current plaintext and
 * title — the vault's "Duplicate" action. Returns the new document's ID. */
export async function duplicateDocument({ doc, session, identity, sourceRing, copyTitle }: DuplicateDocumentParams): Promise<DocumentId> {
	const text = await reconstructDocumentPlaintext({ docId: doc.id, keyRing: sourceRing });

	const created = await createDocument({ title_ciphertext: '' });
	const newKey = await createAndWrapOwnDEK(created.id, session.user.user_id, identity.identityPublic);
	const encryptTitleInput: EncryptTitleParams = { dek: newKey.dek, docId: created.id, keyEpoch: newKey.keyEpoch, title: copyTitle };
	const encryptedTitle = bytesToBase64(encryptTitle(encryptTitleInput));
	await updateDocument(created.id, { title_ciphertext: encryptedTitle });

	if (text) {
		const restoreInput: RestoreDocumentTextParams = {
			docId: created.id,
			token: session.accessToken,
			text,
			userId: session.user.user_id,
			signingPrivate: identity.signingPrivate,
			keyRing: [newKey],
		};
		await restoreDocumentText(restoreInput);
	}
	return created.id;
}
