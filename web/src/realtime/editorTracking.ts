import type { Dispatch, SetStateAction } from 'react';
import type { TextAreaBinding } from 'y-textarea';
import * as Y from 'yjs';

import type { DocProvider } from './provider';

export const REMOTE_EDIT_FLASH_MS = 400;

export function wordCount(text: string): number {
	const trimmed = text.trim();
	return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

// The native Ctrl+Z the browser gives a <textarea> for free operates over
// its own local edit history — which goes stale the instant a remote peer
// rewrites the value underneath it (that's exactly what TextAreaBinding's
// Y.Text observer does). A dedicated UndoManager tracks only *this*
// client's own transactions (trackedOrigins: [null], since TextAreaBinding's
// local edits transact with no origin, while provider.ts tags every
// remotely-applied update with the provider instance), so undo/redo only
// replays what this client actually typed.
export function setupUndoRedo(textarea: HTMLTextAreaElement, ytext: Y.Text): () => void {
	const undoManager = new Y.UndoManager(ytext, { trackedOrigins: new Set([null]) });
	function handleUndoRedoKeyDown(e: KeyboardEvent) {
		const isModifierPressed = e.ctrlKey || e.metaKey;
		if (!isModifierPressed || e.key.toLowerCase() !== 'z') {
			return;
		}

		e.preventDefault();
		if (e.shiftKey) {
			undoManager.redo();
		} else {
			undoManager.undo();
		}
	}
	textarea.addEventListener('keydown', handleUndoRedoKeyDown);

	return () => {
		textarea.removeEventListener('keydown', handleUndoRedoKeyDown);
		undoManager.destroy();
	};
}

export type SetupContentTrackingParams = {
	ydoc: Y.Doc;
	ytext: Y.Text;
	textarea: HTMLTextAreaElement;
	binding: TextAreaBinding;
	provider: DocProvider;
	setCharCount: Dispatch<SetStateAction<number>>;
	setWordCountValue: Dispatch<SetStateAction<number>>;
};

// y-textarea only repositions the remote cursor overlay when that peer's
// own awareness state changes — never when *our* edits shift the text
// underneath it, which made every remote cursor look like it was always one
// step behind. rePositionCursors() is exactly the escape hatch the library
// exposes for this.
//
// A plain <textarea> can't animate an individually inserted character — it's
// a single opaque text value, not per-character DOM nodes a transition could
// target. The flash is the honest middle ground: a brief highlight so a
// remote edit reads as "something just landed here" instead of the text
// silently rewriting itself.
export function setupContentTracking(params: SetupContentTrackingParams): () => void {
	const { ydoc, ytext, textarea, binding, provider, setCharCount, setWordCountValue } = params;
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
		textarea.classList.remove('editor-textarea--remote-flash');
		// Forces a reflow so re-adding the class restarts the animation even
		// if the previous flash hasn't finished yet. The read itself is the
		// point (it forces the browser to apply pending layout); `void` is
		// needed here to satisfy no-unused-expressions, not because there's a
		// promise to discard — sonarjs/void-use's complaint about this exact
		// case is the false positive, not this line.
		// eslint-disable-next-line sonarjs/void-use
		void textarea.offsetWidth;
		textarea.classList.add('editor-textarea--remote-flash');
		if (flashTimeout) {
			clearTimeout(flashTimeout);
		}
		flashTimeout = setTimeout(() => textarea.classList.remove('editor-textarea--remote-flash'), REMOTE_EDIT_FLASH_MS);
	}

	// provider.ts tags the origin of every remotely-applied update as the
	// provider instance itself, which is what distinguishes it from our own
	// local edits here.
	function handleContentUpdate(_update: Uint8Array, origin: unknown) {
		binding.rePositionCursors();
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
