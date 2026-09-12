import { useRef, useState, type RefObject } from 'react';

import type { EditorFindBarProps } from '../components/document/EditorFindBar';
import { countMatches, findMatchIndex, matchOrdinalAt } from '../lib/textareaNavigation';

/** The editor's inline find bar (Ctrl+F): open/closed state, the query, the
 * current match, and the navigation logic together — a closed unit nothing
 * else in DocumentPage touches, so it doesn't need to live in the page's
 * own state directly. */
export function useFindInTextarea(textareaRef: RefObject<HTMLTextAreaElement | null>) {
	const [isFindOpen, setIsFindOpen] = useState(false);
	const [findQuery, setFindQuery] = useState('');
	const [findMatchStart, setFindMatchStart] = useState<number | null>(null);
	// Sighted feedback for "0 of 0" / "2 of 7" (UX_REVIEW.md 3.3) — recomputed
	// on every query edit and every navigation, not tracked reactively
	// against the textarea's own value (a plain ref, not state).
	const [matchCount, setMatchCount] = useState(0);
	const [matchOrdinal, setMatchOrdinal] = useState(0);
	const findInputRef = useRef<HTMLInputElement>(null);

	function findNext(direction: 1 | -1) {
		const textarea = textareaRef.current;
		if (!textarea || !findQuery) {
			return;
		}
		const lowerValue = textarea.value.toLowerCase();
		const lowerQuery = findQuery.toLowerCase();
		setMatchCount(countMatches(lowerValue, lowerQuery));
		const index = findMatchIndex({ lowerValue, lowerQuery, direction, findMatchStart });
		if (index === -1) {
			setFindMatchStart(null);
			setMatchOrdinal(0);
			return;
		}
		setFindMatchStart(index);
		setMatchOrdinal(matchOrdinalAt(lowerValue, lowerQuery, index));
		textarea.focus();
		textarea.setSelectionRange(index, index + findQuery.length);
	}

	function handleFindQueryChange(value: string) {
		setFindQuery(value);
		setFindMatchStart(null);
		const textarea = textareaRef.current;
		const count = textarea && value ? countMatches(textarea.value.toLowerCase(), value.toLowerCase()) : 0;
		setMatchCount(count);
		setMatchOrdinal(0);
	}

	const findBar: EditorFindBarProps = {
		findInputRef,
		findQuery,
		onQueryChange: handleFindQueryChange,
		onFindNext: findNext,
		onClose: () => setIsFindOpen(false),
		matchCount,
		matchOrdinal,
	};

	return { isFindOpen, setIsFindOpen, findBar };
}
