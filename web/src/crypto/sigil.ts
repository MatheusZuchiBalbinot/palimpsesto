// The deterministic glyph called "the sigil" — a visual stand-in for a
// fingerprint, so two people can compare "is this shape on your screen the
// same as mine" on a call instead of reading 60 digits aloud. Built as a
// symmetric identicon-style grid: same idea as GitHub's default avatars,
// but with its own look (a 5x5 half-grid mirrored horizontally, so the
// result is always bilaterally symmetric — deliberate, since an
// unbalanced random blob is harder to eyeball-compare than a symmetric
// one).
const GRID_SIZE = 5;
const HALF_WIDTH = 3; // columns 0..2 are randomized; 3..4 mirror 1..0
const BITS_PER_BYTE = 8;

// Rendered as an inline SVG in the same document (see Sigil.tsx), so —
// unlike the RGB literals in lib/presenceColor.ts, which are needed
// because the collab editor's remote-cursor renderer (y-codemirror.next)
// builds CSS color strings on its own without access to the stylesheet —
// a direct design-token reference resolves correctly here.
const PALETTE = ['var(--accent)', 'var(--warn)', 'var(--text-secondary)', 'var(--accent-dot)', 'var(--warn-text)'];

export type SigilData = {
	/** GRID_SIZE x GRID_SIZE booleans, row by row — true means "filled in". */
	cells: boolean[][];
	color: string;
};

/** Deterministically derives a sigil from a hash (the output of
 * identityHash, or any other byte array the size of a SHA-256 — the
 * document sigil uses this same function with a different hash). */
export function sigilFromHash(hash: Uint8Array): SigilData {
	const cells: boolean[][] = [];
	let bitIndex = 0;
	const bit = (): boolean => {
		const byte = hash[Math.floor(bitIndex / BITS_PER_BYTE) % hash.length];
		const value = (byte >> (bitIndex % BITS_PER_BYTE)) & 1;
		bitIndex++;
		return value === 1;
	};

	for (let row = 0; row < GRID_SIZE; row++) {
		const rowCells: boolean[] = [];
		for (let col = 0; col < HALF_WIDTH; col++) {
			rowCells.push(bit());
		}
		// Mirrors columns 0..1 into 4..3 (column 2 is the shared center).
		for (let col = HALF_WIDTH; col < GRID_SIZE; col++) {
			rowCells.push(rowCells[GRID_SIZE - 1 - col]);
		}
		cells.push(rowCells);
	}

	const color = PALETTE[hash[hash.length - 1] % PALETTE.length];
	return { cells, color };
}
