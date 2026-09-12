// Same shape as theme.ts/session.ts: module-level state + subscribe,
// reactive through useSyncExternalStore (hooks/useAutoLock.ts) — no
// context provider needed, and the idle watcher below lives here too
// since it's this store's own reason to change, not a React effect's.
import { AUTO_LOCK_IDLE_MS } from '../constants';

const STORAGE_KEY = 'palimpsesto:autoLock';

export type AutoLockState = {
	isEnabled: boolean;
	isLocked: boolean;
};

function readStoredEnabled(): boolean {
	try {
		return localStorage.getItem(STORAGE_KEY) === 'on';
	} catch {
		return false;
	}
}

let current: AutoLockState = { isEnabled: readStoredEnabled(), isLocked: false };
const listeners = new Set<() => void>();

function notify(): void {
	listeners.forEach((listener) => listener());
}

export function getAutoLockState(): AutoLockState {
	return current;
}

export function subscribeAutoLock(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function setAutoLockEnabled(isEnabled: boolean): void {
	current = { isEnabled, isLocked: isEnabled && current.isLocked };
	try {
		localStorage.setItem(STORAGE_KEY, isEnabled ? 'on' : 'off');
	} catch {
		// The preference just doesn't survive a reload — not worth failing over.
	}
	notify();
}

/** Called by the idle watcher below, and by nothing else — locking is
 * never a direct user action, only something that happens to them. */
function lockNow(): void {
	if (!current.isEnabled || current.isLocked) {
		return;
	}
	current = { ...current, isLocked: true };
	notify();
}

/** The only way isLocked ever goes back to false — LockScreen calls this
 * once it has confirmed the password for real (auth/actions.ts's
 * verifyPassword), never on its own say-so. */
export function unlockNow(): void {
	if (!current.isLocked) {
		return;
	}
	current = { ...current, isLocked: false };
	notify();
}

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;

let idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
	if (idleTimer) {
		clearTimeout(idleTimer);
	}
	if (current.isEnabled && !current.isLocked) {
		idleTimer = setTimeout(lockNow, AUTO_LOCK_IDLE_MS);
	}
}

let stopWatching: (() => void) | null = null;

/** Starts (or restarts) the idle watcher — call once there's a session to
 * protect, and call the returned cleanup once there isn't (see
 * hooks/useAutoLockWatcher.ts, its only caller). Safe to call again while
 * already watching: tears down the previous listeners first, rather than
 * layering a second set. */
export function startAutoLockWatcher(): () => void {
	stopWatching?.();
	resetIdleTimer();
	for (const event of ACTIVITY_EVENTS) {
		document.addEventListener(event, resetIdleTimer);
	}
	stopWatching = () => {
		if (idleTimer) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
		for (const event of ACTIVITY_EVENTS) {
			document.removeEventListener(event, resetIdleTimer);
		}
		stopWatching = null;
	};
	return stopWatching;
}
