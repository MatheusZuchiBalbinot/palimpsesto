import { Check, Copy, Link as LinkIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { InviteLinkDTO, InviteLinkRole } from '../../api/docTypes';
import type { DocumentId } from '../../api/ids';
import { inviteUrl, useInviteLinkState } from '../../hooks/useInviteLinkState';
import { translateError } from '../../i18n/errors';
import { Button } from '../Button';
import { Select } from '../Select';
import { READER_LABEL_KEY } from './roleLabels';

export type InviteLinkCopyRowProps = {
	isCopied: boolean;
	onCopy: () => void;
};

type ExistingInviteLinkRowProps = InviteLinkCopyRowProps & {
	link: InviteLinkDTO;
};

function ExistingInviteLinkRow({ link, isCopied, onCopy }: Readonly<ExistingInviteLinkRowProps>) {
	const { t } = useTranslation();
	return (
		<div className="share-link-row">
			<input className="input share-link-row__url" readOnly aria-label={t('share.linkTitle')} value={inviteUrl(link.token)} />
			<Button
				type="button"
				variant="secondary"
				size="sm"
				icon={isCopied ? <Check size={13} /> : <Copy size={13} />}
				onClick={onCopy}
				style={{ flex: 'none' }}
			>
				{isCopied ? t('share.linkCopied') : t('share.linkCopy')}
			</Button>
		</div>
	);
}

export type InviteLinkActionsRowProps = {
	hasLink: boolean;
	linkRole: InviteLinkRole;
	onLinkRoleChange: (role: InviteLinkRole) => void;
	isCreating: boolean;
	onCreate: () => void;
	isRevoking: boolean;
	onRevoke: () => void;
};

function InviteLinkActionsRow({
	hasLink,
	linkRole,
	onLinkRoleChange,
	isCreating,
	onCreate,
	isRevoking,
	onRevoke,
}: Readonly<InviteLinkActionsRowProps>) {
	const { t } = useTranslation();
	return (
		<div className="share-link-row">
			<Select
				value={linkRole}
				onChange={(e) => onLinkRoleChange(e.target.value as InviteLinkRole)}
				aria-label={t('share.roleLabel')}
				style={{ width: 'auto', flex: 'none' }}
			>
				<option value="editor">{t('share.editor')}</option>
				<option value="reader">{t(READER_LABEL_KEY)}</option>
			</Select>
			<Button type="button" variant="secondary" size="sm" disabled={isCreating} onClick={onCreate} style={{ flex: 'none' }}>
				{hasLink ? t('share.linkRegenerate') : t('share.linkCreate')}
			</Button>
			{hasLink ? (
				<Button type="button" variant="ghost" size="sm" disabled={isRevoking} onClick={onRevoke} style={{ flex: 'none' }}>
					{t('share.linkRevoke')}
				</Button>
			) : null}
		</div>
	);
}

/** The "anyone with the link" section: shows the document's current share
 * link, if any, or lets the owner create one. A non-owner member gets a
 * 404 from the backend on load and this section silently renders nothing —
 * managing the link is owner-exclusive, same restriction as the email
 * invite. */
export function InviteLinkSection({ docId }: Readonly<{ docId: DocumentId }>) {
	const { t } = useTranslation();
	const { link, isOwner, copyRow, actionsRow, createError } = useInviteLinkState(docId, t);

	if (!isOwner) {
		return null;
	}

	return (
		<div className="share-link">
			<div className="share-link__label">
				<LinkIcon size={14} />
				<span>{t('share.linkTitle')}</span>
			</div>

			{link ? <ExistingInviteLinkRow link={link} {...copyRow} /> : null}

			<InviteLinkActionsRow {...actionsRow} />

			{createError ? (
				<p className="form-error" role="alert">
					{translateError(t, createError)}
				</p>
			) : null}
			<p className="share-link__hint">{t('share.linkHint')}</p>
		</div>
	);
}
