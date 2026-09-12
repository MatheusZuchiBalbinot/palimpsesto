import type { TFunction } from 'i18next';

import type { MemberDTO } from '../api/docTypes';
import type { UserId } from '../api/ids';
import type { AvatarPresence } from '../components/Avatar';
import type { ConnectionStatus } from '../realtime/provider';

export function presenceFor(userId: UserId, onlineUserIds: Set<UserId>, awayUserIds: Set<UserId>): AvatarPresence {
	if (!onlineUserIds.has(userId)) {
		return 'offline';
	}
	return awayUserIds.has(userId) ? 'away' : 'online';
}

export type PresenceLabelParams = {
	member: MemberDTO;
	onlineUserIds: Set<UserId>;
	awayUserIds: Set<UserId>;
	typingUserIds: Set<UserId>;
	t: TFunction;
};

export function presenceLabelFor({ member, onlineUserIds, awayUserIds, typingUserIds, t }: PresenceLabelParams): string {
	if (typingUserIds.has(member.user_id)) {
		return t('editor.typing');
	}
	const presence = presenceFor(member.user_id, onlineUserIds, awayUserIds);
	if (presence === 'online') {
		return t('editor.online');
	}
	if (presence === 'away') {
		return t('editor.away');
	}
	return t(`share.${member.role}`);
}

type SyncStatusLabelParams = {
	status: ConnectionStatus;
	pendingCount: number;
	t: TFunction;
};

export function syncStatusLabel({ status, pendingCount, t }: SyncStatusLabelParams): string {
	if (status !== 'connected') {
		return t(`editor.connectionStatus.${status}`);
	}
	if (pendingCount > 0) {
		return t('editor.syncing');
	}
	return t('editor.savedNow');
}

export type SyncStatusTone = 'ok' | 'warn' | 'danger';

/** The color a sync-status dot should be — connection state is the most
 * important piece of information while writing (UX_REVIEW.md 3.7): if the
 * socket drops, whatever's being typed doesn't exist anywhere but this
 * tab yet, and a bare word in the header doesn't carry that urgency. */
export function syncStatusTone(status: ConnectionStatus, pendingCount: number): SyncStatusTone {
	if (status === 'disconnected') {
		return 'danger';
	}
	if (status === 'connecting' || pendingCount > 0) {
		return 'warn';
	}
	return 'ok';
}
