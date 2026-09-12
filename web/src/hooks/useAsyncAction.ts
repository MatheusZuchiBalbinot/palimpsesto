import { useCallback, useState } from 'react';

type AsyncActionState = {
	isPending: boolean;
	error: unknown;
};

/**
 * Wraps an async function with isPending/error tracking, so pages don't
 * each reimplement the same try/catch/setState dance around a form
 * submission.
 *
 * Keeps the raw error instead of a pre-formatted message — the caller
 * translates it at render time (see i18n/errors.ts), so switching language
 * after a failed submission doesn't leave a stale message in the wrong
 * language.
 */
export function useAsyncAction<Args extends unknown[]>(action: (...args: Args) => Promise<void>): [AsyncActionState, (...args: Args) => void] {
	const [state, setState] = useState<AsyncActionState>({ isPending: false, error: null });

	const run = useCallback(
		(...args: Args) => {
			setState({ isPending: true, error: null });
			action(...args)
				.then(() => setState({ isPending: false, error: null }))
				.catch((error: unknown) => setState({ isPending: false, error }));
		},
		[action],
	);

	return [state, run];
}
