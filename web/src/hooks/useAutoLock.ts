import { useSyncExternalStore } from 'react';

import { getAutoLockState, setAutoLockEnabled, subscribeAutoLock } from '../lib/autoLock';

export function useAutoLock() {
	const state = useSyncExternalStore(subscribeAutoLock, getAutoLockState);
	return { ...state, setEnabled: setAutoLockEnabled };
}
