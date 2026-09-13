import { useTranslation } from 'react-i18next';

/** The one "skip navigation" mechanism a screen reader or keyboard-only
 * user gets in this app — without it, reaching the actual page content
 * (the editor, the document list, ...) means tabbing through
 * every header control first, on every single page load. Visually hidden
 * until it receives focus (the first Tab stop on any page), same
 * mechanism as .sr-only elsewhere. Targets #main-content, which every
 * page's <main> region shares — only one page is mounted at a time via
 * routing, so there's never a collision. Every one of those <main>
 * elements needs its own tabIndex={-1}: a plain <main>, with no tabindex,
 * can't receive .focus() at all, so activating this link would move the
 * URL hash without moving keyboard focus anywhere (Lighthouse's skip-link
 * audit catches exactly this). */
export function SkipLink() {
	const { t } = useTranslation();
	return (
		<a href="#main-content" className="skip-link">
			{t('a11y.skipToContent')}
		</a>
	);
}
