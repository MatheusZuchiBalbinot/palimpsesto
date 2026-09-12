import { Archive, Files, Mail, Pencil, Plus, User, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { FolderDTO, MemberDTO } from '../../api/docTypes';
import type { FolderId } from '../../api/ids';
import { VAULT_SCOPE, type VaultScope } from '../../lib/vaultDocuments';
import { Avatar } from '../Avatar';
import { Tooltip } from '../Tooltip';

/** The sidebar's folder tree and the pages using it (DocumentsPage) build
 * this once and spread it straight down to FoldersSection — the 6 fields
 * used to travel loose through VaultSidebarProps unchanged, just to get
 * relisted as FoldersSectionProps below. */
export type FolderManagementProps = {
	folders: FolderDTO[];
	selectedFolderId: FolderId | null;
	onFolderSelect: (folderId: FolderId | null) => void;
	onOpenCreateFolder: () => void;
	onOpenEditFolder: (folder: FolderDTO) => void;
	onDeleteFolder: (folderId: FolderId) => void;
};

type VaultSidebarProps = FolderManagementProps & {
	ownName: string;
	userId: string;
	scope: VaultScope;
	onScopeChange: (scope: VaultScope) => void;
	onlineUsers: MemberDTO[];
	onNewDocument: () => void;
	onProfileClick: () => void;
	pendingInvitesCount: number;
};

const SCOPE_ITEMS: Array<{ scope: VaultScope; labelKey: string; Icon: typeof Files }> = [
	{ scope: VAULT_SCOPE.ALL, labelKey: 'vault.all', Icon: Files },
	{ scope: VAULT_SCOPE.MINE, labelKey: 'vault.mine', Icon: User },
	{ scope: VAULT_SCOPE.SHARED, labelKey: 'vault.shared', Icon: Users },
	{ scope: VAULT_SCOPE.INVITES, labelKey: 'vault.invites', Icon: Mail },
	{ scope: VAULT_SCOPE.ARCHIVED, labelKey: 'vault.archived', Icon: Archive },
];

type FoldersSectionProps = FolderManagementProps;

/** Personal document organization (UX_REVIEW.md handoff v2) — every
 * folder here is a real row in the folders table, not decoration.
 * Create/rename/recolor go through FolderModal (VaultModals.tsx), not an
 * inline form: a single text input in the sidebar had no room for a color
 * picker, and no affordance to edit a folder once made. */
function FoldersSection({
	folders,
	selectedFolderId,
	onFolderSelect,
	onOpenCreateFolder,
	onOpenEditFolder,
	onDeleteFolder,
}: Readonly<FoldersSectionProps>) {
	const { t } = useTranslation();
	return (
		<div className="sidebar__folders">
			<div className="sidebar__section-label sidebar__section-label--row">
				<span>{t('vault.folders')}</span>
				<Tooltip content={t('vault.newFolder')}>
					<button type="button" className="sidebar__folder-add" aria-label={t('vault.newFolder')} onClick={onOpenCreateFolder}>
						<Plus size={15} />
					</button>
				</Tooltip>
			</div>
			{folders.map((folder) => (
				<div key={folder.id} className={`sidebar__folder-item${selectedFolderId === folder.id ? ' active' : ''}`}>
					<Tooltip content={folder.name}>
						<button
							type="button"
							className="sidebar__folder-button"
							aria-current={selectedFolderId === folder.id ? 'page' : undefined}
							onClick={() => onFolderSelect(selectedFolderId === folder.id ? null : folder.id)}
						>
							<span className="sidebar__folder-dot" style={{ background: folder.color }} aria-hidden="true" />
							{folder.name}
						</button>
					</Tooltip>
					<div className="sidebar__folder-actions">
						<Tooltip content={t('vault.editFolder')}>
							<button type="button" className="sidebar__folder-action" aria-label={t('vault.editFolder')} onClick={() => onOpenEditFolder(folder)}>
								<Pencil size={14} />
							</button>
						</Tooltip>
						<Tooltip content={t('vault.deleteFolder', { name: folder.name })}>
							<button
								type="button"
								className="sidebar__folder-action"
								aria-label={t('vault.deleteFolder', { name: folder.name })}
								onClick={() => onDeleteFolder(folder.id)}
							>
								<X size={14} />
							</button>
						</Tooltip>
					</div>
				</div>
			))}
		</div>
	);
}

/** Who's actively editing any of your documents right now, deduplicated
 * across documents — the same activeUsersByDoc data DocumentHeroCard uses,
 * just rolled up sidebar-wide instead of per-document. Hidden entirely when
 * nobody else is around, rather than showing an empty "Online agora" card. */
function OnlineNowSection({ users }: Readonly<{ users: MemberDTO[] }>) {
	const { t, i18n } = useTranslation();
	if (users.length === 0) {
		return null;
	}
	const names = new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' }).format(users.map((u) => u.display_name || u.email));
	return (
		<div className="sidebar__online">
			<div className="sidebar__online-label">
				<span className="dot dot--success" aria-hidden="true" />
				{t('vault.onlineNow')}
			</div>
			<div className="sidebar__online-row">
				<div className="avatar-stack">
					{users.map((u, i) => (
						<Avatar
							key={u.user_id}
							id={u.user_id}
							name={u.display_name || u.email}
							size={24}
							overlap={i > 0}
							borderColor="var(--bg-sidebar)"
							decorative
						/>
					))}
				</div>
				<span className="sidebar__online-names">{names}</span>
			</div>
		</div>
	);
}

type ScopeNavProps = {
	scope: VaultScope;
	selectedFolderId: FolderId | null;
	onScopeChange: (scope: VaultScope) => void;
	pendingInvitesCount: number;
};

function ScopeNav({ scope, selectedFolderId, onScopeChange, pendingInvitesCount }: Readonly<ScopeNavProps>) {
	const { t } = useTranslation();
	return (
		<nav className="sidebar__nav" aria-label={t('vault.documents')}>
			<div className="sidebar__section-label">{t('vault.documents')}</div>
			{SCOPE_ITEMS.map(({ scope: itemScope, labelKey, Icon }) => (
				<button
					key={itemScope}
					type="button"
					className={`sidebar__item${scope === itemScope && selectedFolderId === null ? ' active' : ''}`}
					aria-current={scope === itemScope && selectedFolderId === null ? 'page' : undefined}
					onClick={() => onScopeChange(itemScope)}
				>
					<Icon size={16} className="sidebar__item-icon" />
					{t(labelKey)}
					{itemScope === VAULT_SCOPE.INVITES && pendingInvitesCount > 0 ? <span className="badge badge--count">{pendingInvitesCount}</span> : null}
				</button>
			))}
		</nav>
	);
}

export function VaultSidebar({
	ownName,
	userId,
	scope,
	onScopeChange,
	onlineUsers,
	onNewDocument,
	onProfileClick,
	pendingInvitesCount,
	...folderManagement
}: Readonly<VaultSidebarProps>) {
	const { t } = useTranslation();
	return (
		<aside className="sidebar">
			<div className="sidebar__brand">
				<div className="brand-mark brand-mark--dark">
					<span className="brand-mark__logo" />
					<span className="brand-mark__name">{t('vault.brand')}</span>
				</div>
			</div>

			<div className="sidebar__new-doc-wrap">
				<Tooltip content={t('vault.newDocument')}>
					<button type="button" className="sidebar__new-doc" onClick={onNewDocument}>
						<Plus size={16} />
						{t('vault.newDocument')}
					</button>
				</Tooltip>
			</div>

			<ScopeNav
				scope={scope}
				selectedFolderId={folderManagement.selectedFolderId}
				onScopeChange={onScopeChange}
				pendingInvitesCount={pendingInvitesCount}
			/>

			<FoldersSection {...folderManagement} />

			<OnlineNowSection users={onlineUsers} />

			<button type="button" className="sidebar__profile" onClick={onProfileClick}>
				<Avatar id={userId} name={ownName} size={29} decorative />
				<div>
					<div className="sidebar__profile-name">{ownName}</div>
					<div className="sidebar__profile-sub">{t('vault.account')}</div>
				</div>
			</button>
		</aside>
	);
}
