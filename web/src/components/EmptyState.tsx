import type { ReactNode } from 'react';

type EmptyStateProps = {
	icon?: ReactNode;
	title: string;
	body?: string;
	action?: ReactNode;
	/** Set to 'alert' for a failure (load error), so assistive tech
	 * announces it immediately instead of waiting to be read in order —
	 * left unset for a merely-empty state, which isn't an error. */
	role?: 'alert';
};

/** The shared "nothing here" layout — centered icon badge, serif title
 * (matching every other heading in the app), muted body copy, an optional
 * action below. Used wherever a list/panel has nothing to show: an empty
 * vault, a search with no results, a failed load, an empty history, no
 * comments yet. Previously each of those hand-rolled its own left-aligned,
 * icon-less `<p className="settings-row__sub">` — fine for a one-line
 * settings caption, not for the focal content of an otherwise-empty
 * screen. */
export function EmptyState({ icon, title, body, action, role }: Readonly<EmptyStateProps>) {
	return (
		<div className="empty-state" role={role}>
			{icon ? (
				<div className="empty-state__icon" aria-hidden="true">
					{icon}
				</div>
			) : null}
			<p className="empty-state__title">{title}</p>
			{body ? <p className="empty-state__body">{body}</p> : null}
			{action ? <div className="empty-state__action">{action}</div> : null}
		</div>
	);
}
