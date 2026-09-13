import { defaultKeymap } from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import { cursorColorForId, hexString } from '../lib/presenceColor';
import { dispatchFindQuery, findHighlightExtension, type FindHighlightQuery } from './findHighlight';

// The Yjs <-> CodeMirror bridge replaces y-textarea's TextAreaBinding.
// yCollab's own Y.UndoManager (created with no explicit trackedOrigins)
// tracks only transactions whose origin is the YSyncConfig instance it
// builds internally — i.e. only edits that came from *this* CodeMirror
// view, exactly like the trackedOrigins: [null] guard the old
// editorTracking.ts had to hand-roll for TextAreaBinding. Remote updates
// arrive tagged with the DocProvider instance as origin (see provider.ts),
// so they're never in the undo stack — verified by reading y-undomanager.js
// (`this._undoManager.addTrackedOrigin(this.syncConf)`), not assumed.

export type AriaAttributes = {
	'aria-label'?: string;
	'aria-labelledby'?: string;
	'aria-describedby': string;
};

export type CreateCollabEditorViewParams = {
	container: HTMLDivElement;
	ytext: Y.Text;
	awareness: Awareness;
	userId: string;
	clientName: string;
	isReadOnly: boolean;
	placeholderText: string;
	ariaAttributes: AriaAttributes;
};

export type CollabEditorHandle = {
	view: EditorView;
	setReadOnly: (isReadOnly: boolean) => void;
	setAriaAttributes: (attrs: AriaAttributes) => void;
	/** Highlights every occurrence of `find.query` (already lowercased),
	 * marking `find.currentFrom` distinctly — pass null to clear. */
	setFindHighlight: (find: FindHighlightQuery) => void;
	destroy: () => void;
};

function readOnlyExtensions(isReadOnly: boolean) {
	return [EditorState.readOnly.of(isReadOnly), EditorView.editable.of(!isReadOnly)];
}

export function createCollabEditorView(params: CreateCollabEditorViewParams): CollabEditorHandle {
	const { container, ytext, awareness, userId, clientName, isReadOnly, placeholderText, ariaAttributes } = params;

	// y-codemirror.next's remote-selection decorations read color/name from
	// awareness state field "user" (see y-remote-selections.js) — a
	// different field than the "userId"/"presenceStatus" fields provider.ts
	// already sets, so it has to be set here explicitly. Must be hex, not
	// rgb(...) — see hexString's own comment for why.
	awareness.setLocalStateField('user', {
		name: clientName,
		color: hexString(cursorColorForId(userId)),
	});

	const readOnlyCompartment = new Compartment();
	const ariaCompartment = new Compartment();

	const state = EditorState.create({
		// Y.Text overrides toString() to return its actual text content, not
		// Object's default stringification.
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		doc: ytext.toString(),
		extensions: [
			EditorView.lineWrapping,
			keymap.of([...defaultKeymap, ...yUndoManagerKeymap]),
			placeholderExtension(placeholderText),
			readOnlyCompartment.of(readOnlyExtensions(isReadOnly)),
			ariaCompartment.of(EditorView.contentAttributes.of(ariaAttributes)),
			findHighlightExtension(),
			yCollab(ytext, awareness),
		],
	});

	const view = new EditorView({ state, parent: container });

	return {
		view,
		setReadOnly(nextReadOnly: boolean) {
			view.dispatch({ effects: readOnlyCompartment.reconfigure(readOnlyExtensions(nextReadOnly)) });
		},
		setAriaAttributes(attrs: AriaAttributes) {
			view.dispatch({ effects: ariaCompartment.reconfigure(EditorView.contentAttributes.of(attrs)) });
		},
		setFindHighlight(find: FindHighlightQuery) {
			dispatchFindQuery(view, find);
		},
		destroy() {
			view.destroy();
		},
	};
}
