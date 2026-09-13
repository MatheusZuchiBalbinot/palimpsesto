import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { countMatches, findMatchIndex, goToEnd, goToStart, matchOrdinalAt } from '../../lib/editorNavigation';

// Characterization tests for the pure string logic behind the editor's find
// bar (Ctrl+F) — written while migrating the editor from a plain <textarea>
// to CodeMirror (CODEMIRROR_PLAN.md item 8) so this logic, which didn't
// change, has a safety net it never had before.

// CodeMirror schedules its own layout measurement via requestAnimationFrame,
// which jsdom doesn't fully support (no Range.getClientRects) — harmless in a
// real browser, but it fires as an unhandled rejection here if a view outlives
// its test, so every view a test creates gets torn down in afterEach.
const openViews: EditorView[] = [];

function createView(doc: string): EditorView {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const view = new EditorView({ state: EditorState.create({ doc }), parent: container });
	openViews.push(view);
	return view;
}

afterEach(() => {
	while (openViews.length > 0) {
		openViews.pop()?.destroy();
	}
});

describe('countMatches', () => {
	it('returns 0 for an empty query', () => {
		expect(countMatches('hello world', '')).toBe(0);
	});

	it('counts non-overlapping occurrences', () => {
		expect(countMatches('abcabcabc', 'abc')).toBe(3);
	});

	it('counts overlap-adjacent occurrences without double-counting shared characters', () => {
		expect(countMatches('aaaa', 'aa')).toBe(2);
	});
});

describe('matchOrdinalAt', () => {
	const text = 'cat hat cat mat cat';
	const FIRST_CAT = 0;
	const SECOND_CAT = 8;
	const THIRD_CAT = 16;

	it('returns the 1-based position of the match at the given index', () => {
		expect(matchOrdinalAt(text, 'cat', FIRST_CAT)).toBe(1);
		expect(matchOrdinalAt(text, 'cat', SECOND_CAT)).toBe(2);
		expect(matchOrdinalAt(text, 'cat', THIRD_CAT)).toBe(3);
	});

	it('returns 0 for an empty query', () => {
		expect(matchOrdinalAt('hello', '', FIRST_CAT)).toBe(0);
	});
});

describe('findMatchIndex', () => {
	// A leading character before the first match matters here: it's what
	// makes backward search from that first match actually wrap around
	// instead of re-finding itself (lastIndexOf clamps a negative fromIndex
	// to 0, so a match sitting at index 0 would otherwise "wrap" to itself).
	const text = 'xcat hat cat mat cat';
	const FIRST_CAT = 1;
	const SECOND_CAT = 9;
	const THIRD_CAT = 17;

	it('finds the first match forward from the start when nothing is selected yet', () => {
		expect(findMatchIndex({ lowerValue: text, lowerQuery: 'cat', direction: 1, findMatchStart: null })).toBe(FIRST_CAT);
	});

	it('finds the next match forward from the current one', () => {
		expect(findMatchIndex({ lowerValue: text, lowerQuery: 'cat', direction: 1, findMatchStart: FIRST_CAT })).toBe(SECOND_CAT);
	});

	it('wraps around to the first match after the last one', () => {
		expect(findMatchIndex({ lowerValue: text, lowerQuery: 'cat', direction: 1, findMatchStart: THIRD_CAT })).toBe(FIRST_CAT);
	});

	it('finds the previous match backward from the current one', () => {
		expect(findMatchIndex({ lowerValue: text, lowerQuery: 'cat', direction: -1, findMatchStart: THIRD_CAT })).toBe(SECOND_CAT);
	});

	it('wraps around to the last match before the first one', () => {
		expect(findMatchIndex({ lowerValue: text, lowerQuery: 'cat', direction: -1, findMatchStart: FIRST_CAT })).toBe(THIRD_CAT);
	});

	it('returns -1 when the query has no match at all', () => {
		expect(findMatchIndex({ lowerValue: text, lowerQuery: 'dog', direction: 1, findMatchStart: null })).toBe(-1);
	});
});

describe('goToStart / goToEnd', () => {
	it('does nothing when there is no view', () => {
		expect(() => goToStart(null)).not.toThrow();
		expect(() => goToEnd(null)).not.toThrow();
	});

	it('goToStart places the cursor at document position 0', () => {
		const view = createView('hello world');
		view.dispatch({ selection: { anchor: 8 } });
		goToStart(view);
		expect(view.state.selection.main.head).toBe(0);
	});

	it('goToEnd places the cursor at the end of the document', () => {
		const view = createView('hello world');
		goToEnd(view);
		expect(view.state.selection.main.head).toBe('hello world'.length);
	});
});
