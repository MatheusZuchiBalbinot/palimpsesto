import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { MemberDTO } from '../api/docTypes';
import type { UserId } from '../api/ids';
import { AVATAR_SIZE_POPOVER, AVATAR_SIZE_STACK } from '../constants';
import { useDelayedVisibility } from '../hooks/useDelayedVisibility';
import { presenceFor } from '../lib/collaborationStatus';
import { Avatar, type AvatarPresence } from './Avatar';

type AvatarStackPopoverProps = {
	members: MemberDTO[];
	onlineUserIds: Set<UserId>;
	awayUserIds: Set<UserId>;
	/** Smaller sizes for compact contexts (e.g. a vault list row) — the
	 * default matches the editor header's stack. */
	avatarSize?: number;
	popoverAvatarSize?: number;
};

/** The vault list's "live now" stack only ever gets a flat member list
 * with no separate away tracking (that's an editor-session concept) — this
 * derives the members/onlineUserIds/awayUserIds trio AvatarStackPopover
 * needs from just that list, so DocumentRow and DocumentHeroCard don't
 * each repeat the same two-Set construction. */
export function presenceFromActiveUsers(activeUsers: MemberDTO[]): Pick<AvatarStackPopoverProps, 'members' | 'onlineUserIds' | 'awayUserIds'> {
	return {
		members: activeUsers,
		onlineUserIds: new Set(activeUsers.map((u) => u.user_id)),
		awayUserIds: new Set(),
	};
}

/** The vault list's compact avatar-stack sizing (DocumentRow, DocumentHeroCard)
 * — smaller than AvatarStackPopoverProps's own defaults, which are sized for
 * the editor header's stack instead. */
export const AVATAR_STACK_SIZES: Pick<AvatarStackPopoverProps, 'avatarSize' | 'popoverAvatarSize'> = {
	avatarSize: 26,
	popoverAvatarSize: 28,
};

const PRESENCE_RANK: Record<AvatarPresence, number> = { online: 2, away: 1, offline: 0 };

function sortByPresence(members: MemberDTO[], onlineUserIds: Set<UserId>, awayUserIds: Set<UserId>): MemberDTO[] {
	return [...members].sort((a, b) => {
		const aPresence = presenceFor(a.user_id, onlineUserIds, awayUserIds);
		const bPresence = presenceFor(b.user_id, onlineUserIds, awayUserIds);
		return PRESENCE_RANK[bPresence] - PRESENCE_RANK[aPresence];
	});
}

type AvatarStackPopoverRowProps = {
	member: MemberDTO;
	presence: AvatarPresence;
	statusLabel: string;
	avatarSize: number;
};

function AvatarStackPopoverRow({ member, presence, statusLabel, avatarSize }: Readonly<AvatarStackPopoverRowProps>) {
	return (
		<div className="avatar-stack-popover__row">
			<Avatar id={member.user_id} name={member.display_name || member.email} size={avatarSize} presence={presence} decorative />
			<div className="avatar-stack-popover__info">
				<span className="avatar-stack-popover__name">{member.display_name || member.email}</span>
				<span className="avatar-stack-popover__status">{statusLabel}</span>
			</div>
		</div>
	);
}

/** The header's avatar stack, plus a hover popover listing each member by
 * name and online status — just hovering the overlapping circles doesn't
 * say who's who. Stays mounted briefly after closing (see
 * useDelayedVisibility) so the fade/scale-out actually happens, same
 * pattern as Dropdown.tsx. */
export function AvatarStackPopover({
	members,
	onlineUserIds,
	awayUserIds,
	avatarSize = AVATAR_SIZE_STACK,
	popoverAvatarSize = AVATAR_SIZE_POPOVER,
}: Readonly<AvatarStackPopoverProps>) {
	const { t } = useTranslation();
	const { isOpen, isRendered, open: openPopover, close: closePopover } = useDelayedVisibility();

	const sortedMembers = sortByPresence(members, onlineUserIds, awayUserIds);

	const statusLabel: Record<AvatarPresence, string> = { online: t('editor.online'), away: t('editor.away'), offline: t('editor.offline') };

	function handleKeyDown(e: ReactKeyboardEvent) {
		if (e.key === 'Escape') {
			closePopover();
		}
	}

	return (
		<div className="avatar-stack-popover" onMouseEnter={openPopover} onMouseLeave={closePopover}>
			<button
				type="button"
				className="avatar-stack-trigger"
				aria-expanded={isOpen}
				aria-label={t('editor.whoIsHere')}
				onFocus={openPopover}
				onBlur={closePopover}
				onClick={() => (isOpen ? closePopover() : openPopover())}
				onKeyDown={handleKeyDown}
			>
				<div className="avatar-stack">
					{members.map((m, i) => (
						<Avatar
							key={m.user_id}
							id={m.user_id}
							name={m.display_name || m.email}
							size={avatarSize}
							overlap={i > 0}
							borderColor="var(--bg)"
							presence={presenceFor(m.user_id, onlineUserIds, awayUserIds)}
							decorative
						/>
					))}
				</div>
			</button>

			{isRendered ? (
				<div className={`avatar-stack-popover__panel${isOpen ? ' open' : ''}`}>
					{sortedMembers.map((m) => {
						const presence = presenceFor(m.user_id, onlineUserIds, awayUserIds);
						return (
							<AvatarStackPopoverRow
								key={m.user_id}
								member={m}
								presence={presence}
								statusLabel={statusLabel[presence]}
								avatarSize={popoverAvatarSize}
							/>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
