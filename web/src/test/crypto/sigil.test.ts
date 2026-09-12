import { describe, expect, it } from 'vitest';

import { sigilFromHash } from '../../crypto/sigil';

const HASH_LENGTH = 32;
const GRID_SIZE = 5;
// Arbitrary, mutually distinct fill bytes — only their identity (same vs.
// different hash) matters in these tests, never the value itself.
const HASH_A_FILL = 7;
const HASH_B_FILL = 200;
const HASH_C_FILL = 123;
const HASH_D_FILL = 42;

function fakeHash(fill: number): Uint8Array {
	return new Uint8Array(HASH_LENGTH).fill(fill);
}

describe('sigilFromHash', () => {
	it('is deterministic for the same hash', () => {
		const a = sigilFromHash(fakeHash(HASH_A_FILL));
		const b = sigilFromHash(fakeHash(HASH_A_FILL));
		expect(a).toEqual(b);
	});

	it('produces a visibly different grid for a different hash', () => {
		const a = sigilFromHash(fakeHash(HASH_A_FILL));
		const b = sigilFromHash(fakeHash(HASH_B_FILL));
		expect(a.cells).not.toEqual(b.cells);
	});

	it('is bilaterally symmetric', () => {
		const { cells } = sigilFromHash(fakeHash(HASH_C_FILL));
		for (const row of cells) {
			expect(row).toHaveLength(GRID_SIZE);
			expect(row[4]).toBe(row[0]);
			expect(row[3]).toBe(row[1]);
		}
	});

	it('picks a color from the palette', () => {
		const { color } = sigilFromHash(fakeHash(HASH_D_FILL));
		expect(color).toMatch(/^var\(--/);
	});
});
