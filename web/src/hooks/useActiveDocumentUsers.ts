import { useEffect, useState } from 'react';

import { listActiveDocuments } from '../api/docs';
import type { ActiveDocumentsDTO, MemberDTO } from '../api/docTypes';
import type { DocumentId } from '../api/ids';
import { ACTIVE_DOCUMENTS_POLL_MS } from '../constants';

function toActiveUsersMap(res: ActiveDocumentsDTO): Map<DocumentId, MemberDTO[]> {
	return new Map(res.documents.map((d) => [d.document_id, d.users]));
}

function pollActiveDocuments(setActiveUsersByDoc: (m: Map<DocumentId, MemberDTO[]>) => void) {
	listActiveDocuments()
		.then((res) => setActiveUsersByDoc(toActiveUsersMap(res)))
		.catch(() => {});
}

export function useActiveDocumentUsers() {
	const [activeUsersByDoc, setActiveUsersByDoc] = useState<Map<DocumentId, MemberDTO[]>>(new Map());

	useEffect(() => {
		// Polling, not a per-document socket — GET /api/docs/active is a cheap
		// in-memory lookup against the realtime Hub, so a simple interval is
		// the right tool here (see docs/API.md and the comment on
		// Hub.ActiveDocuments).
		pollActiveDocuments(setActiveUsersByDoc);
		const interval = setInterval(() => pollActiveDocuments(setActiveUsersByDoc), ACTIVE_DOCUMENTS_POLL_MS);
		return () => clearInterval(interval);
	}, []);

	return activeUsersByDoc;
}
