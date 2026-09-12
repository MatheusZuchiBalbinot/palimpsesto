const MS_PER_MINUTE = 60000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_DAY = MS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY;

/** Formats an ISO timestamp as "2 hours ago" / "há 2 horas", locale-aware. */
export function formatRelativeTime(iso: string, locale: string): string {
	const diffMs = new Date(iso).getTime() - Date.now();
	const diffMin = Math.round(diffMs / MS_PER_MINUTE);
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

	if (Math.abs(diffMin) < 1) {
		return rtf.format(0, 'minute');
	}
	if (Math.abs(diffMin) < MINUTES_PER_HOUR) {
		return rtf.format(diffMin, 'minute');
	}

	const diffHour = Math.round(diffMin / MINUTES_PER_HOUR);
	if (Math.abs(diffHour) < HOURS_PER_DAY) {
		return rtf.format(diffHour, 'hour');
	}

	const diffDay = Math.round(diffHour / HOURS_PER_DAY);
	return rtf.format(diffDay, 'day');
}

/** The calendar day an ISO timestamp falls on, in local time — used to
 * group a list into day sections ("Today", "Yesterday", "Aug 12"). Two
 * timestamps on the same local day always produce the same key,
 * regardless of the time of day. */
export function dayKey(iso: string): string {
	const d = new Date(iso);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Today" / "Yesterday" / "Aug 12" for a day section header (sticky
 * headers in HistoryVersionList, UX_REVIEW.md 5.1) — "Today"/"Yesterday"
 * come from the same Intl.RelativeTimeFormat formatRelativeTime already
 * uses, so the wording matches. */
export function dayLabel(iso: string, locale: string): string {
	const date = new Date(iso);
	const today = new Date();
	const diffDays = Math.round((dateOnly(date) - dateOnly(today)) / MS_PER_DAY);
	if (diffDays === 0 || diffDays === -1) {
		const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
		return rtf.format(diffDays, 'day');
	}
	return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function dateOnly(d: Date): number {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
