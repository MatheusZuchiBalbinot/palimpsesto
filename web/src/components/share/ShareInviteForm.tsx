import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { Role } from '../../api/docTypes';
import { base64ToBytes, identityHash } from '../../crypto/identity';
import { useInviteeLookup } from '../../hooks/useInviteeLookup';
import { translateError } from '../../i18n/errors';
import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { Select } from '../Select';
import { Sigil } from '../Sigil';
import { READER_LABEL_KEY } from './roleLabels';

export type ShareInviteFormProps = {
	email: string;
	onEmailChange: (value: string) => void;
	role: Role;
	onRoleChange: (role: Role) => void;
	isPending: boolean;
	error: unknown;
	onSubmit: (e: SubmitEvent<HTMLFormElement>) => void;
};

/** The invitee's own avatar + name + sigil, resolved from their email
 * before the invite is even sent (UX_REVIEW.md 4.10) — turns "invite" into
 * "confirm this is the right person", using the same sigil the project
 * already relies on for out-of-band identity verification. */
function InviteePreview({ invitee }: Readonly<{ invitee: NonNullable<ReturnType<typeof useInviteeLookup>['invitee']> }>) {
	const { t } = useTranslation();
	const name = invitee.display_name || t('share.invitePreviewUnnamed');
	const hash = identityHash(base64ToBytes(invitee.identity_pub), base64ToBytes(invitee.signing_pub));
	return (
		<div className="share-invite-preview">
			<Avatar id={invitee.user_id} name={name} size={22} decorative />
			<span className="share-invite-preview__name">{name}</span>
			<Sigil hash={hash} size={22} />
		</div>
	);
}

export function ShareInviteForm({ email, onEmailChange, role, onRoleChange, isPending, error, onSubmit }: Readonly<ShareInviteFormProps>) {
	const { t } = useTranslation();
	const { invitee } = useInviteeLookup(email);
	return (
		<>
			<form className="share-invite-row" onSubmit={onSubmit}>
				<input
					className="input"
					type="email"
					required
					placeholder={t('share.invitePlaceholder')}
					aria-label={t('share.invitePlaceholder')}
					value={email}
					onChange={(e) => onEmailChange(e.target.value)}
					style={{ flex: 1, minWidth: 0 }}
				/>
				<Select
					value={role}
					onChange={(e) => onRoleChange(e.target.value as Role)}
					aria-label={t('share.roleLabel')}
					style={{ width: 'auto', flex: 'none' }}
				>
					<option value="editor">{t('share.editor')}</option>
					<option value="reader">{t(READER_LABEL_KEY)}</option>
				</Select>
				<Button type="submit" size="sm" disabled={isPending} style={{ flex: 'none' }}>
					{t('share.invite')}
				</Button>
			</form>
			{invitee ? <InviteePreview invitee={invitee} /> : null}
			{error ? (
				<p className="form-error" role="alert" style={{ marginTop: 8 }}>
					{translateError(t, error)}
				</p>
			) : null}
		</>
	);
}
