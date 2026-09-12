// A shared registry of which floating UI (a Modal, a Dropdown menu) is
// currently on top — module-level state, same pub-sub shape as toast.ts
// and auth/session.ts already use, so no context provider needs to wrap
// the tree just for this.
//
// Before this existed, Modal, Dropdown, CommandPalette and
// useGlobalShortcuts each listened for Escape/Ctrl+K/etc. on `document`/
// `window` independently, with no idea whether something else was already
// open on top of them. Concretely: opening a Dropdown inside a Modal and
// pressing Escape closed *both* in one keypress (both listeners fired,
// neither knew the other existed); Ctrl+K opened the command palette on
// top of an already-open Modal, stacking two overlays; Ctrl+F stole focus
// out of an open Modal's focus trap. Every layer now pushes its own id on
// mount and pops it on unmount, and only acts on Escape (or opens at all,
// for Ctrl+K/global shortcuts) when it's the topmost one.
const stack: string[] = [];

export function pushLayer(id: string): void {
	stack.push(id);
}

export function popLayer(id: string): void {
	const index = stack.lastIndexOf(id);
	if (index !== -1) {
		stack.splice(index, 1);
	}
}

/** Whether `id` is the topmost (most recently pushed, still-open) layer —
 * what an Escape/outside-click handler should check before acting, so an
 * inner layer's dismissal doesn't also dismiss whatever it's nested in. */
export function isTopLayer(id: string): boolean {
	return stack.length > 0 && stack[stack.length - 1] === id;
}

/** Whether any floating layer is currently open at all — what a global
 * shortcut (Ctrl+K, Ctrl+F, …) should check before acting, so it doesn't
 * open on top of / steal focus from whatever's already open. */
export function hasAnyLayer(): boolean {
	return stack.length > 0;
}
