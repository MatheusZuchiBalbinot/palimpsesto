import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { CLOSE_ANIMATION_MS_MODAL } from '../constants';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';
import { ModalCloseContext } from './modalCloseContext';
import { ModalTitleContext } from './modalTitleContext';

const DEFAULT_MAX_WIDTH = 432;

type ModalProps = {
	onClose: () => void;
	maxWidth?: number;
	/** Skips the card's default padding/gap — for modals that define their
	 * own sections with different per-section padding (e.g. Share). */
	flush?: boolean;
	children: ReactNode;
};

/** Overlay + card wrapper for every modal in the app. Closing (overlay
 * click, Escape, or useModalClose from within) plays a fade/scale-out
 * before actually unmounting — the entrance already animated, so a close
 * that just instantly vanished looked broken by comparison. Focus
 * lifecycle (move in on mount, trap Tab, restore on unmount) lives in
 * useDialogFocusTrap. */
export function Modal({ onClose, maxWidth = DEFAULT_MAX_WIDTH, flush = false, children }: Readonly<ModalProps>) {
	const [isClosing, setIsClosing] = useState(false);
	const closingRef = useRef(false);
	const onCloseRef = useRef(onClose);
	const cardRef = useRef<HTMLDivElement>(null);
	const titleId = useId();

	// The "latest ref" pattern: keeps onCloseRef up to date without mutating
	// a ref during render (which the stricter React lints flag), by doing
	// so in an effect, which always runs after commit.
	useEffect(() => {
		onCloseRef.current = onClose;
	});

	function requestClose() {
		if (closingRef.current) {
			return;
		}
		closingRef.current = true;
		setIsClosing(true);
		setTimeout(() => onCloseRef.current(), CLOSE_ANIMATION_MS_MODAL);
	}

	useDialogFocusTrap(cardRef, requestClose);

	function stopPropagation(e: MouseEvent) {
		e.stopPropagation();
	}

	// min() with the viewport width (minus the overlay's own breathing
	// room) so a narrow window/high zoom shrinks the card instead of
	// letting it overflow past the edge of the screen unreachably.
	const cardMaxWidth = `min(${maxWidth}px, calc(100vw - 32px))`;

	return (
		<div className={`modal-overlay${isClosing ? ' closing' : ''}`} onClick={requestClose}>
			<div
				ref={cardRef}
				className={`modal-card paper-stack${flush ? ' modal-card--flush' : ''}${isClosing ? ' closing' : ''}`}
				style={{ maxWidth: cardMaxWidth }}
				onClick={stopPropagation}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
			>
				<ModalCloseContext.Provider value={requestClose}>
					<ModalTitleContext.Provider value={titleId}>{children}</ModalTitleContext.Provider>
				</ModalCloseContext.Provider>
			</div>
		</div>
	);
}
