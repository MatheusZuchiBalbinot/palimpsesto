import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

import { buttonClassName, type ButtonSize, type ButtonVariant } from './buttonClassName';
import { Tooltip } from './Tooltip';

type ButtonOwnProps = {
	variant?: ButtonVariant;
	size?: ButtonSize;
	/** Leading icon, e.g. a lucide-react icon element sized for the button. */
	icon?: ReactNode;
};

export type ButtonProps = ButtonOwnProps & ButtonHTMLAttributes<HTMLButtonElement>;

/** The Tooltip content for the common case (a button's own text label) —
 * without this, Button/LinkButton were the one place in the app that
 * never showed anything on hover, since only IconButton (icon-only, no
 * visible text at all) had a tooltip. `icon` is a separate prop from
 * `children`, so this still fires for an icon+text button. Only skipped
 * when `children` isn't a plain string (e.g. a caller composing its own
 * markup inside the button) — nothing generic to show a tooltip for
 * there — or when the caller already passed an explicit `title`. */
function plainTextTooltip(children: ReactNode): string | undefined {
	return typeof children === 'string' ? children : undefined;
}

/** The one button component every page should use — covers all of the
 * design's visual treatments (solid dark primary, outlined secondary, plain
 * ghost text, destructive) with real hover/active/focus states. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ variant = 'primary', size = 'md', icon, className, children, title, ...rest },
	ref,
) {
	return (
		<Tooltip content={title ?? plainTextTooltip(children)}>
			<button ref={ref} className={buttonClassName(variant, size, className)} {...rest}>
				{icon}
				{children}
			</button>
		</Tooltip>
	);
});

type LinkButtonProps = ButtonOwnProps & LinkProps;

/** Same visual treatment as Button, but renders a react-router Link — for
 * navigation that should look like a button ("Create an account", etc). */
export function LinkButton({ variant = 'primary', size = 'md', icon, className, children, title, ...rest }: Readonly<LinkButtonProps>) {
	return (
		<Tooltip content={title ?? plainTextTooltip(children)}>
			<Link className={buttonClassName(variant, size, className)} {...rest}>
				{icon}
				{children}
			</Link>
		</Tooltip>
	);
}

type IconButtonOwnProps = {
	/** Accessible name — icon-only buttons have no visible text, so this is
	 * required, not optional. Also what the hover Tooltip shows. */
	label: string;
};

export type IconButtonProps = IconButtonOwnProps & ButtonHTMLAttributes<HTMLButtonElement>;

/** A square icon-only button — back arrows, panel toggles, "more" menus. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, className, children, ...rest }, ref) {
	return (
		<Tooltip content={label}>
			<button ref={ref} className={['icon-btn', className].filter(Boolean).join(' ')} aria-label={label} {...rest}>
				{children}
			</button>
		</Tooltip>
	);
});

type IconLinkButtonProps = IconButtonOwnProps & AnchorHTMLAttributes<HTMLAnchorElement> & LinkProps;

/** Same as IconButton, but a react-router Link (e.g. the editor's back arrow). */
export function IconLinkButton({ label, className, children, ...rest }: Readonly<IconLinkButtonProps>) {
	return (
		<Tooltip content={label}>
			<Link className={['icon-btn', className].filter(Boolean).join(' ')} aria-label={label} {...rest}>
				{children}
			</Link>
		</Tooltip>
	);
}
