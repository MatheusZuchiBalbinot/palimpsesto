import { hashIndex } from './idHash';

/** RGB equivalents of the same five colors Avatar.tsx cycles through
 * (--accent/--success/--text-secondary/--accent-dot/--danger from
 * index.css), duplicated here as literal numbers — y-textarea's remote
 * cursor renderer builds `rgba()` strings directly from an {r,g,b} object
 * and has no way to resolve a CSS custom property. */
const CURSOR_COLORS = [
	{ r: 140, g: 106, b: 63 },
	{ r: 63, g: 92, b: 81 },
	{ r: 61, g: 58, b: 50 },
	{ r: 93, g: 124, b: 113 },
	{ r: 156, g: 63, b: 38 },
];

export function cursorColorForId(id: string): { r: number; g: number; b: number } {
	return CURSOR_COLORS[hashIndex(id, CURSOR_COLORS.length)];
}

/** Formats an {r,g,b} color (e.g. from cursorColorForId) as the
 * "r, g, b" string a CSS `rgba()`/custom-property value expects. */
export function rgbString({ r, g, b }: { r: number; g: number; b: number }): string {
	return `${r}, ${g}, ${b}`;
}
