import type { KeyboardEvent, PointerEvent } from 'react';

import type { VersionGroup } from '../lib/yjsHistory';

type UseScrubberControlsParams = {
	groups: VersionGroup[];
	selectedIndex: number;
	setIsPlaying: (value: boolean) => void;
	setSelectedId: (id: number | null) => void;
};

/** Every input path into the scrubber track — clicking a point, dragging
 * (pointer capture, so dragging past the track's edges still works), and
 * keyboard (Home/End/arrows, for anyone reaching it via Tab instead of a
 * pointer). Selecting a point always pauses playback first, the same way
 * clicking a version in the list would. */
export function useScrubberControls({ groups, selectedIndex, setIsPlaying, setSelectedId }: UseScrubberControlsParams) {
	function selectGroupAt(index: number) {
		if (groups.length === 0) {
			return;
		}
		const clamped = Math.min(groups.length - 1, Math.max(0, index));
		setIsPlaying(false);
		setSelectedId(groups[clamped].lastUpdateId);
	}

	function selectGroupAtPointer(e: PointerEvent<HTMLDivElement>) {
		if (groups.length === 0) {
			return;
		}
		const rect = e.currentTarget.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
		selectGroupAt(Math.round(ratio * (groups.length - 1)));
	}

	// The visual "handle" suggests a real drag, not just clicking a
	// point — pointer capture keeps this element receiving move/up events
	// even after the cursor leaves its bounds, same as a native
	// <input type="range">.
	function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
		e.currentTarget.setPointerCapture(e.pointerId);
		selectGroupAtPointer(e);
	}

	function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
		if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
			return;
		}
		selectGroupAtPointer(e);
	}

	function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
		if (groups.length === 0) {
			return;
		}
		switch (e.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				e.preventDefault();
				selectGroupAt(selectedIndex - 1);
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				e.preventDefault();
				selectGroupAt(selectedIndex + 1);
				break;
			case 'Home':
				e.preventDefault();
				selectGroupAt(0);
				break;
			case 'End':
				e.preventDefault();
				selectGroupAt(groups.length - 1);
				break;
		}
	}

	return { selectGroupAt, onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onKeyDown: handleKeyDown };
}
