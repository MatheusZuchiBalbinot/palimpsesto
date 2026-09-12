import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import type { useNavigate } from 'react-router-dom';

import { deleteDocument, getDocument, restoreDocument, updateDocument } from '../api/docs';
import type { DocumentDTO } from '../api/docTypes';
import type { DocumentId } from '../api/ids';
import { encryptTitle, type EncryptTitleParams } from '../crypto/documentCipher';
import type { DocumentDEK } from '../crypto/documentDek';
import { bytesToBase64 } from '../crypto/identity';
import { translateError } from '../i18n/errors';
import { routes } from '../routes';
import { showToast, type ShowToastOptions } from './toast';

/** Restores a soft-deleted document — the "Undo" action on the delete
 * toast, shared by DocumentPage.tsx and DocumentsPage.tsx. `onRestored`
 * lets each page decide what "back" means (DocumentPage navigates to the
 * document; DocumentsPage just refreshes its list in place). */
export function undoDeleteDocument(docId: DocumentId, onRestored: () => void, t: TFunction) {
	void restoreDocument(docId)
		.then(onRestored)
		.catch((e: unknown) => showToast(translateError(t, e), 'error'));
}

export type CreateDocInfoActionsParams = {
	id: DocumentId | undefined;
	documentKey: DocumentDEK | null;
	setDocInfo: Dispatch<SetStateAction<DocumentDTO | null>>;
	navigate: ReturnType<typeof useNavigate>;
	t: TFunction;
	setIsDeleteDocumentOpen: (open: boolean) => void;
};

export function createDocInfoActions({ id, documentKey, setDocInfo, navigate, t, setIsDeleteDocumentOpen }: CreateDocInfoActionsParams) {
	function handleRename(title: string) {
		if (!id || !documentKey) {
			return;
		}
		const encryptTitleInput: EncryptTitleParams = { dek: documentKey.dek, docId: id, keyEpoch: documentKey.keyEpoch, title };
		const encrypted = bytesToBase64(encryptTitle(encryptTitleInput));
		setDocInfo((doc) => (doc ? { ...doc, title_ciphertext: encrypted } : doc));
		updateDocument(id, { title_ciphertext: encrypted }).catch((e: unknown) => {
			getDocument(id)
				.then(setDocInfo)
				.catch(() => {});
			showToast(translateError(t, e), 'error');
		});
	}

	function goToRestoredDocument(docId: string) {
		void navigate(routes.document(docId));
	}

	function handleConfirmDeleteDocument() {
		if (!id) {
			return;
		}
		setIsDeleteDocumentOpen(false);
		const undoDelete = () => undoDeleteDocument(id, () => goToRestoredDocument(id), t);
		deleteDocument(id)
			.then(() => {
				void navigate(routes.vault);
				const deletedToast: ShowToastOptions = {
					variant: 'success',
					action: { label: t('toast.undo'), onClick: undoDelete },
				};
				showToast(t('vault.documentDeleted'), deletedToast);
			})
			.catch((e: unknown) => showToast(translateError(t, e), 'error'));
	}

	return { handleRename, handleConfirmDeleteDocument };
}
