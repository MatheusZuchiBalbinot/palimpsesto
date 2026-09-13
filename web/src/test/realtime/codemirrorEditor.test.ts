import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { yUndoManagerKeymap } from 'y-codemirror.next';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { createCollabEditorView, type CollabEditorHandle } from '../../realtime/codemirrorEditor';

// This binding replaced y-textarea specifically to fix cursor/selection
// quality (see CODEMIRROR_PLAN.md) — these tests exist to pin down the two
// things that would silently regress a collaborative editor if the
// migration got them wrong: content actually stays in sync in both
// directions, and undo only ever reverts what *this* client typed.

// y-codemirror.next only exports its undo/redo commands as `run` functions
// on yUndoManagerKeymap's bindings (not as standalone named exports), so
// tests trigger undo the same way a real Mod-z keypress would.
const runUndo = yUndoManagerKeymap.find((binding) => binding.key === 'Mod-z')?.run;

describe('createCollabEditorView', () => {
	let ydoc: Y.Doc;
	let ytext: Y.Text;
	let awareness: Awareness;
	let openHandles: CollabEditorHandle[];

	// CodeMirror schedules its own layout measurement via requestAnimationFrame,
	// which jsdom doesn't fully support (no Range.getClientRects) — harmless in
	// a real browser, but it fires as an unhandled rejection here if a view
	// outlives its test. Every handle a test creates gets torn down here
	// instead of relying on each test to remember to call handle.destroy().
	function createHandle(overrides: Partial<Parameters<typeof createCollabEditorView>[0]> = {}): CollabEditorHandle {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const handle = createCollabEditorView({
			container,
			ytext,
			awareness,
			userId: 'user-1',
			clientName: 'Alice',
			isReadOnly: false,
			placeholderText: 'placeholder',
			ariaAttributes: { 'aria-describedby': 'stats-id' },
			...overrides,
		});
		openHandles.push(handle);
		return handle;
	}

	beforeEach(() => {
		ydoc = new Y.Doc();
		ytext = ydoc.getText('content');
		awareness = new Awareness(ydoc);
		openHandles = [];
	});

	afterEach(() => {
		for (const handle of openHandles) {
			handle.destroy();
		}
	});

	it('seeds the view from the existing Y.Text content', () => {
		ytext.insert(0, 'hello');
		const handle = createHandle();
		expect(handle.view.state.doc.toString()).toBe('hello');
	});

	it('reflects a remote Y.Text change in the view', () => {
		const handle = createHandle();
		ytext.insert(0, 'remote text');
		expect(handle.view.state.doc.toString()).toBe('remote text');
	});

	it('propagates a local view edit back into the Y.Text', () => {
		const handle = createHandle();
		handle.view.dispatch({ changes: { from: 0, insert: 'typed' } });
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		expect(ytext.toString()).toBe('typed');
	});

	it('sets the awareness "user" field the remote-cursor plugin reads', () => {
		createHandle({ clientName: 'Bob' });
		const user = awareness.getLocalState()?.user as { name: string; color: string } | undefined;
		expect(user?.name).toBe('Bob');
		// Must be hex, not rgb(...) — y-codemirror.next derives the
		// translucent selection-highlight color by string-concatenating an
		// alpha suffix onto this value, which only produces valid CSS for hex.
		expect(user?.color).toMatch(/^#[0-9a-f]{6}$/);
	});

	it('undo only reverts local edits, never a remotely-applied update', () => {
		const handle = createHandle();
		handle.view.dispatch({ changes: { from: 0, insert: 'local' } });

		// Mirrors provider.ts's handleIncomingUpdate: a remote peer's content
		// lands as a transaction on the same Y.Text tagged with a non-null,
		// non-CodeMirror origin object — never as a dispatch on this view.
		const remoteOrigin = {};
		ydoc.transact(() => {
			ytext.insert(ytext.length, ' remote');
		}, remoteOrigin);

		expect(handle.view.state.doc.toString()).toBe('local remote');

		runUndo?.(handle.view);

		// The local "local" insert is gone; the remote " remote" content
		// survives untouched — an undo that ate a peer's edit would be worse
		// than the cursor-lag bug this migration set out to fix.
		expect(handle.view.state.doc.toString()).toBe(' remote');
	});

	it('setReadOnly(true) makes the view non-editable', () => {
		const handle = createHandle();
		expect(handle.view.state.readOnly).toBe(false);
		handle.setReadOnly(true);
		expect(handle.view.state.readOnly).toBe(true);
	});

	it('setAriaAttributes reconfigures the content DOM attributes', () => {
		const handle = createHandle({ ariaAttributes: { 'aria-describedby': 'a' } });
		expect(handle.view.contentDOM.getAttribute('aria-describedby')).toBe('a');
		handle.setAriaAttributes({ 'aria-label': 'Editor', 'aria-describedby': 'b' });
		expect(handle.view.contentDOM.getAttribute('aria-label')).toBe('Editor');
		expect(handle.view.contentDOM.getAttribute('aria-describedby')).toBe('b');
	});

	it('setFindHighlight decorates every match, marking the current one distinctly', () => {
		ytext.insert(0, 'cat hat cat mat cat');
		const handle = createHandle();

		handle.setFindHighlight({ query: 'cat', currentFrom: 8 });
		const marks = Array.from(handle.view.contentDOM.querySelectorAll('.cm-findMatch'));
		// All three "cat"s get decorated — search-as-you-type never focuses
		// the editor (see useFindInEditor.ts's comment on why), so CodeMirror's
		// own selection can't be relied on to mark the current one; it needs
		// its own decoration too, not just the other matches.
		expect(marks.map((el) => el.textContent)).toEqual(['cat', 'cat', 'cat']);
		expect(marks.filter((el) => el.classList.contains('cm-findMatch--current'))).toHaveLength(1);
		expect(marks[1].classList.contains('cm-findMatch--current')).toBe(true);

		handle.setFindHighlight(null);
		expect(handle.view.contentDOM.querySelectorAll('.cm-findMatch')).toHaveLength(0);
	});
});
