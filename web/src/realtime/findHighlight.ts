import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

// Highlights every occurrence of the find bar's query at once (not just the
// selected one) — closer to a native browser find's "highlight all matches"
// feel, which was one of the two things that made our custom find (needed
// because CodeMirror only renders the visible viewport, so a native Ctrl+F
// can't see text that's scrolled away — see UI_POLISH_PLAN.md) feel worse
// than the browser's own.

export type FindHighlightQuery = {
	/** Already lowercased by the caller — matching here is always
	 * case-insensitive, same as editorNavigation.ts's own search. */
	query: string;
	/** Start offset of the "current" match (the one the find bar just
	 * navigated to), so it can get a visually distinct mark from the rest. */
	currentFrom: number | null;
} | null;

type FindHighlightState = {
	find: FindHighlightQuery;
	decorations: DecorationSet;
};

const setFindQueryEffect = StateEffect.define<FindHighlightQuery>();

const matchMark = Decoration.mark({ class: 'cm-findMatch' });
// The current match also gets CodeMirror's own text selection (findNext
// dispatches it) — but only once the user explicitly navigates there
// (Enter/prev/next), which is also the only time that dispatch focuses the
// view. Search-as-you-type deliberately never focuses the editor (stealing
// focus mid-keystroke would send the rest of what's typed into the document
// instead of the query field), so an unfocused CodeMirror view shows no
// selection at all — without its own decoration, the "current" match would
// have no visual mark whatsoever while typing.
const currentMatchMark = Decoration.mark({ class: 'cm-findMatch cm-findMatch--current' });

function buildDecorations(docText: string, find: FindHighlightQuery): DecorationSet {
	if (!find || !find.query) {
		return Decoration.none;
	}
	const lowerDoc = docText.toLowerCase();
	const builder = new RangeSetBuilder<Decoration>();
	let from = 0;
	for (;;) {
		const index = lowerDoc.indexOf(find.query, from);
		if (index === -1) {
			break;
		}
		const to = index + find.query.length;
		builder.add(index, to, index === find.currentFrom ? currentMatchMark : matchMark);
		from = to;
	}
	return builder.finish();
}

const findHighlightField = StateField.define<FindHighlightState>({
	create() {
		return { find: null, decorations: Decoration.none };
	},
	update(value, tr) {
		const effect = tr.effects.find((e) => e.is(setFindQueryEffect));
		if (effect) {
			return { find: effect.value, decorations: buildDecorations(tr.state.doc.toString(), effect.value) };
		}
		// A remote or local edit while the find bar is open shifts every
		// match's offset — recomputing from scratch is simplest and, for the
		// whole-document-sized text this operates on elsewhere already
		// (editorNavigation.ts), cheap enough not to need incremental mapping.
		if (tr.docChanged && value.find) {
			return { find: value.find, decorations: buildDecorations(tr.state.doc.toString(), value.find) };
		}
		return value;
	},
	provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

export function findHighlightExtension() {
	return findHighlightField;
}

export function dispatchFindQuery(view: EditorView, find: FindHighlightQuery): void {
	view.dispatch({ effects: setFindQueryEffect.of(find) });
}
