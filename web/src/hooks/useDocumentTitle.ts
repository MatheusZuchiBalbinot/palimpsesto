import { useEffect } from 'react';

/** Sets the tab/window title for the page this is called from — every
 * route otherwise shared the static "Palimpsesto" from index.html, so
 * neither tab-switching nor a screen reader's route-change announcement
 * (its primary navigation cue in an SPA) said anything about where the
 * user actually was. Resets to the app's own brand name on unmount, so
 * navigating away doesn't leave a stale title behind. */
export function useDocumentTitle(title: string): void {
	useEffect(() => {
		const previousTitle = document.title;
		document.title = title ? `${title} — Palimpsesto` : 'Palimpsesto';
		return () => {
			document.title = previousTitle;
		};
	}, [title]);
}
