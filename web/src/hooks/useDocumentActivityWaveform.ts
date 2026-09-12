import { useEffect, useState } from 'react';

import { listUpdates } from '../api/docs';
import type { DocumentId } from '../api/ids';
import { groupUpdates } from '../lib/yjsHistory';

const BAR_COUNT = 6;

/** Bar heights (0-1, tallest group = 1) for the vault's "currently
 * editing" hero card — real activity data (the last few edit sessions'
 * sizes), not decoration. Only fetched for the one document the vault
 * highlights as a hero, never per-row — a full update list per row would
 * be one request per document just to draw a sparkline. */
export function useDocumentActivityWaveform(docId: DocumentId | undefined): number[] {
	const [bars, setBars] = useState<number[]>([]);

	useEffect(() => {
		if (!docId) {
			setBars([]);
			return;
		}
		let isCancelled = false;
		listUpdates(docId)
			.then((updates) => {
				if (isCancelled) {
					return;
				}
				const groups = groupUpdates(updates);
				const lastGroups = groups.slice(-BAR_COUNT);
				const maxCount = Math.max(1, ...lastGroups.map((g) => g.updateCount));
				setBars(lastGroups.map((g) => g.updateCount / maxCount));
			})
			.catch(() => {
				if (!isCancelled) {
					setBars([]);
				}
			});
		return () => {
			isCancelled = true;
		};
	}, [docId]);

	return bars;
}
