import { useEffect, useRef, type KeyboardEvent } from 'react';

const MAX_VISIBLE_LINES = 4;

/** An auto-growing (1→4 lines) textarea that submits on Enter, breaks a
 * line on Shift+Enter, and also submits on Ctrl/Cmd+Enter — the compose
 * pattern every comment box has used since forever (UX_REVIEW.md 4.1),
 * shared here since both the comment composer and inline comment editing
 * need it. */
export function useComposeTextarea(value: string, onSubmit: () => void) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const el = textareaRef.current;
		if (!el) {
			return;
		}
		el.style.height = 'auto';
		const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '20');
		const maxHeight = lineHeight * MAX_VISIBLE_LINES;
		const isClamped = el.scrollHeight > maxHeight;
		el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
		// overflow-y stays hidden until content actually exceeds the 4-line
		// cap — "auto" alone left a 1px phantom overflow from scrollHeight
		// being measured a beat before the new height applies, which was
		// enough for Windows' classic scrollbar (arrow buttons and all) to
		// show up on an empty, single-line box.
		el.style.overflowY = isClamped ? 'auto' : 'hidden';
	}, [value]);

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		// Plain Enter submits; Shift+Enter always breaks a line instead
		// (falls through, untouched); Ctrl/Cmd+Enter submits regardless of
		// Shift, as the explicit alternative some people reach for out of
		// habit.
		const shouldSubmit = e.key === 'Enter' && (!e.shiftKey || e.ctrlKey || e.metaKey);
		if (shouldSubmit) {
			e.preventDefault();
			onSubmit();
		}
	}

	return { textareaRef, handleKeyDown };
}
