import { useCallback, useState } from 'react';

import type { DocumentId, UserId } from '../api/ids';
import { getPinnedIds, setPinnedIds } from '../lib/pinnedDocuments';

export function usePinnedDocuments(userId: UserId | undefined) {
	// Lazy initializer, not an effect: useSession() resolves synchronously
	// (see hooks/useSession.ts), and RequireSession guarantees a session
	// exists for any page rendering this component, so the user id is
	// already known on the very first render.
	const [pinnedIds, setPinnedIdsState] = useState<Set<DocumentId>>(() => (userId ? getPinnedIds(userId) : new Set()));

	const togglePin = useCallback(
		(docId: DocumentId) => {
			if (!userId) {
				return;
			}
			setPinnedIdsState((prev) => {
				const next = new Set(prev);
				if (next.has(docId)) {
					next.delete(docId);
				} else {
					next.add(docId);
				}
				setPinnedIds(userId, next);
				return next;
			});
		},
		[userId],
	);

	return { pinnedIds, togglePin };
}
