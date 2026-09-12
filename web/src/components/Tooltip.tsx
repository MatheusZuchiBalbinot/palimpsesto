import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

import { TOOLTIP_DELAY_MS } from '../constants';

type TooltipProps = {
	/** What shows in the floating tooltip. A tooltip with nothing to say
	 * (undefined) renders its child completely bare — no Radix wrapper, no
	 * empty popup that could ever pop up. */
	content: string | undefined;
	children: ReactNode;
};

/** The one styled tooltip every hover hint in the app should go through —
 * replaces the plain `title` attribute (unstyled, slow, positioned by the
 * browser, no keyboard/focus support) with something that matches the
 * rest of the UI and actually shows up on keyboard focus too, not just
 * mouse hover. Wraps its child with Radix's `asChild` (see Trigger below),
 * so the child keeps its own ref, click handler, and everything else —
 * this only adds the hover/focus listeners on top.
 *
 * Carries its own Provider rather than only relying on the app-level one
 * in App.tsx (Radix's Root throws without a Provider ancestor) — Radix
 * providers nest fine, so this still gets the cross-tooltip shared-delay
 * behavior in the real app, while also working for a component mounted
 * on its own in a test with no App around it. */
export function Tooltip({ content, children }: Readonly<TooltipProps>) {
	if (!content) {
		return <>{children}</>;
	}
	return (
		<RadixTooltip.Provider delayDuration={TOOLTIP_DELAY_MS}>
			<RadixTooltip.Root delayDuration={TOOLTIP_DELAY_MS}>
				<RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
				<RadixTooltip.Portal>
					<RadixTooltip.Content className="tooltip" sideOffset={6}>
						{content}
						<RadixTooltip.Arrow className="tooltip__arrow" />
					</RadixTooltip.Content>
				</RadixTooltip.Portal>
			</RadixTooltip.Root>
		</RadixTooltip.Provider>
	);
}

/** Wraps the whole app once (see App.tsx) — Radix's tooltips share one
 * open/close delay timer across the page through this provider, so
 * hovering from one tooltip's trigger straight into another's doesn't
 * make you wait out the delay twice. */
export function TooltipProvider({ children }: Readonly<{ children: ReactNode }>) {
	return <RadixTooltip.Provider delayDuration={TOOLTIP_DELAY_MS}>{children}</RadixTooltip.Provider>;
}
