import { AVATAR_SIZE_DEFAULT } from '../constants';
import { hashIndex } from '../lib/idHash';

// Deterministic per-user initials + color, following the design's avatar
// treatment (AF / JM / RS in solid colors, cycling through a fixed set).
// References the same tokens used elsewhere in the app (index.css) instead
// of duplicating the hex values — a palette change can't accidentally
// misalign these colors from the theme.
const AVATAR_COLORS = ['var(--accent)', 'var(--success)', 'var(--text-secondary)', 'var(--accent-dot)', 'var(--danger)'];

const FONT_SIZE_TO_AVATAR_SIZE_RATIO = 0.4;
const OVERLAP_MARGIN = -8;

function colorForId(id: string): string {
	return AVATAR_COLORS[hashIndex(id, AVATAR_COLORS.length)];
}

function initialsFor(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return '?';
	}
	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase();
	}
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type AvatarPresence = 'online' | 'away' | 'offline';

/** The subset of AvatarPresence a live connection can actually broadcast
 * about itself via awareness (realtime/provider.ts) — 'offline' isn't
 * something a connected peer ever announces, it's what the absence of a
 * peer means to everyone else. Shared so a typo like 'idle' in a
 * setLocalStateField call can't compile as a valid status. */
export type PresenceStatus = Exclude<AvatarPresence, 'offline'>;

type AvatarProps = {
	id: string;
	name: string;
	size?: number;
	overlap?: boolean;
	borderColor?: string;
	/** 'online': connected and active. 'away': connected, but idle for more
	 * than a minute. 'offline' (default): not connected. */
	presence?: AvatarPresence;
	/** Set when the caller already renders this person's name as adjacent
	 * text (a member row, a comment card, ...) — the avatar itself is then
	 * pure decoration and hidden from screen readers instead of announcing
	 * the initials ("A F") as if they were the name. Leave unset for an
	 * avatar with no name nearby (an avatar stack): it gets `role="img"` +
	 * `aria-label={name}` instead, since initials alone convey nothing. */
	decorative?: boolean;
};

type AvatarAccessibility = { 'aria-hidden'?: true; role?: 'img'; 'aria-label'?: string };

function accessibilityProps(decorative: boolean, name: string): AvatarAccessibility {
	if (decorative) {
		return { 'aria-hidden': true };
	}
	return { role: 'img', 'aria-label': name };
}

export function Avatar({
	id,
	name,
	size = AVATAR_SIZE_DEFAULT,
	overlap = false,
	borderColor,
	presence = 'offline',
	decorative = false,
}: Readonly<AvatarProps>) {
	const presenceClass = presence === 'offline' ? '' : ` avatar--${presence}`;
	return (
		<div
			className={`avatar${presenceClass}`}
			style={{
				width: size,
				height: size,
				fontSize: Math.round(size * FONT_SIZE_TO_AVATAR_SIZE_RATIO),
				background: colorForId(id),
				marginLeft: overlap ? OVERLAP_MARGIN : undefined,
				border: borderColor ? `2px solid ${borderColor}` : undefined,
			}}
			{...accessibilityProps(decorative, name)}
		>
			{initialsFor(name)}
		</div>
	);
}
