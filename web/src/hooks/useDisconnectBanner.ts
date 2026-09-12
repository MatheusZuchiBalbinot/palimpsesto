import { useEffect, useState } from 'react';

import { DISCONNECT_BANNER_DELAY_MS } from '../constants';
import type { ConnectionStatus } from '../realtime/provider';

/** True once the socket has been disconnected for more than a few seconds
 * — a brief drop that reconnects on its own doesn't deserve a banner, but
 * one that lingers does (UX_REVIEW.md 3.7): the header's status dot is
 * easy to miss, and while disconnected, whatever's being typed exists
 * nowhere but this tab. */
export function useDisconnectBanner(status: ConnectionStatus): boolean {
	const [isBannerShown, setShowBanner] = useState(false);

	useEffect(() => {
		if (status !== 'disconnected') {
			setShowBanner(false);
			return;
		}
		const timer = setTimeout(() => setShowBanner(true), DISCONNECT_BANNER_DELAY_MS);
		return () => clearTimeout(timer);
	}, [status]);

	return isBannerShown;
}
