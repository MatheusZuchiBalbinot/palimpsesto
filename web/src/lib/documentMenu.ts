import type { TFunction } from 'i18next';

import type { FolderDTO } from '../api/docTypes';
import type { FolderId } from '../api/ids';
import type { DropdownEntry } from '../components/Dropdown';

export type BuildMenuItemsParams = {
	t: TFunction;
	isPinned: boolean;
	onShare: () => void;
	onHistory: () => void;
	onTogglePin: () => void;
	onDuplicate: () => void;
	onExport: () => void;
	onDelete: () => void;
	/** Only the document's own owner can file it — an empty list from a
	 * non-owner caller just means no folder entries show up. */
	folders: FolderDTO[];
	currentFolderId: FolderId | null;
	onMoveToFolder: (folderId: FolderId | null) => void;
};

export function buildMenuItems(params: BuildMenuItemsParams): DropdownEntry[] {
	const { t, isPinned, onShare, onHistory, onTogglePin, onDuplicate, onExport, onDelete, folders, currentFolderId, onMoveToFolder } = params;
	const folderEntries: DropdownEntry[] = folders
		.filter((f) => f.id !== currentFolderId)
		.map((f) => ({ label: t('vault.menu.moveToFolder', { name: f.name }), onClick: () => onMoveToFolder(f.id) }));
	if (currentFolderId) {
		folderEntries.push({ label: t('vault.menu.removeFromFolder'), onClick: () => onMoveToFolder(null) });
	}

	return [
		{ label: t('vault.menu.share'), onClick: onShare },
		{ label: t('vault.menu.history'), onClick: onHistory },
		{
			label: isPinned ? t('vault.menu.unpin') : t('vault.menu.pin'),
			onClick: onTogglePin,
		},
		{ label: t('vault.menu.duplicate'), onClick: onDuplicate },
		{ label: t('vault.menu.export'), onClick: onExport },
		...(folderEntries.length > 0 ? (['divider', ...folderEntries] as DropdownEntry[]) : []),
		'divider',
		{ label: t('vault.menu.delete'), onClick: onDelete, danger: true },
	];
}
