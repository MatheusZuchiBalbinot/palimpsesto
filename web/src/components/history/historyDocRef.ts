import type { DocumentId } from '../../api/ids';

/** The "back to this document" link every history/ screen state renders
 * (loading, empty, or the real header) — the same pair travels unchanged
 * from HistoryPage to whichever of the three it shows. */
export type HistoryDocRef = {
	docId: DocumentId;
	displayTitle: string;
};
