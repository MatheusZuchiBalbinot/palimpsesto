import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

import { bootstrapSession } from '../auth/actions';
import { useSession } from '../hooks/useSession';
import { routes } from '../routes';
import { CommandPalette } from './CommandPalette';

/** Route guard: redirects to /login when there's no active session. Also
 * mounts the command palette here (not at the app root) so Ctrl+K only does
 * something when there's a session to list documents.
 *
 * A session lives only in memory (auth/session.ts), so a fresh page load —
 * a reload, a link opened in a new tab, a browser restoring a tab after
 * restart — starts with none, even with a perfectly valid, unused refresh
 * cookie sitting there. Before this component existed, that looked
 * identical to actually being logged out: an instant redirect to /login on
 * every reload. bootstrapSession() makes an attempt to redeem that cookie
 * first; only once that settles (a session showed up, or genuinely didn't)
 * does this component decide whether to redirect — never based purely on
 * the first render, before bootstrap. */
export function RequireSession() {
	const session = useSession();
	const [didCheckBootstrap, setDidCheckBootstrap] = useState(false);

	useEffect(() => {
		if (session) {
			setDidCheckBootstrap(true);
			return;
		}
		let isCancelled = false;
		void bootstrapSession().finally(() => {
			if (!isCancelled) {
				setDidCheckBootstrap(true);
			}
		});
		return () => {
			isCancelled = true;
		};
		// oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: runs only once on mount, not on every `session` change (a logout would otherwise immediately trigger another bootstrap attempt right after clearing it)
		// eslint-disable-next-line react-hooks/exhaustive-deps -- same reason, for eslint's copy of this rule
	}, []);

	if (!didCheckBootstrap) {
		return null;
	}
	if (!session) {
		return <Navigate to={routes.login} replace />;
	}
	return (
		<>
			<Outlet />
			<CommandPalette />
		</>
	);
}
