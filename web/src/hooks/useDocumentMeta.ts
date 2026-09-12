import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getDocument, listComments, listMembers } from '../api/docs';
import type { CommentDTO, DocumentDTO, MemberDTO } from '../api/docTypes';
import type { DocumentId } from '../api/ids';
import { translateError } from '../i18n/errors';
import { showToast } from '../lib/toast';

// docInfo, members and comments are all fetched together up front (and
// members/comments can be refreshed independently afterward — a rename
// doesn't need to refetch members, a share doesn't need to refetch
// comments).
export function useDocumentMeta(id: DocumentId | undefined) {
	const { t } = useTranslation();
	const [docInfo, setDocInfo] = useState<DocumentDTO | null>(null);
	const [members, setMembers] = useState<MemberDTO[]>([]);
	const [comments, setComments] = useState<CommentDTO[]>([]);

	// Every fetch below checks this before writing state — guards against a
	// slow response for the *previous* document landing after `id` already
	// moved on to a new one (DocumentPage doesn't remount between two
	// documents under the same route, e.g. navigating there straight from
	// CommandPalette) — without this, that response would silently
	// overwrite the new document's already-loaded, correct docInfo/members/
	// comments with the old document's. A ref (updated in its own effect,
	// not during render) rather than a per-effect `isCancelled` flag
	// because refreshMembers/refreshComments are also called directly from
	// outside this hook's own effect (e.g. ShareModal's onKeyRotated).
	const idRef = useRef(id);
	useEffect(() => {
		idRef.current = id;
	}, [id]);

	// A failed refresh used to leave the list silently at whatever it was
	// before — indistinguishable from "genuinely empty" for members in
	// particular, which other pages derive owner/role checks from. Toasted
	// (not returned as state) since nothing here calls refresh in a
	// context — this hook's own effect, ShareModal closing — that already
	// has a natural place in the UI to show an inline error for it.
	const refreshMembers = useCallback(() => {
		if (!id) {
			return;
		}
		listMembers(id)
			.then((next) => {
				if (idRef.current === id) {
					setMembers(next);
				}
			})
			.catch((e: unknown) => {
				if (idRef.current === id) {
					showToast(translateError(t, e), 'error');
				}
			});
	}, [id, t]);

	const refreshComments = useCallback(() => {
		if (!id) {
			return;
		}
		listComments(id)
			.then((next) => {
				if (idRef.current === id) {
					setComments(next);
				}
			})
			.catch((e: unknown) => {
				if (idRef.current === id) {
					showToast(translateError(t, e), 'error');
				}
			});
	}, [id, t]);

	useEffect(() => {
		if (!id) {
			return;
		}
		getDocument(id)
			.then((doc) => {
				if (idRef.current === id) {
					setDocInfo(doc);
				}
			})
			.catch(() => {
				if (idRef.current === id) {
					setDocInfo(null);
				}
			});
		refreshMembers();
		refreshComments();
	}, [id, refreshMembers, refreshComments]);

	return {
		docInfo,
		setDocInfo,
		members,
		comments,
		setComments,
		refreshMembers,
		refreshComments,
	};
}
