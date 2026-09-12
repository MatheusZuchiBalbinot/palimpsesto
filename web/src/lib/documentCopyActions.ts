import type { TFunction } from 'i18next';
import type { useNavigate } from 'react-router-dom';

import type { DocumentSummaryDTO } from '../api/docTypes';
import type { DocumentId } from '../api/ids';
import type { Session } from '../auth/session';
import type { DocumentDEK } from '../crypto/documentDek';
import { loadIdentityKeyPair } from '../crypto/identityStore';
import { translateError } from '../i18n/errors';
import { routes } from '../routes';
import { reconstructDocumentPlaintext } from './documentPlaintext';
import { downloadTextFile } from './downloadTextFile';
import { duplicateDocument, type DuplicateDocumentParams } from './duplicateDocument';
import { showToast } from './toast';

export type CreateCopyActionsParams = {
	session: Session | null;
	docKeyRings: Map<DocumentId, DocumentDEK[]>;
	titleFor: (doc: DocumentSummaryDTO) => string;
	refresh: () => void;
	navigate: ReturnType<typeof useNavigate>;
	t: TFunction;
};

/** The vault list's per-row actions that read a document's full plaintext:
 * duplicate (into a new document) and export (to a local .txt file). */
export function createCopyActions({ session, docKeyRings, titleFor, refresh, navigate, t }: CreateCopyActionsParams) {
	async function handleDuplicate(doc: DocumentSummaryDTO) {
		if (!session) {
			return;
		}

		const identity = await loadIdentityKeyPair(session.user.user_id);
		const sourceRing = docKeyRings.get(doc.id);
		if (!identity || !sourceRing) {
			return;
		}

		try {
			const copyTitle = t('vault.copyTitle', { title: titleFor(doc) });
			const duplicateInput: DuplicateDocumentParams = { doc, session, identity, sourceRing, copyTitle };
			const newId = await duplicateDocument(duplicateInput);
			refresh();
			void navigate(routes.document(newId));
		} catch (e) {
			showToast(translateError(t, e), 'error');
		}
	}

	async function handleExport(doc: DocumentSummaryDTO) {
		const ring = docKeyRings.get(doc.id);
		if (!ring) {
			return;
		}
		try {
			const text = await reconstructDocumentPlaintext({ docId: doc.id, keyRing: ring });
			downloadTextFile(`${titleFor(doc)}.txt`, text);
		} catch (e) {
			showToast(translateError(t, e), 'error');
		}
	}

	return { handleDuplicate, handleExport };
}
