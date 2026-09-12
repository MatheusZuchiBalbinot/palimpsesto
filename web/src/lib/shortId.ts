export const SHORT_ID_LENGTH = 8;

/** A short, human-scannable fallback label for an id whose real display
 * name isn't known — the last resort after display_name/email in
 * member and comment-author name lookups (DocumentPage.tsx,
 * HistoryPage.tsx). */
export function shortId(id: string): string {
	return id.slice(0, SHORT_ID_LENGTH);
}
