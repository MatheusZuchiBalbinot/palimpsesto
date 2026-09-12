// Shared between HistoryScrubber and HistoryVersionList, which both render
// a version's timestamp the same way.
export const SCRUBBER_TIME_FORMAT = {
	day: '2-digit',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit',
} as const;
