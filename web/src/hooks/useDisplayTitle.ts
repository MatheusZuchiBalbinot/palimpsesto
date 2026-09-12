import { useMemo } from 'react';

import type { DocumentDTO } from '../api/docTypes';
import type { DocumentDEK } from '../crypto/documentDek';
import { computeDisplayTitle } from '../crypto/documentTitle';

/** Memoized wrapper around computeDisplayTitle — shared by DocumentPage.tsx
 * and HistoryPage.tsx, which both show a document's title while its data
 * loads. `decryptFailureFallback` defaults to '…' (HistoryPage's choice);
 * DocumentPage passes a translated "can't decrypt" message instead. */
export function useDisplayTitle(docInfo: DocumentDTO | null, documentKeyRing: DocumentDEK[], decryptFailureFallback = '…'): string {
	return useMemo(() => computeDisplayTitle(docInfo, documentKeyRing, decryptFailureFallback), [docInfo, documentKeyRing, decryptFailureFallback]);
}
