import { hashIndex } from './idHash';

/** RGB equivalents of the same five colors Avatar.tsx cycles through
 * (--accent/--success/--text-secondary/--accent-dot/--danger from
 * index.css), duplicated here as literal numbers — the collab editor's
 * remote-cursor renderer (y-codemirror.next) builds CSS color strings
 * directly from awareness state and has no way to resolve a CSS custom
 * property. */
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

/** Formats an {r,g,b} color as a 6-digit hex string ("#3d3a32") — the
 * format y-codemirror.next's remote-selection highlight needs: it derives
 * its translucent fill by string-concatenating an alpha suffix onto
 * whatever color string it's given (`color + '33'`), which only produces
 * valid CSS when `color` is hex (`#3d3a32` + `33` = a valid 8-digit hex
 * color). Handing it an `rgb(...)` string instead makes that concatenation
 * produce `rgb(...)33`, an invalid color the browser silently drops —
 * which is why a remote peer's selection highlight rendered invisible
 * (only their caret, which uses `color` directly, ever showed). */
export function hexString({ r, g, b }: { r: number; g: number; b: number }): string {
	const toHex = (n: number) => n.toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
