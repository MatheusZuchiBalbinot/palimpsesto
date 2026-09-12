import { useCallback, useEffect, useRef, useState } from 'react';

import { CLOSE_ANIMATION_MS_POPOVER } from '../constants';

/** Open/closed state for a menu/popover that needs to stay mounted for
 * closeAnimationMs after closing, so its fade/scale-out transition actually
 * gets to play instead of disappearing the instant it's dismissed. Shared
 * by every "⋯" menu (Dropdown), the avatar-stack popover, and the document
 * sigil — the same three-state dance (isOpen for the animation class,
 * isRendered for whether it's in the DOM at all), previously duplicated
 * identically in all three. */
export function useDelayedVisibility(closeAnimationMs: number = CLOSE_ANIMATION_MS_POPOVER) {
	const [isOpen, setIsOpen] = useState(false);
	const [isRendered, setIsRendered] = useState(false);
	const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const open = useCallback(() => {
		if (closeTimer.current) {
			clearTimeout(closeTimer.current);
		}
		setIsRendered(true);
		setIsOpen(true);
	}, []);

	const close = useCallback(() => {
		setIsOpen(false);
		closeTimer.current = setTimeout(() => setIsRendered(false), closeAnimationMs);
	}, [closeAnimationMs]);

	useEffect(() => {
		return () => {
			if (closeTimer.current) {
				clearTimeout(closeTimer.current);
			}
		};
	}, []);

	return { isOpen, isRendered, open, close };
}
