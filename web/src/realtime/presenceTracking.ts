import type { Dispatch, SetStateAction } from 'react';

import { toUserId, type UserId } from '../api/ids';
import type { DocProvider } from './provider';

// A minute with no activity anywhere in the tab marks the local user as
// "away" — connected, but not actually at the keyboard right now.
export const IDLE_TIMEOUT_MS = 60_000;
export const ACTIVITY_EVENTS = ['keydown', 'mousedown', 'mousemove', 'scroll', 'touchstart'] as const;

// A peer's cursor/selection moving within the last 2s is the "typing now"
// signal — imprecise (any awareness change counts, not just a keystroke),
// but it's the same cheap heuristic most collaborative editors use.
export const TYPING_WINDOW_MS = 2000;
export const TYPING_POLL_MS = 500;

export function makeMemberJoinedHandler(setOnlineUserIds: Dispatch<SetStateAction<Set<UserId>>>) {
	return (userId: string) => setOnlineUserIds((ids) => new Set(ids).add(toUserId(userId)));
}

export function makeMemberLeftHandler(setOnlineUserIds: Dispatch<SetStateAction<Set<UserId>>>) {
	return (userId: string) =>
		setOnlineUserIds((ids) => {
			const next = new Set(ids);
			next.delete(toUserId(userId));
			return next;
		});
}

// "Away" tracks idle time separately from connected/disconnected (that part
// is the hub's responsibility) — someone can be connected but not actually
// at the keyboard. A minute with no activity anywhere in the tab marks us
// away; any activity marks us online again.
export function setupActivityTracking(provider: DocProvider): () => void {
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	function markActive() {
		provider.setPresenceStatus('online');
		if (idleTimer) {
			clearTimeout(idleTimer);
		}
		idleTimer = setTimeout(() => provider.setPresenceStatus('away'), IDLE_TIMEOUT_MS);
	}
	for (const eventName of ACTIVITY_EVENTS) {
		window.addEventListener(eventName, markActive, { passive: true });
	}
	markActive();

	return () => {
		if (idleTimer) {
			clearTimeout(idleTimer);
		}
		for (const eventName of ACTIVITY_EVENTS) {
			window.removeEventListener(eventName, markActive);
		}
	};
}

// Broadcasts via awareness, so each peer's own copy of awayUserIds and
// typingUserIds updates the same way onlineUserIds does for joins/leaves.
// "Typing now" is also re-checked on a timer — unlike away/online, it needs
// to switch itself off even when nobody sends a *new* awareness update.
export function setupPresenceTracking(
	provider: DocProvider,
	setAwayUserIds: Dispatch<SetStateAction<Set<UserId>>>,
	setTypingUserIds: Dispatch<SetStateAction<Set<UserId>>>,
): () => void {
	const updateAwayUserIds = () => setAwayUserIds(new Set([...provider.getAwayUserIds()].map(toUserId)));
	provider.awareness.on('change', updateAwayUserIds);

	const updateTypingUserIds = () => setTypingUserIds(new Set([...provider.getRecentlyActiveUserIds(TYPING_WINDOW_MS)].map(toUserId)));
	provider.awareness.on('change', updateTypingUserIds);
	const typingPoll = setInterval(updateTypingUserIds, TYPING_POLL_MS);

	return () => {
		clearInterval(typingPoll);
		provider.awareness.off('change', updateTypingUserIds);
		provider.awareness.off('change', updateAwayUserIds);
	};
}
