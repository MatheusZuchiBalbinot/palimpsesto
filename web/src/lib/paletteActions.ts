export type PaletteAction = {
	id: string;
	label: string;
	onRun: () => void;
};

// The command palette (CommandPalette.tsx) is mounted once at the app's
// root and has no idea which page it's on — the page itself knows which
// actions make sense right now (a document page can share/resolve/copy a
// link, the vault can only create a new document). Same
// register-on-mount/clear-on-unmount shape as lib/toast.ts, just for a
// different kind of module-level state.
let actions: PaletteAction[] = [];
const listeners = new Set<() => void>();

function notify() {
	listeners.forEach((listener) => listener());
}

/** Call from a page's effect with its current contextual actions; call the
 * returned function on cleanup (or dependency change) to clear them. */
export function registerPaletteActions(next: PaletteAction[]): () => void {
	actions = next;
	notify();
	return () => {
		actions = [];
		notify();
	};
}

export function getPaletteActions(): PaletteAction[] {
	return actions;
}

export function subscribePaletteActions(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
