import { useSyncExternalStore } from 'react';

import { getToasts, subscribeToasts, type Toast } from '../lib/toast';

export function useToasts(): Toast[] {
	return useSyncExternalStore(subscribeToasts, getToasts);
}
