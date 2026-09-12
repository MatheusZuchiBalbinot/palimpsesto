import { ArrowLeft, History, Lock, Menu, MoreHorizontal, Share2 } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { DocumentDTO, MemberDTO } from '../../api/docTypes';
import type { UserId } from '../../api/ids';
import type { DocumentDEK } from '../../crypto/documentDek';
import type { SyncStatusTone } from '../../lib/collaborationStatus';
import { routes } from '../../routes';
import { AvatarStackPopover } from '../AvatarStackPopover';
import { Button, IconButton, IconLinkButton } from '../Button';
import { DocumentSigil } from '../DocumentSigil';
import { DocumentTitle, type DocumentTitleHandle } from '../DocumentTitle';
import { Dropdown, type DropdownEntry } from '../Dropdown';

type EditorHeaderActionsProps = {
	members: MemberDTO[];
	onlineUserIds: Set<UserId>;
	awayUserIds: Set<UserId>;
	onRequestRename: (() => void) | null;
	onHistory: () => void;
	onCopyLink: () => void;
	onShare: () => void;
	onDuplicate: () => void;
	onExport: () => void;
	onTogglePanel: () => void;
	onDelete: () => void;
	onHelp: () => void;
};

/** Only the controls used constantly stay in the main row (Share, panel
 * toggle, history) — everything else, including the one destructive
 * action, moves into the "⋯" menu (UX_REVIEW.md 3.1/3.2): a toolbar for a
 * writing surface shouldn't read like an IDE's, and Delete sitting right
 * next to the frequently-clicked panel toggle was one careless click away
 * from a confirmation dialog nobody wanted to see.
 *
 * "Renomear" (when onRequestRename is available — the title isn't
 * decrypted yet otherwise) triggers the exact same click-to-edit the
 * title itself already does; the menu entry only exists so that's
 * discoverable at all, matching the vault list's DocumentRow/
 * DocumentHeroCard menus. */
function EditorHeaderActions({
	members,
	onlineUserIds,
	awayUserIds,
	onRequestRename,
	onHistory,
	onCopyLink,
	onShare,
	onDuplicate,
	onExport,
	onTogglePanel,
	onDelete,
	onHelp,
}: Readonly<EditorHeaderActionsProps>) {
	const { t } = useTranslation();
	const menuItems: DropdownEntry[] = [
		...(onRequestRename ? [{ label: t('vault.menu.rename'), onClick: onRequestRename }] : []),
		{ label: t('shortcutsHelp.title'), onClick: onHelp },
		{ label: t('editor.copyLink'), onClick: onCopyLink },
		{ label: t('vault.menu.duplicate'), onClick: onDuplicate },
		{ label: t('vault.menu.export'), onClick: onExport },
		'divider',
		{ label: t('vault.menu.delete'), onClick: onDelete, danger: true },
	];
	return (
		<div className="editor-header__spacer">
			<AvatarStackPopover members={members} onlineUserIds={onlineUserIds} awayUserIds={awayUserIds} />
			<IconButton label={t('editor.history')} className="icon-btn--label" onClick={onHistory}>
				<History size={15} />
				{t('editor.history')}
			</IconButton>
			<Button size="sm" icon={<Share2 size={15} />} onClick={onShare}>
				{t('editor.share')}
			</Button>
			<IconButton label={t('editor.togglePanel')} onClick={onTogglePanel}>
				<Menu size={17} />
			</IconButton>
			<Dropdown
				trigger={({ isOpen, onClick, triggerRef }) => (
					<IconButton ref={triggerRef} label={t('editor.moreActions')} aria-haspopup="menu" aria-expanded={isOpen} onClick={onClick}>
						<MoreHorizontal size={17} />
					</IconButton>
				)}
				items={menuItems}
			/>
		</div>
	);
}

type EditorHeaderTitleProps = {
	docInfo: DocumentDTO | null;
	documentKey: DocumentDEK | null;
	displayTitle: string;
	onRename: (title: string) => void;
	statusLabel: string;
	statusTone: SyncStatusTone;
	titleRef: React.RefObject<DocumentTitleHandle | null>;
};

function EditorHeaderTitle({ docInfo, documentKey, displayTitle, onRename, statusLabel, statusTone, titleRef }: Readonly<EditorHeaderTitleProps>) {
	return (
		<div className="leading-tight">
			{docInfo && documentKey ? (
				<DocumentTitle ref={titleRef} title={displayTitle} onRename={onRename} />
			) : (
				<span className="editor-header__title">…</span>
			)}
			<div className="editor-header__status" role="status">
				<span className={`dot dot--${statusTone === 'ok' ? 'accent' : statusTone}`} aria-hidden="true" />
				{statusLabel}
			</div>
		</div>
	);
}

function EditorHeaderPrivacyBadge({ documentKey }: Readonly<{ documentKey: DocumentDEK | null }>) {
	const { t } = useTranslation();
	if (documentKey) {
		return <DocumentSigil dek={documentKey.dek} />;
	}
	return (
		<span className="badge badge--accent">
			<span className="dot dot--accent" />
			{t('editor.private')}
		</span>
	);
}

type EditorHeaderProps = {
	docInfo: DocumentDTO | null;
	documentKey: DocumentDEK | null;
	displayTitle: string;
	onRename: (title: string) => void;
	statusLabel: string;
	statusTone: SyncStatusTone;
	isReadOnly: boolean;
	members: MemberDTO[];
	onlineUserIds: Set<UserId>;
	awayUserIds: Set<UserId>;
	onHistory: () => void;
	onCopyLink: () => void;
	onShare: () => void;
	onDuplicate: () => void;
	onExport: () => void;
	onTogglePanel: () => void;
	onDelete: () => void;
	onHelp: () => void;
};

export function EditorHeader({
	docInfo,
	documentKey,
	displayTitle,
	onRename,
	statusLabel,
	statusTone,
	isReadOnly,
	members,
	onlineUserIds,
	awayUserIds,
	onHistory,
	onCopyLink,
	onShare,
	onDuplicate,
	onExport,
	onTogglePanel,
	onDelete,
	onHelp,
}: Readonly<EditorHeaderProps>) {
	const { t } = useTranslation();
	const titleRef = useRef<DocumentTitleHandle>(null);
	return (
		<div className="editor-header">
			<IconLinkButton to={routes.vault} label={t('editor.backToVault')}>
				<ArrowLeft size={17} />
			</IconLinkButton>

			<EditorHeaderTitle
				docInfo={docInfo}
				documentKey={documentKey}
				displayTitle={displayTitle}
				onRename={onRename}
				statusLabel={statusLabel}
				statusTone={statusTone}
				titleRef={titleRef}
			/>

			<EditorHeaderPrivacyBadge documentKey={documentKey} />

			{isReadOnly ? (
				<span className="badge badge--warn">
					<Lock size={11} />
					{t('editor.readOnlyBadge')}
				</span>
			) : null}

			<EditorHeaderActions
				members={members}
				onlineUserIds={onlineUserIds}
				awayUserIds={awayUserIds}
				onRequestRename={docInfo && documentKey ? () => titleRef.current?.startEditing() : null}
				onHistory={onHistory}
				onCopyLink={onCopyLink}
				onShare={onShare}
				onDuplicate={onDuplicate}
				onExport={onExport}
				onTogglePanel={onTogglePanel}
				onDelete={onDelete}
				onHelp={onHelp}
			/>
		</div>
	);
}
