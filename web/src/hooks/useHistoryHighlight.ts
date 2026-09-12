import { useEffect, useRef, useState } from 'react';

import type { UpdateItemDTO } from '../api/docTypes';
import { HISTORY_HIGHLIGHT_DURATION_MS } from '../constants';
import { changedRange } from '../lib/yjsHistory';

export type HistoryHighlight = { start: number; end: number; authorId: string };

/** Highlights what the current step actually added relative to the
 * previous one, colored by that update's author — a brief visual cue of
 * "this was just written", the same idea as the live editor's remote-edit
 * flash (realtime/documentConnection.ts), applied to replay instead. */
export function useHistoryHighlight(text: string, selectedId: number | null, updates: UpdateItemDTO[]): HistoryHighlight | null {
	const [highlight, setHighlight] = useState<HistoryHighlight | null>(null);
	const prevTextRef = useRef('');

	useEffect(() => {
		const prev = prevTextRef.current;
		prevTextRef.current = text;
		if (prev === text || selectedId === null) {
			setHighlight(null);
			return;
		}
		const range = changedRange(prev, text);
		if (range.end <= range.start) {
			setHighlight(null);
			return;
		}
		const authorId = updates.find((u) => u.id === selectedId)?.author_id ?? '';
		setHighlight({ ...range, authorId });
		const timer = setTimeout(() => setHighlight(null), HISTORY_HIGHLIGHT_DURATION_MS);
		return () => clearTimeout(timer);
	}, [text, selectedId, updates]);

	return highlight;
}
