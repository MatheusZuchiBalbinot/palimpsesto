import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { InviteDTO, MemberDTO, Role } from '../../api/docTypes';
import type { InviteId, UserId } from '../../api/ids';
import { AVATAR_SIZE_SHARE_MEMBER } from '../../constants';
import { translateError } from '../../i18n/errors';
import { Avatar } from '../Avatar';
import { Dropdown, type DropdownEntry } from '../Dropdown';
import { READER_LABEL_KEY, ROLE_LABEL_KEY } from './roleLabels';

type ShareMemberRoleCellProps = {
	member: MemberDTO;
	canChangeRole: boolean;
	onChangeRole: (role: Exclude<Role, 'owner'>) => void;
	canGrantAccess: boolean;
	isGranting: boolean;
	onGrantAccess: () => void;
};

function ShareMemberRoleCell({ member, canChangeRole, onChangeRole, canGrantAccess, isGranting, onGrantAccess }: Readonly<ShareMemberRoleCellProps>) {
	const { t } = useTranslation();

	if (!member.has_wrapped_dek) {
		return (
			<>
				<span className="share-member__role share-member__role--muted">{t('share.pending')}</span>
				{canGrantAccess ? (
					<button type="button" className="share-member__remove" disabled={isGranting} onClick={onGrantAccess}>
						{t('share.grantAccess')}
					</button>
				) : null}
			</>
		);
	}

	if (canChangeRole) {
		const roleItems: DropdownEntry[] = [
			{ label: t('share.editor'), onClick: () => onChangeRole('editor') },
			{ label: t(READER_LABEL_KEY), onClick: () => onChangeRole('reader') },
		];
		return (
			<Dropdown
				align="right"
				trigger={({ isOpen, onClick, triggerRef }) => (
					<button
						ref={triggerRef}
						type="button"
						className="share-member__role share-member__role--select"
						aria-haspopup="menu"
						aria-expanded={isOpen}
						aria-label={t('share.roleLabel')}
						onClick={onClick}
					>
						{t(ROLE_LABEL_KEY[member.role])}
						<ChevronDown size={12} />
					</button>
				)}
				items={roleItems}
			/>
		);
	}

	return <span className="share-member__role">{t(ROLE_LABEL_KEY[member.role])}</span>;
}

type ShareMemberRowProps = {
	member: MemberDTO;
	canRemove: boolean;
	onRemove: () => void;
	canChangeRole: boolean;
	onChangeRole: (role: Exclude<Role, 'owner'>) => void;
	canGrantAccess: boolean;
	isGranting: boolean;
	onGrantAccess: () => void;
};

function ShareMemberRow({
	member,
	canRemove,
	onRemove,
	canChangeRole,
	onChangeRole,
	canGrantAccess,
	isGranting,
	onGrantAccess,
}: Readonly<ShareMemberRowProps>) {
	const { t } = useTranslation();
	const name = member.display_name || member.email;
	return (
		<li className="share-member">
			<Avatar id={member.user_id} name={name} size={AVATAR_SIZE_SHARE_MEMBER} decorative />
			<div style={{ flex: 1 }}>
				<div className="share-member__name">{name}</div>
				<div className="share-member__email">{member.email}</div>
			</div>
			<ShareMemberRoleCell
				member={member}
				canChangeRole={canChangeRole}
				onChangeRole={onChangeRole}
				canGrantAccess={canGrantAccess}
				isGranting={isGranting}
				onGrantAccess={onGrantAccess}
			/>
			{canRemove ? (
				<button type="button" className="share-member__remove" aria-label={t('share.remove', { name })} onClick={onRemove}>
					{t('share.remove_short')}
				</button>
			) : null}
		</li>
	);
}

type SharePendingInviteRowProps = {
	invite: InviteDTO;
	isCancelling: boolean;
	onCancel: () => void;
};

/** A row for someone invited by email who hasn't accepted yet — no
 * avatar identity to show beyond the name/email, since this browser has
 * never verified their key (that only happens once they accept). */
function SharePendingInviteRow({ invite, isCancelling, onCancel }: Readonly<SharePendingInviteRowProps>) {
	const { t } = useTranslation();
	const name = invite.invitee_name || invite.invitee_email;
	return (
		<li className="share-member">
			<Avatar id={invite.id} name={name} size={AVATAR_SIZE_SHARE_MEMBER} decorative />
			<div style={{ flex: 1 }}>
				<div className="share-member__name">{name}</div>
				<div className="share-member__email">{invite.invitee_email}</div>
			</div>
			<span className="share-member__role share-member__role--muted">{t('share.invitePending')}</span>
			<button type="button" className="share-member__remove" disabled={isCancelling} onClick={onCancel}>
				{t('share.cancelInvite')}
			</button>
		</li>
	);
}

export type ShareMembersListProps = {
	members: MemberDTO[];
	pendingInvites: InviteDTO[];
	cancellingInviteId: InviteId | null;
	onCancelInvite: (invite: InviteDTO) => void;
	isOwner: boolean;
	ownUserId: UserId;
	onRequestRemove: (member: MemberDTO) => void;
	loadError: unknown;
	removeError: unknown;
	grantingUserId: UserId | null;
	onGrantAccess: (member: MemberDTO) => void;
	onChangeRole: (member: MemberDTO, role: Exclude<Role, 'owner'>) => void;
};

export function ShareMembersList({
	members,
	pendingInvites,
	cancellingInviteId,
	onCancelInvite,
	isOwner,
	ownUserId,
	onRequestRemove,
	loadError,
	removeError,
	grantingUserId,
	onGrantAccess,
	onChangeRole,
}: Readonly<ShareMembersListProps>) {
	const { t } = useTranslation();
	return (
		<>
			<ul className="share-member-list" style={{ padding: '0 26px' }}>
				{members.map((member) => (
					<ShareMemberRow
						key={member.user_id}
						member={member}
						canRemove={isOwner && member.role !== 'owner'}
						onRemove={() => onRequestRemove(member)}
						canChangeRole={isOwner && member.role !== 'owner' && member.user_id !== ownUserId}
						onChangeRole={(role) => onChangeRole(member, role)}
						canGrantAccess={member.user_id !== ownUserId}
						isGranting={grantingUserId === member.user_id}
						onGrantAccess={() => onGrantAccess(member)}
					/>
				))}
				{pendingInvites.map((invite) => (
					<SharePendingInviteRow
						key={invite.id}
						invite={invite}
						isCancelling={cancellingInviteId === invite.id}
						onCancel={() => onCancelInvite(invite)}
					/>
				))}
			</ul>

			{loadError ? (
				<p className="form-error" role="alert" style={{ padding: '0 26px' }}>
					{translateError(t, loadError)}
				</p>
			) : null}
			{removeError ? (
				<p className="form-error" role="alert" style={{ padding: '0 26px' }}>
					{translateError(t, removeError)}
				</p>
			) : null}
		</>
	);
}
