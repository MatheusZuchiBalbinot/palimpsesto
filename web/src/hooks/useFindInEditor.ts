import { useRef, useState, type RefObject } from 'react';

import type { EditorFindBarProps } from '../components/document/EditorFindBar';
import { countMatches, findMatchIndex, matchOrdinalAt } from '../lib/editorNavigation';
import type { CollabEditorHandle } from '../realtime/codemirrorEditor';

/** The editor's inline find bar (Ctrl+F): open/closed state, the query, the
 * current match, and the navigation logic together — a closed unit nothing
 * else in DocumentPage touches, so it doesn't need to live in the page's
 * own state directly.
 *
 * Can't just fall back to the browser's native Ctrl+F: CodeMirror only
 * renders the viewport (see UI_POLISH_PLAN.md — a 200-line document has ~13
 * `.cm-line` elements in the DOM at a time), so native find is physically
 * unable to see text that's scrolled away. This searches the actual
 * document text (view.state.doc), not the DOM. */
export function useFindInEditor(editorHandleRef: RefObject<CollabEditorHandle | null>) {
	const [isFindOpen, setIsFindOpen] = useState(false);
	const [findQuery, setFindQuery] = useState('');
	const [findMatchStart, setFindMatchStart] = useState<number | null>(null);
	// Sighted feedback for "0 de 0" / "2 de 7" (UX_REVIEW.md 3.3) — recomputed
	// on every query edit and every navigation, not tracked reactively
	// against the editor's own value (a plain ref, not state).
	const [matchCount, setMatchCount] = useState(0);
	const [matchOrdinal, setMatchOrdinal] = useState(0);
	const findInputRef = useRef<HTMLInputElement>(null);

	/** Finds `query`'s next/previous occurrence from `fromIndex`, selects and
	 * scrolls to it, and refreshes the "highlight every match" decorations —
	 * the one piece of logic every entry point (typing, Enter, prev/next)
	 * shares, so `handleFindQueryChange` can search-as-you-type without
	 * waiting for a stale `findQuery` from React state.
	 *
	 * `focusEditor` must stay false for the search-as-you-type path: calling
	 * view.focus() there would pull DOM focus out of the find input after
	 * the very first keystroke that finds a match, and every character typed
	 * after that would land in the document instead of the query field. Only
	 * an explicit navigation (Enter, prev/next) — where the user has already
	 * finished typing and wants to jump into the document — should focus it. */
	function locate(query: string, direction: 1 | -1, fromIndex: number | null, focusEditor: boolean) {
		const view = editorHandleRef.current?.view;
		if (!view || !query) {
			editorHandleRef.current?.setFindHighlight(null);
			setMatchCount(0);
			setMatchOrdinal(0);
			setFindMatchStart(null);
			return;
		}
		const lowerValue = view.state.doc.toString().toLowerCase();
		const lowerQuery = query.toLowerCase();
		setMatchCount(countMatches(lowerValue, lowerQuery));
		const index = findMatchIndex({ lowerValue, lowerQuery, direction, findMatchStart: fromIndex });
		if (index === -1) {
			setFindMatchStart(null);
			setMatchOrdinal(0);
			editorHandleRef.current?.setFindHighlight({ query: lowerQuery, currentFrom: null });
			return;
		}
		setFindMatchStart(index);
		setMatchOrdinal(matchOrdinalAt(lowerValue, lowerQuery, index));
		if (focusEditor) {
			view.focus();
		}
		view.dispatch({ selection: { anchor: index, head: index + query.length }, scrollIntoView: true });
		editorHandleRef.current?.setFindHighlight({ query: lowerQuery, currentFrom: index });
	}

	function findNext(direction: 1 | -1) {
		locate(findQuery, direction, findMatchStart, true);
	}

	function handleFindQueryChange(value: string) {
		setFindQuery(value);
		// Jumps to the first match from the top of the document on every
		// keystroke, the same "don't wait for Enter" feel a native browser
		// find has — rather than only recomputing the count and requiring
		// Enter to actually navigate anywhere. Doesn't move focus (see
		// `locate`'s comment) — the match scrolls into view and highlights,
		// but typing stays in the input until the user explicitly navigates.
		locate(value, 1, null, false);
	}

	const findBar: EditorFindBarProps = {
		findInputRef,
		findQuery,
		onQueryChange: handleFindQueryChange,
		onFindNext: findNext,
		onClose: () => {
			setIsFindOpen(false);
			editorHandleRef.current?.setFindHighlight(null);
		},
		matchCount,
		matchOrdinal,
	};

	return { isFindOpen, setIsFindOpen, findBar };
}
