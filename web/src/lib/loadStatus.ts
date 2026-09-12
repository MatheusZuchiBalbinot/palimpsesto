/** A fetch-and-hold hook's lifecycle, as one value instead of an
 * `isLoading: boolean` / `loadError: unknown` pair — the pair let a
 * refresh-after-failure set `isLoading` back to `true` while a stale
 * `loadError` was still hanging around (only cleared in the eventual
 * `.then()`), so the UI could legitimately show a loading spinner and an
 * old error message at once. A single status can't represent that. */
export type LoadStatus = 'loading' | 'error' | 'ready';
