import { describe, expect, it } from 'vitest';

import { hasAnyLayer, isTopLayer, popLayer, pushLayer } from '../../lib/floatingLayers';

// The module holds one shared, module-level stack (by design — see its
// own comment). Every test below pushes only ids it made up itself and
// pops everything it pushed before finishing, so tests never depend on
// (or leak into) each other's state — the same push-on-mount/pop-on-
// unmount symmetry Modal/Dropdown follow in real usage.

describe('floatingLayers', () => {
	it('reports nothing on top when nothing has been pushed', () => {
		expect(hasAnyLayer()).toBe(false);
		expect(isTopLayer('never-pushed')).toBe(false);
	});

	it('a single pushed layer is its own top', () => {
		pushLayer('modal-a');
		expect(hasAnyLayer()).toBe(true);
		expect(isTopLayer('modal-a')).toBe(true);
		popLayer('modal-a');
		expect(hasAnyLayer()).toBe(false);
	});

	it('a dropdown opened inside a modal is on top, not the modal', () => {
		// This is the exact scenario the module's own doc comment names:
		// a Dropdown mounted while a Modal is already open.
		pushLayer('modal-b');
		pushLayer('dropdown-b');

		expect(isTopLayer('modal-b')).toBe(false);
		expect(isTopLayer('dropdown-b')).toBe(true);

		popLayer('dropdown-b');
		popLayer('modal-b');
	});

	it('closing the inner layer restores the outer one as top', () => {
		pushLayer('modal-c');
		pushLayer('dropdown-c');
		popLayer('dropdown-c');

		// Now Escape should affect the Modal again, not silently do
		// nothing because something already left is still considered "on
		// top" — this is what makes the two-Escape-presses sequence
		// (close dropdown, then close modal) work correctly.
		expect(isTopLayer('modal-c')).toBe(true);

		popLayer('modal-c');
	});

	it('popping an id that was never pushed is a no-op, not an error', () => {
		pushLayer('modal-d');
		expect(() => popLayer('some-other-id')).not.toThrow();
		expect(isTopLayer('modal-d')).toBe(true);
		popLayer('modal-d');
	});

	it('popLayer removes the most recently pushed occurrence of an id', () => {
		// useId() guarantees real callers never collide, but the
		// implementation (lastIndexOf) should still behave sanely if it
		// ever did: popping removes the *top* match, not some earlier one
		// still meant to be "underneath".
		pushLayer('dup');
		pushLayer('other');
		pushLayer('dup');

		popLayer('dup');
		expect(isTopLayer('other')).toBe(true);

		popLayer('other');
		popLayer('dup');
		expect(hasAnyLayer()).toBe(false);
	});
});
