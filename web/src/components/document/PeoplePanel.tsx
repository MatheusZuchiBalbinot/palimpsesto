import { ChevronDown, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { MemberDTO, Role } from '../../api/docTypes';
import type { UserId } from '../../api/ids';
import { presenceFor, presenceLabelFor, type PresenceLabelParams } from '../../lib/collaborationStatus';
import { Avatar } from '../Avatar';
import { Dropdown, type DropdownEntry } from '../Dropdown';
import { READER_LABEL_KEY, ROLE_LABEL_KEY } from '../share/roleLabels';

type PeopleInviteRowProps = {
	onInvite: () => void;
};

function PeopleInviteRow({ onInvite }: Readonly<PeopleInviteRowProps>) {
	const { t } = useTranslation();
	return (
		<button type="button" className="member-row member-row--invite" onClick={onInvite}>
			<UserPlus size={15} />
			{t('editor.invitePeople')}
		</button>
	);
}

type MemberRowProps = {
	member: MemberDTO;
	presenceLabel: string;
	onlineUserIds: Set<UserId>;
	awayUserIds: Set<UserId>;
	canChangeRole: boolean;
	onChangeRole: (role: Exclude<Role, 'owner'>) => void;
};

function MemberRow({ member, presenceLabel, onlineUserIds, awayUserIds, canChangeRole, onChangeRole }: Readonly<MemberRowProps>) {
	const { t } = useTranslation();
	const roleItems: DropdownEntry[] = [
		{ label: t('share.editor'), onClick: () => onChangeRole('editor') },
		{ label: t(READER_LABEL_KEY), onClick: () => onChangeRole('reader') },
	];
	return (
		<div className="member-row">
			<Avatar
				id={member.user_id}
				name={member.display_name || member.email}
				size={26}
				presence={presenceFor(member.user_id, onlineUserIds, awayUserIds)}
				decorative
			/>
			<span className="member-row__name">{member.display_name || member.email}</span>
			{canChangeRole ? (
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
			) : (
				<span className="member-row__role">{presenceLabel}</span>
			)}
		</div>
	);
}

export type PeoplePanelProps = {
	members: MemberDTO[];
	onlineUserIds: Set<UserId>;
	awayUserIds: Set<UserId>;
	typingUserIds: Set<UserId>;
	ownUserId: string | undefined;
	onInvite: () => void;
	onChangeRole: (member: MemberDTO, role: Exclude<Role, 'owner'>) => void;
};

export function PeoplePanel({ members, onlineUserIds, awayUserIds, typingUserIds, ownUserId, onInvite, onChangeRole }: Readonly<PeoplePanelProps>) {
	const { t } = useTranslation();
	const isOwner = members.some((m) => m.user_id === ownUserId && m.role === 'owner');

	return (
		<div className="side-panel__body">
			<PeopleInviteRow onInvite={onInvite} />
			{members.length <= 1 ? <p className="settings-row__sub">{t('editor.membersEmpty')}</p> : null}
			{members.map((m) => {
				const presenceLabelInput: PresenceLabelParams = { member: m, onlineUserIds, awayUserIds, typingUserIds, t };
				return (
					<MemberRow
						key={m.user_id}
						member={m}
						presenceLabel={presenceLabelFor(presenceLabelInput)}
						onlineUserIds={onlineUserIds}
						awayUserIds={awayUserIds}
						canChangeRole={isOwner && m.role !== 'owner' && m.user_id !== ownUserId}
						onChangeRole={(role) => onChangeRole(m, role)}
					/>
				);
			})}
		</div>
	);
}
