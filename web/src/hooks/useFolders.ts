import type { TFunction } from 'i18next';
import { useCallback, useEffect, useState } from 'react';

import { createFolder, deleteFolder, listFolders, setDocumentFolder, updateFolder } from '../api/docs';
import type { FolderDTO } from '../api/docTypes';
import type { DocumentId, FolderId } from '../api/ids';
import { translateError } from '../i18n/errors';
import type { FolderColor } from '../lib/folderColors';
import { showToast } from '../lib/toast';

export { FOLDER_COLORS } from '../lib/folderColors';

export type UseFoldersParams = {
	t: TFunction;
	onDocumentMoved: () => void;
};

/** Personal document organization (Palimpsesto v2 design handoff) — a
 * folder groups a subset of the caller's own documents, never shared. */
export function useFolders({ t, onDocumentMoved }: UseFoldersParams) {
	const [folders, setFolders] = useState<FolderDTO[]>([]);

	const refresh = useCallback(() => {
		listFolders()
			.then(setFolders)
			.catch(() => setFolders([]));
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	async function handleCreateFolder(name: string, color: FolderColor): Promise<FolderDTO> {
		const created = await createFolder({ name: name.trim(), color });
		setFolders((prev) => [created, ...prev]);
		return created;
	}

	async function handleUpdateFolder(folderId: FolderId, name: string, color: FolderColor): Promise<FolderDTO> {
		const updated = await updateFolder(folderId, { name: name.trim(), color });
		setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
		return updated;
	}

	function handleDeleteFolder(folderId: FolderId) {
		setFolders((prev) => prev.filter((f) => f.id !== folderId));
		deleteFolder(folderId)
			.then(onDocumentMoved)
			.catch((e: unknown) => {
				refresh();
				showToast(translateError(t, e), 'error');
			});
	}

	function handleMoveToFolder(docId: DocumentId, folderId: FolderId | null) {
		setDocumentFolder(docId, { folder_id: folderId })
			.then(onDocumentMoved)
			.catch((e: unknown) => showToast(translateError(t, e), 'error'));
	}

	return { folders, handleCreateFolder, handleUpdateFolder, handleDeleteFolder, handleMoveToFolder };
}
