import { useTranslation } from 'react-i18next';

import type { DocumentSummaryDTO, FolderDTO } from '../../api/docTypes';
import type { DocumentId, FolderId, UserId } from '../../api/ids';
import type { DocumentDEK } from '../../crypto/documentDek';
import type { FolderColor } from '../../lib/folderColors';
import { ConfirmModal } from '../ConfirmModal';
import { FolderModal } from '../FolderModal';
import { NewDocumentModal } from '../NewDocumentModal';
import { ShareModal } from '../ShareModal';

/** Every modal DocumentsPage can have open, as a single discriminated
 * union instead of one nullable field per modal — nothing in the type
 * system stopped two of those independent fields from being non-null at
 * once (e.g. a share dialog and a delete confirmation both "open"
 * simultaneously, with whichever the JSX happened to check first
 * winning); a single `VaultModal | null` state makes "at most one modal
 * open" true by construction. */
export type VaultModal =
	| { type: 'new-document' }
	| { type: 'share'; doc: DocumentSummaryDTO }
	| { type: 'delete-document'; doc: DocumentSummaryDTO }
	| { type: 'folder'; mode: 'create' | FolderDTO }
	| { type: 'delete-folder'; folder: FolderDTO };

type VaultModalsProps = {
	modal: VaultModal | null;
	onClose: () => void;
	onCreated: (id: DocumentId) => void;
	docKeyRings: Map<DocumentId, DocumentDEK[]>;
	userId: UserId | undefined;
	titleFor: (doc: DocumentSummaryDTO) => string;
	onKeyRotated: (docId: DocumentId) => void;
	onLeftDocument: () => void;
	onConfirmDelete: () => void;
	onCreateFolder: (name: string, color: FolderColor) => Promise<FolderDTO>;
	onUpdateFolder: (folderId: FolderId, name: string, color: FolderColor) => Promise<FolderDTO>;
	onConfirmDeleteFolder: () => void;
};

type VaultDeleteConfirmProps = {
	target: DocumentSummaryDTO;
	onConfirm: () => void;
	onClose: () => void;
	titleFor: (doc: DocumentSummaryDTO) => string;
};

function VaultDeleteConfirm({ target, onConfirm, onClose, titleFor }: Readonly<VaultDeleteConfirmProps>) {
	const { t } = useTranslation();
	return (
		<ConfirmModal
			title={t('vault.deleteConfirmTitle')}
			body={t('vault.deleteConfirmBody', { title: titleFor(target) })}
			confirmLabel={t('vault.menu.delete')}
			onConfirm={onConfirm}
			onClose={onClose}
		/>
	);
}

type VaultDeleteFolderConfirmProps = {
	folder: FolderDTO;
	onConfirm: () => void;
	onClose: () => void;
};

function VaultDeleteFolderConfirm({ folder, onConfirm, onClose }: Readonly<VaultDeleteFolderConfirmProps>) {
	const { t } = useTranslation();
	return (
		<ConfirmModal
			title={t('vault.deleteFolderConfirmTitle')}
			body={t('vault.deleteFolderConfirmBody', { name: folder.name })}
			confirmLabel={t('vault.menu.delete')}
			onConfirm={onConfirm}
			onClose={onClose}
		/>
	);
}

export function VaultModals({
	modal,
	onClose,
	onCreated,
	docKeyRings,
	userId,
	titleFor,
	onKeyRotated,
	onLeftDocument,
	onConfirmDelete,
	onCreateFolder,
	onUpdateFolder,
	onConfirmDeleteFolder,
}: Readonly<VaultModalsProps>) {
	if (!modal) {
		return null;
	}

	switch (modal.type) {
		case 'new-document':
			return <NewDocumentModal onClose={onClose} onCreated={onCreated} />;

		case 'folder':
			return (
				<FolderModal folder={modal.mode === 'create' ? null : modal.mode} onClose={onClose} onCreate={onCreateFolder} onUpdate={onUpdateFolder} />
			);

		case 'share': {
			const documentKey = docKeyRings.get(modal.doc.id)?.[0];
			if (!documentKey || !userId) {
				return null;
			}
			return (
				<ShareModal
					docId={modal.doc.id}
					docTitle={titleFor(modal.doc)}
					documentKey={documentKey}
					ownUserId={userId}
					onKeyRotated={() => onKeyRotated(modal.doc.id)}
					onLeft={onLeftDocument}
					onClose={onClose}
				/>
			);
		}

		case 'delete-document':
			return <VaultDeleteConfirm target={modal.doc} onConfirm={onConfirmDelete} onClose={onClose} titleFor={titleFor} />;

		case 'delete-folder':
			return <VaultDeleteFolderConfirm folder={modal.folder} onConfirm={onConfirmDeleteFolder} onClose={onClose} />;
	}
}
