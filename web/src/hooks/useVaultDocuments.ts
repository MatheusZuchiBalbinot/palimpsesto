import { useCallback, useEffect, useState } from 'react';

import { listDocuments } from '../api/docs';
import type { DocumentSummaryDTO } from '../api/docTypes';
import type { LoadStatus } from '../lib/loadStatus';

export function useVaultDocuments() {
	const [documents, setDocuments] = useState<DocumentSummaryDTO[]>([]);
	const [status, setStatus] = useState<LoadStatus>('loading');

	const refresh = useCallback(() => {
		setStatus('loading');
		listDocuments()
			.then((next) => {
				setDocuments(next);
				setStatus('ready');
			})
			.catch(() => setStatus('error'));
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { documents, setDocuments, status, refresh };
}
