import { useEffect, useState } from 'react';

import type { HistoryPlaybackControlsProps } from '../components/history/HistoryHeader';
import { HISTORY_PLAYBACK_STEP_MS } from '../constants';
import type { VersionGroup } from '../lib/yjsHistory';

// The array itself is the named constant here — each speed option doesn't
// need its own separate name just to stop being a "magic number".
// eslint-disable-next-line no-magic-numbers
export const PLAYBACK_SPEEDS = [2, 3, 5, 10] as const;

type UseHistoryPlaybackParams = {
	groups: VersionGroup[];
	selectedIndex: number;
	isCurrent: boolean;
	setSelectedId: (id: number | null) => void;
};

/** Time-lapse playback: advances selectedId through `groups` on a timer,
 * reusing the same reconstructTextAt that already drives the scrubber —
 * isPlaying is just "the scrubber moving on its own". */
export function useHistoryPlayback({ groups, selectedIndex, isCurrent, setSelectedId }: UseHistoryPlaybackParams) {
	const [isPlaying, setIsPlaying] = useState(false);
	const [speedIndex, setSpeedIndex] = useState(0);

	useEffect(() => {
		if (!isPlaying || selectedIndex === -1 || selectedIndex >= groups.length - 1) {
			return;
		}
		const stepMs = HISTORY_PLAYBACK_STEP_MS / PLAYBACK_SPEEDS[speedIndex];
		const nextIndex = selectedIndex + 1;
		const timer = setTimeout(() => {
			setSelectedId(groups[nextIndex].lastUpdateId);
			if (nextIndex >= groups.length - 1) {
				setIsPlaying(false);
			}
		}, stepMs);
		return () => clearTimeout(timer);
	}, [isPlaying, selectedIndex, speedIndex, groups, setSelectedId]);

	function handleTogglePlay() {
		if (isCurrent && !isPlaying) {
			// Starting a replay from the end restarts from the beginning —
			// "play" from a point with nothing left to play wouldn't do
			// anything, which looks broken rather than finished.
			setSelectedId(groups[0]?.lastUpdateId ?? null);
		}
		setIsPlaying((v) => !v);
	}

	function handleCycleSpeed() {
		setSpeedIndex((i) => (i + 1) % PLAYBACK_SPEEDS.length);
	}

	const playbackControls: HistoryPlaybackControlsProps = {
		isPlaying,
		speedIndex,
		onTogglePlay: handleTogglePlay,
		onCycleSpeed: handleCycleSpeed,
	};

	return { setIsPlaying, playbackControls };
}
