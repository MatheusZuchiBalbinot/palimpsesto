import { useCallback, useEffect, useRef, useState } from 'react';

import { listArchivedDocuments } from '../api/docs';
import type { DocumentSummaryDTO } from '../api/docTypes';

/** The vault's "Arquivados" view — the caller's own deleted documents,
 * fetched separately from the main list (see VaultScope's doc comment). */
export function useArchivedDocuments(isActive: boolean) {
	const [documents, setDocuments] = useState<DocumentSummaryDTO[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	// refresh() is called both by the isActive effect below and manually
	// (a document restored/deleted elsewhere) — this sequence number
	// ensures only the most recently *issued* call ever writes state, so
	// switching the "Arquivados" tab off and back on quickly can't let a
	// slower earlier response overwrite a newer one.
	const requestSeqRef = useRef(0);

	const refresh = useCallback(() => {
		const seq = ++requestSeqRef.current;
		setIsLoading(true);
		listArchivedDocuments()
			.then((next) => {
				if (seq === requestSeqRef.current) {
					setDocuments(next);
				}
			})
			.catch(() => {
				if (seq === requestSeqRef.current) {
					setDocuments([]);
				}
			})
			.finally(() => {
				if (seq === requestSeqRef.current) {
					setIsLoading(false);
				}
			});
	}, []);

	useEffect(() => {
		if (isActive) {
			refresh();
		}
	}, [isActive, refresh]);

	return { documents, isLoading, refresh };
}
