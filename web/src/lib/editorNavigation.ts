import type { EditorView } from '@codemirror/view';

type FindMatchIndexParams = {
	lowerValue: string;
	lowerQuery: string;
	direction: 1 | -1;
	findMatchStart: number | null;
};

export function findMatchIndex({ lowerValue, lowerQuery, direction, findMatchStart }: FindMatchIndexParams): number {
	if (direction === 1) {
		const from = findMatchStart === null ? 0 : findMatchStart + 1;
		const index = lowerValue.indexOf(lowerQuery, from);
		return index === -1 ? lowerValue.indexOf(lowerQuery) : index;
	}
	const from = findMatchStart === null ? lowerValue.length : findMatchStart - 1;
	const index = lowerValue.lastIndexOf(lowerQuery, from);
	return index === -1 ? lowerValue.lastIndexOf(lowerQuery) : index;
}

/** How many times lowerQuery occurs in lowerValue — the "0 de 0"/"2 de 7"
 * feedback in EditorFindBar needs a total, not just "was there a next
 * match" (UX_REVIEW.md 3.3). */
export function countMatches(lowerValue: string, lowerQuery: string): number {
	if (!lowerQuery) {
		return 0;
	}
	let count = 0;
	let from = 0;
	for (;;) {
		const index = lowerValue.indexOf(lowerQuery, from);
		if (index === -1) {
			return count;
		}
		count++;
		from = index + lowerQuery.length;
	}
}

/** The 1-based ordinal of the match starting at matchIndex, counting from
 * the start of the text — e.g. "you're viewing match 2 of 7". */
export function matchOrdinalAt(lowerValue: string, lowerQuery: string, matchIndex: number): number {
	if (!lowerQuery) {
		return 0;
	}
	let count = 0;
	let from = 0;
	for (;;) {
		const index = lowerValue.indexOf(lowerQuery, from);
		if (index === -1 || index > matchIndex) {
			return count;
		}
		count++;
		from = index + lowerQuery.length;
	}
}

export function goToStart(view: EditorView | null) {
	if (!view) {
		return;
	}
	view.focus();
	view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
	view.scrollDOM.scrollTop = 0;
}

export function goToEnd(view: EditorView | null) {
	if (!view) {
		return;
	}
	view.focus();
	const end = view.state.doc.length;
	view.dispatch({ selection: { anchor: end }, scrollIntoView: true });
	view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
}
