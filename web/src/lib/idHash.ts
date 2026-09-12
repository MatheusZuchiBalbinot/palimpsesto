/** Deterministic small-integer hash of an id string, to consistently pick
 * the same palette slot for the same id (avatar color, cursor color, ...)
 * — so the same person always gets the same color across the whole app. */
// The classic Java String.hashCode() multiplier — any small odd prime
// works for this kind of rolling hash; 31 is just the best-known one.
const HASH_MULTIPLIER = 31;

export function hashIndex(id: string, paletteSize: number): number {
	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * HASH_MULTIPLIER + id.charCodeAt(i)) | 0;
	}
	return Math.abs(hash) % paletteSize;
}
