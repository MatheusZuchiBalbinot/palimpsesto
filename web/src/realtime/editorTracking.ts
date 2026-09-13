import type { EditorView } from '@codemirror/view';
import type { Dispatch, SetStateAction } from 'react';
import * as Y from 'yjs';

import type { DocProvider } from './provider';

export const REMOTE_EDIT_FLASH_MS = 400;

export function wordCount(text: string): number {
	const trimmed = text.trim();
	return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export type SetupContentTrackingParams = {
	ydoc: Y.Doc;
	ytext: Y.Text;
	view: EditorView;
	provider: DocProvider;
	setCharCount: Dispatch<SetStateAction<number>>;
	setWordCountValue: Dispatch<SetStateAction<number>>;
};

// A plain <textarea> couldn't animate an individually inserted character —
// it was a single opaque text value, not per-character DOM nodes a
// transition could target, hence the flash-the-whole-field compromise below.
// CodeMirror's decorations could target the exact changed range instead, but
// that's a follow-up (see CODEMIRROR_PLAN.md) — this keeps the same visible
// behavior as before the migration, just retargeted at view.dom instead of
// the old textarea element.
export function setupContentTracking(params: SetupContentTrackingParams): () => void {
	const { ydoc, ytext, view, provider, setCharCount, setWordCountValue } = params;
	function updateCounts() {
		// Y.Text overrides toString() to return its actual text content, not
		// Object's default stringification.
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		const text = ytext.toString();
		setCharCount(text.length);
		setWordCountValue(wordCount(text));
	}

	let flashTimeout: ReturnType<typeof setTimeout> | undefined;
	function flashRemoteEdit() {
		const target = view.dom;
		target.classList.remove('cm-editor--remote-flash');
		// Forces a reflow so re-adding the class restarts the animation even
		// if the previous flash hasn't finished yet. The read itself is the
		// point (it forces the browser to apply pending layout); `void` is
		// needed here to satisfy no-unused-expressions, not because there's a
		// promise to discard — sonarjs/void-use's complaint about this exact
		// case is the false positive, not this line.
		// eslint-disable-next-line sonarjs/void-use
		void target.offsetWidth;
		target.classList.add('cm-editor--remote-flash');
		if (flashTimeout) {
			clearTimeout(flashTimeout);
		}
		flashTimeout = setTimeout(() => target.classList.remove('cm-editor--remote-flash'), REMOTE_EDIT_FLASH_MS);
	}

	// provider.ts tags the origin of every remotely-applied update as the
	// provider instance itself, which is what distinguishes it from our own
	// local edits here.
	function handleContentUpdate(_update: Uint8Array, origin: unknown) {
		updateCounts();
		if (origin === provider) {
			flashRemoteEdit();
		}
	}
	ydoc.on('update', handleContentUpdate);
	updateCounts();

	return () => {
		if (flashTimeout) {
			clearTimeout(flashTimeout);
		}
		ydoc.off('update', handleContentUpdate);
	};
}
