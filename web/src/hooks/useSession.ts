import { useSyncExternalStore } from 'react';

import { getSession, subscribeSession, type Session } from '../auth/session';

export function useSession(): Session | null {
	return useSyncExternalStore(subscribeSession, getSession);
}
