import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';

import { deleteDocument, updateDocument } from '../api/docs';
import type { DocumentSummaryDTO } from '../api/docTypes';
import type { DocumentId } from '../api/ids';
import { encryptTitle } from '../crypto/documentCipher';
import type { DocumentDEK } from '../crypto/documentDek';
import { bytesToBase64 } from '../crypto/identity';
import { translateError } from '../i18n/errors';
import { undoDeleteDocument } from './documentActions';
import { showToast } from './toast';
import { SORT_MODES, type SortMode } from './vaultDocuments';

export type CreateListActionsParams = {
	docKeyRings: Map<DocumentId, DocumentDEK[]>;
	setDocuments: Dispatch<SetStateAction<DocumentSummaryDTO[]>>;
	refresh: () => void;
	t: TFunction;
	deleteTarget: DocumentSummaryDTO | null;
	setDeleteTarget: (target: DocumentSummaryDTO | null) => void;
	setSortMode: Dispatch<SetStateAction<SortMode>>;
};

/** The vault list's per-row actions that don't need any crypto beyond
 * re-encrypting a title: rename, soft-delete (with undo), and cycling the
 * sort mode. */
export function createListActions({ docKeyRings, setDocuments, refresh, t, deleteTarget, setDeleteTarget, setSortMode }: CreateListActionsParams) {
	function handleRename(doc: DocumentSummaryDTO, title: string) {
		const ring = docKeyRings.get(doc.id);
		const key = ring?.[0];
		if (!key) {
			return;
		}
		const encrypted = bytesToBase64(encryptTitle({ dek: key.dek, docId: doc.id, keyEpoch: key.keyEpoch, title }));
		setDocuments((docs) => docs.map((d) => (d.id === doc.id ? { ...d, title_ciphertext: encrypted } : d)));
		updateDocument(doc.id, { title_ciphertext: encrypted }).catch((e: unknown) => {
			refresh();
			showToast(translateError(t, e), 'error');
		});
	}

	function handleConfirmDelete() {
		if (!deleteTarget) {
			return;
		}
		const doc = deleteTarget;
		setDeleteTarget(null);
		deleteDocument(doc.id)
			.then(() => {
				refresh();
				showToast(t('vault.documentDeleted'), {
					variant: 'success',
					action: {
						label: t('toast.undo'),
						onClick: () => undoDeleteDocument(doc.id, refresh, t),
					},
				});
			})
			.catch((e: unknown) => showToast(translateError(t, e), 'error'));
	}

	function handleCycleSort() {
		setSortMode((mode) => SORT_MODES[(SORT_MODES.indexOf(mode) + 1) % SORT_MODES.length]);
	}

	return { handleRename, handleConfirmDelete, handleCycleSort };
}
