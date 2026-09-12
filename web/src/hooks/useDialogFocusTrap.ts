import { useEffect, useId, type RefObject } from 'react';

import { isTopLayer, popLayer, pushLayer } from '../lib/floatingLayers';

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
	if (!container) {
		return [];
	}
	return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/** A modal's entire focus lifecycle: moves focus into the container on
 * mount, traps Tab within it while open, and restores focus to whatever
 * had it before the dialog opened when this unmounts — without this,
 * focus stayed on the (now covered) trigger behind the overlay, so Tab
 * walked through a page the user couldn't see or reach. `requestClose`
 * (not a raw onClose) so Escape still plays the same fade-out as every
 * other way of closing.
 *
 * Registers itself with lib/floatingLayers.ts and only acts on Escape/Tab
 * while it's the topmost layer — without this, a Dropdown menu opened
 * inside a Modal would see the same Escape keypress its own handler
 * already closed the dropdown with, and close the whole Modal too. */
export function useDialogFocusTrap(containerRef: RefObject<HTMLElement | null>, requestClose: () => void): void {
	const layerId = useId();

	useEffect(() => {
		pushLayer(layerId);
		return () => popLayer(layerId);
		// Empty deps are intentional: this only ever needs to run once per
		// mount/unmount — layerId is stable for the component's lifetime.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const previouslyFocused = document.activeElement as HTMLElement | null;
		const focusable = getFocusableElements(containerRef.current);
		(focusable[0] ?? containerRef.current)?.focus();
		return () => {
			previouslyFocused?.focus();
		};
		// Empty deps are intentional: this only ever needs to run once per
		// mount/unmount, same reasoning as the keydown effect below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (!isTopLayer(layerId)) {
				return;
			}
			if (e.key === 'Escape') {
				requestClose();
				return;
			}
			if (e.key !== 'Tab') {
				return;
			}
			const focusable = getFocusableElements(containerRef.current);
			if (focusable.length === 0) {
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
		// Empty deps are safe here: requestClose is expected to be stable
		// across the dialog's lifetime (Modal.tsx wraps it so it always is),
		// and layerId never changes after mount.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
}
