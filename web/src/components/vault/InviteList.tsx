import { Check, Mail, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { InviteDTO } from '../../api/docTypes';
import { formatRelativeTime } from '../../lib/relativeTime';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { DocListSkeleton } from './DocListSkeleton';

type InviteRowProps = {
	invite: InviteDTO;
	locale: string;
	isResponding: boolean;
	onAccept: () => void;
	onDecline: () => void;
};

/** A pending invite row — deliberately shows no document title:
 * accepting is the only way to get the key that would let this decrypt
 * one (see document.InviteSummary's backend comment). */
function InviteRow({ invite, locale, isResponding, onAccept, onDecline }: Readonly<InviteRowProps>) {
	const { t } = useTranslation();
	const name = invite.inviter_name || invite.inviter_email;
	return (
		<li className="doc-card doc-card--static" aria-label={t('vault.invitesFrom', { name })}>
			<div className="doc-card__main">
				<span className="doc-card__title">{t('vault.invitesFrom', { name })}</span>
				<div className="doc-card__meta">{formatRelativeTime(invite.created_at, locale)}</div>
			</div>
			<Button size="sm" variant="secondary" icon={<X size={14} />} disabled={isResponding} onClick={onDecline}>
				{t('vault.invitesDecline')}
			</Button>
			<Button size="sm" icon={<Check size={14} />} disabled={isResponding} onClick={onAccept}>
				{t('vault.invitesAccept')}
			</Button>
		</li>
	);
}

type InviteListProps = {
	isLoading: boolean;
	invites: InviteDTO[];
	locale: string;
	respondingId: string | null;
	onAccept: (invite: InviteDTO) => void;
	onDecline: (invite: InviteDTO) => void;
};

/** The vault's "Convites" view — every pending invite addressed to the
 * caller, each accept/decline-able in place. */
export function InviteList({ isLoading, invites, locale, respondingId, onAccept, onDecline }: Readonly<InviteListProps>) {
	const { t } = useTranslation();

	if (isLoading) {
		return (
			<div aria-busy="true">
				<p className="sr-only" role="status">
					{t('vault.loading')}
				</p>
				<DocListSkeleton />
			</div>
		);
	}

	if (invites.length === 0) {
		return <EmptyState icon={<Mail size={22} />} title={t('vault.invitesEmptyTitle')} body={t('vault.invitesEmpty')} />;
	}

	return (
		<ul className="doc-list">
			{invites.map((invite) => (
				<InviteRow
					key={invite.id}
					invite={invite}
					locale={locale}
					isResponding={respondingId === invite.id}
					onAccept={() => onAccept(invite)}
					onDecline={() => onDecline(invite)}
				/>
			))}
		</ul>
	);
}
