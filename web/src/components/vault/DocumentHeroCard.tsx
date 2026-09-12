import { MoreHorizontal } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { DocumentSummaryDTO, MemberDTO } from '../../api/docTypes';
import type { DocumentId } from '../../api/ids';
import { useDocumentActivityWaveform } from '../../hooks/useDocumentActivityWaveform';
import { routes } from '../../routes';
import { AVATAR_STACK_SIZES, AvatarStackPopover, presenceFromActiveUsers } from '../AvatarStackPopover';
import { IconButton } from '../Button';
import { DocumentTitle, type DocumentTitleHandle } from '../DocumentTitle';
import { Dropdown, type DropdownEntry } from '../Dropdown';

type ActivityWaveformProps = {
	docId: DocumentId;
};

const WAVEFORM_MIN_BAR_PERCENT = 14;
const WAVEFORM_MAX_BAR_PERCENT = 100;

/** Real per-session edit-size bars, not decoration (UX_REVIEW.md handoff
 * v2's mock had a sparkline here; this one is backed by the same grouped
 * update data the history scrubber uses). */
function ActivityWaveform({ docId }: Readonly<ActivityWaveformProps>) {
	const bars = useDocumentActivityWaveform(docId);
	if (bars.length === 0) {
		return null;
	}
	return (
		<div className="doc-hero__waveform" aria-hidden="true">
			{bars.map((height, i) => (
				<span key={i} style={{ height: `${Math.max(WAVEFORM_MIN_BAR_PERCENT, height * WAVEFORM_MAX_BAR_PERCENT)}%` }} />
			))}
		</div>
	);
}

type DocumentHeroCardProps = {
	doc: DocumentSummaryDTO;
	title: string;
	activeUsers: MemberDTO[];
	menuItems: DropdownEntry[];
	onRename: (title: string) => void;
};

/** The vault's "currently editing" hero — the one document with live
 * presence right now gets a larger, richer treatment than the plain
 * rows below it (Palimpsesto v2 prototype). No body preview snippet: that
 * would mean decrypting the full document just for the vault list, which
 * the rest of this list deliberately never does. */
export function DocumentHeroCard({ doc, title, activeUsers, menuItems, onRename }: Readonly<DocumentHeroCardProps>) {
	const { t, i18n } = useTranslation();
	const names = activeUsers.map((m) => m.display_name || m.email);
	const namesLabel = new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' }).format(names);
	const titleRef = useRef<DocumentTitleHandle>(null);
	const fullMenuItems: DropdownEntry[] = [{ label: t('vault.menu.rename'), onClick: () => titleRef.current?.startEditing() }, ...menuItems];

	return (
		<div className="doc-hero paper-stack">
			<Link to={routes.document(doc.id)} className="doc-card__link" aria-label={t('vault.openDocument', { title })} />
			<div className="doc-hero__row">
				<div className="doc-hero__main">
					<div className="doc-hero__label">
						<span>{t('vault.liveNow')}</span>
						<span className="dot dot--success" />
					</div>
					<DocumentTitle ref={titleRef} title={title} onRename={onRename} viewClassName="doc-hero__title" editClassName="doc-hero__title-input" />
					<div className="doc-hero__footer">
						<AvatarStackPopover {...presenceFromActiveUsers(activeUsers)} {...AVATAR_STACK_SIZES} />
						<span className="doc-hero__meta">{t('vault.heroMeta', { names: namesLabel, count: doc.update_count })}</span>
					</div>
				</div>
				<div className="doc-hero__side">
					<Dropdown
						trigger={({ isOpen, onClick, triggerRef }) => (
							<IconButton ref={triggerRef} label={t('vault.moreActions')} aria-haspopup="menu" aria-expanded={isOpen} onClick={onClick}>
								<MoreHorizontal size={17} />
							</IconButton>
						)}
						items={fullMenuItems}
					/>
					<ActivityWaveform docId={doc.id} />
				</div>
			</div>
		</div>
	);
}
