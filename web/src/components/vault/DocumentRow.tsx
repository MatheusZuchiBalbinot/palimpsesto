import type { TFunction } from 'i18next';
import { Lock, MoreHorizontal, Pin, PinOff } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { DocumentSummaryDTO, MemberDTO } from '../../api/docTypes';
import { routes } from '../../routes';
import { AVATAR_STACK_SIZES, AvatarStackPopover, presenceFromActiveUsers } from '../AvatarStackPopover';
import { IconButton } from '../Button';
import { DocumentTitle, type DocumentTitleHandle } from '../DocumentTitle';
import { Dropdown, type DropdownEntry } from '../Dropdown';

export type TitleState = 'ready' | 'loading' | 'error';

type DocumentRowTitleProps = {
	title: string;
	titleState: TitleState;
	onRename: (title: string) => void;
	titleRef: React.RefObject<DocumentTitleHandle | null>;
};

const TITLE_RENDERERS: Record<TitleState, (props: DocumentRowTitleProps, t: TFunction) => ReactNode> = {
	loading: () => <span className="skeleton-line skeleton-line--title" aria-hidden="true" />,
	error: (_props, t) => (
		<span className="doc-card__title doc-card__title--muted">
			<Lock size={13} /> {t('vault.titleError')}
		</span>
	),
	ready: ({ title, onRename, titleRef }) => (
		<DocumentTitle ref={titleRef} title={title} onRename={onRename} viewClassName="doc-card__title" editClassName="doc-card__title-input" />
	),
};

function DocumentRowTitle(props: Readonly<DocumentRowTitleProps>) {
	const { t } = useTranslation();
	return TITLE_RENDERERS[props.titleState](props, t);
}

type DocumentRowMainProps = {
	title: string;
	titleState: TitleState;
	isShared: boolean;
	metaText: string;
	onRename: (title: string) => void;
	titleRef: React.RefObject<DocumentTitleHandle | null>;
};

function DocumentRowMain({ title, titleState, isShared, metaText, onRename, titleRef }: Readonly<DocumentRowMainProps>) {
	const { t } = useTranslation();
	return (
		<div className="doc-card__main">
			<div className="doc-card__title-row">
				<DocumentRowTitle title={title} titleState={titleState} onRename={onRename} titleRef={titleRef} />
				{isShared ? <span className="badge badge--muted">{t('vault.sharedWithMeBadge')}</span> : null}
			</div>
			<div className="doc-card__meta">{metaText}</div>
		</div>
	);
}

type DocumentRowPresenceProps = {
	activeUsers: MemberDTO[];
};

function DocumentRowPresence({ activeUsers }: Readonly<DocumentRowPresenceProps>) {
	const { t } = useTranslation();
	if (activeUsers.length === 0) {
		return null;
	}
	return (
		<span className="doc-card__live" aria-label={t('vault.liveNow')}>
			<AvatarStackPopover {...presenceFromActiveUsers(activeUsers)} {...AVATAR_STACK_SIZES} />
		</span>
	);
}

type DocumentRowProps = {
	doc: DocumentSummaryDTO;
	title: string;
	titleState: TitleState;
	isPinned: boolean;
	isShared: boolean;
	metaText: string;
	activeUsers: MemberDTO[];
	onTogglePin: () => void;
	onRename: (title: string) => void;
	menuItems: DropdownEntry[];
};

export function DocumentRow({
	doc,
	title,
	titleState,
	isPinned,
	isShared,
	metaText,
	activeUsers,
	onTogglePin,
	onRename,
	menuItems,
}: Readonly<DocumentRowProps>) {
	const { t } = useTranslation();
	const titleRef = useRef<DocumentTitleHandle>(null);
	// "Renomear" is the menu's job (Palimpsesto v2 prototype) — clicking the
	// title directly still works too (a shortcut, not the only way in), but
	// the menu is what makes renaming discoverable at all: nothing about
	// the title's plain text otherwise hints that it's clickable.
	const fullMenuItems: DropdownEntry[] =
		titleState === 'ready' ? [{ label: t('vault.menu.rename'), onClick: () => titleRef.current?.startEditing() }, ...menuItems] : menuItems;

	return (
		<li className="doc-card">
			<Link to={routes.document(doc.id)} className="doc-card__link" aria-label={t('vault.openDocument', { title })} />

			<IconButton
				label={isPinned ? t('vault.menu.unpin') : t('vault.menu.pin')}
				className={`doc-card__pin${isPinned ? ' doc-card__pin--active' : ''}`}
				onClick={onTogglePin}
			>
				{isPinned ? <Pin size={15} /> : <PinOff size={15} />}
			</IconButton>

			<DocumentRowMain title={title} titleState={titleState} isShared={isShared} metaText={metaText} onRename={onRename} titleRef={titleRef} />

			<DocumentRowPresence activeUsers={activeUsers} />

			<Dropdown
				trigger={({ isOpen, onClick, triggerRef }) => (
					<IconButton ref={triggerRef} label={t('vault.moreActions')} aria-haspopup="menu" aria-expanded={isOpen} onClick={onClick}>
						<MoreHorizontal size={17} />
					</IconButton>
				)}
				items={fullMenuItems}
			/>
		</li>
	);
}
