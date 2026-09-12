import type { TFunction } from 'i18next';
import { useCallback } from 'react';
import type { useNavigate } from 'react-router-dom';

import type { DocumentId } from '../api/ids';
import type { Session } from '../auth/session';
import type { DocumentDEK } from '../crypto/documentDek';
import { loadIdentityKeyPair } from '../crypto/identityStore';
import { translateError } from '../i18n/errors';
import { reconstructDocumentPlaintext } from '../lib/documentPlaintext';
import { downloadTextFile } from '../lib/downloadTextFile';
import { duplicateDocument, type DuplicateDocumentParams } from '../lib/duplicateDocument';
import { showToast } from '../lib/toast';
import { routes } from '../routes';

export type UseDocumentCopyActionsParams = {
	id: DocumentId | undefined;
	session: Session | null;
	displayTitle: string;
	documentKeyRing: DocumentDEK[];
	navigate: ReturnType<typeof useNavigate>;
	t: TFunction;
};

/** The editor header's "Duplicate" and "Export" actions — the single-
 * document counterpart to lib/documentCopyActions.ts's vault-list version,
 * reading straight off the page's own already-loaded key ring instead of
 * a per-document Map of rings. */
export function useDocumentCopyActions({ id, session, displayTitle, documentKeyRing, navigate, t }: UseDocumentCopyActionsParams) {
	const handleDuplicate = useCallback(async () => {
		if (!session || !id) {
			return;
		}
		const identity = await loadIdentityKeyPair(session.user.user_id);
		if (!identity) {
			return;
		}
		try {
			const copyTitle = t('vault.copyTitle', { title: displayTitle });
			const duplicateInput: DuplicateDocumentParams = { doc: { id }, session, identity, sourceRing: documentKeyRing, copyTitle };
			const newId = await duplicateDocument(duplicateInput);
			void navigate(routes.document(newId));
		} catch (e) {
			showToast(translateError(t, e), 'error');
		}
	}, [session, id, displayTitle, documentKeyRing, t, navigate]);

	const handleExport = useCallback(async () => {
		if (!id) {
			return;
		}
		try {
			const text = await reconstructDocumentPlaintext({ docId: id, keyRing: documentKeyRing });
			downloadTextFile(`${displayTitle}.txt`, text);
		} catch (e) {
			showToast(translateError(t, e), 'error');
		}
	}, [id, displayTitle, documentKeyRing, t]);

	return { handleDuplicate, handleExport };
}
