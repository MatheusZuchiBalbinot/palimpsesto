import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';

import { useDelayedVisibility } from '../hooks/useDelayedVisibility';
import { isTopLayer, popLayer, pushLayer } from '../lib/floatingLayers';

export type DropdownAction = {
	label: string;
	onClick: () => void;
	danger?: boolean;
	disabled?: boolean;
};

export type DropdownEntry = DropdownAction | 'divider';

export type DropdownTriggerState = {
	isOpen: boolean;
	onClick: () => void;
	/** Attach to the actual trigger element (e.g. IconButton's own ref
	 * prop) so Escape can return focus to it — without this, closing via
	 * keyboard left focus nowhere, dropped back to the document body. */
	triggerRef: RefObject<HTMLButtonElement | null>;
};

type DropdownProps = {
	/** Render prop (not a plain node) so this can wire aria-haspopup/
	 * aria-expanded and the open/close handler onto whatever real,
	 * focusable element the caller renders as the trigger, instead of
	 * Dropdown wrapping it in an unfocusable div of its own. */
	trigger: (state: DropdownTriggerState) => ReactNode;
	items: DropdownEntry[];
	align?: 'left' | 'right';
};

/** A trigger + floating menu that closes on outside click, Escape, or item
 * selection — the one implementation every "⋯" menu in the app shares
 * (document cards, editor header), instead of each page reinventing its
 * own open/closed state.
 *
 * The menu stays mounted briefly after "closing" (see useDelayedVisibility)
 * so its fade/scale-out transition actually happens, instead of the menu
 * just vanishing the instant a click lands outside it. */
export function Dropdown({ trigger, items, align = 'right' }: Readonly<DropdownProps>) {
	const { isOpen, isRendered, open: openMenu, close: closeMenu } = useDelayedVisibility();
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const layerId = useId();

	// Registers with lib/floatingLayers.ts and only closes on Escape while
	// on top — without this, opening a Dropdown inside a Modal and pressing
	// Escape closed both at once: this handler and the Modal's own Escape
	// handler are both plain `document` listeners with no idea the other
	// exists.
	useEffect(() => {
		if (!isOpen) {
			return;
		}

		pushLayer(layerId);

		function handleOutsideClick(e: globalThis.MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				closeMenu();
			}
		}

		function handleKeyDown(e: globalThis.KeyboardEvent) {
			if (e.key === 'Escape' && isTopLayer(layerId)) {
				closeMenu();
				triggerRef.current?.focus();
			}
		}

		document.addEventListener('mousedown', handleOutsideClick);
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			popLayer(layerId);
			document.removeEventListener('mousedown', handleOutsideClick);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen, closeMenu, layerId]);

	function handleContainerClick(e: MouseEvent) {
		// Prevents any click inside the dropdown (trigger or menu item) from
		// propagating to whatever the parent row does on click (e.g. a
		// document card's "open document" handler).
		e.stopPropagation();
	}

	function handleItemClick(item: DropdownAction) {
		closeMenu();
		item.onClick();
	}

	return (
		<div className="dropdown" ref={containerRef} onClick={handleContainerClick}>
			{trigger({ isOpen, onClick: () => (isOpen ? closeMenu() : openMenu()), triggerRef })}

			{isRendered ? (
				<div className={`dropdown__menu dropdown__menu--${align}${isOpen ? ' open' : ''}`} role="menu">
					{items.map((item, i) =>
						item === 'divider' ? (
							<div key={i} className="dropdown__divider" role="separator" />
						) : (
							<button
								key={item.label}
								type="button"
								role="menuitem"
								className={`dropdown__item${item.danger ? ' dropdown__item--danger' : ''}`}
								disabled={item.disabled}
								onClick={() => handleItemClick(item)}
							>
								{item.label}
							</button>
						),
					)}
				</div>
			) : null}
		</div>
	);
}
