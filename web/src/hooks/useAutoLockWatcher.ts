import { useEffect } from 'react';

import { startAutoLockWatcher, unlockNow } from '../lib/autoLock';
import { useSession } from './useSession';

/** Ties the idle watcher's lifetime to having a session at all — logged
 * out (or not yet past RequireSession's bootstrap check) means there's
 * nothing worth locking, and definitely no LockScreen that should ever be
 * able to show up over the login page. Mounted once, at the app root
 * (App.tsx). */
export function useAutoLockWatcher(): void {
	const session = useSession();

	useEffect(() => {
		if (!session) {
			unlockNow();
			return;
		}
		return startAutoLockWatcher();
	}, [session]);
}
