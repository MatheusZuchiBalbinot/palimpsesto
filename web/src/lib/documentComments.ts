import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';

import { createComment, deleteComment, editComment, resolveComment } from '../api/docs';
import type { CommentDTO, DocumentDTO, MemberDTO } from '../api/docTypes';
import type { CommentId, DocumentId, UserId } from '../api/ids';
import type { Session } from '../auth/session';
import { translateError } from '../i18n/errors';
import { shortId } from './shortId';
import { showToast } from './toast';

type ResolveAllCommentsParams = {
	id: DocumentId | undefined;
	unresolvedComments: CommentDTO[];
	setComments: Dispatch<SetStateAction<CommentDTO[]>>;
	refreshComments: () => void;
	t: TFunction;
};

export function resolveAllComments({ id, unresolvedComments, setComments, refreshComments, t }: ResolveAllCommentsParams) {
	if (!id) {
		return;
	}
	const targets = unresolvedComments.map((c) => c.id);
	if (targets.length === 0) {
		return;
	}
	setComments((cs) => cs.map((c) => (c.resolved_at ? c : { ...c, resolved_at: new Date().toISOString() })));
	Promise.all(targets.map((commentId) => resolveComment(id, commentId))).catch((e: unknown) => {
		refreshComments();
		showToast(translateError(t, e), 'error');
	});
}

type CommentAuthorNameParams = {
	authorId: UserId;
	session: Session | null;
	members: MemberDTO[];
};

export function commentAuthorName({ authorId, session, members }: CommentAuthorNameParams): string {
	if (session && authorId === session.user.user_id) {
		return session.user.display_name || session.user.email;
	}

	const member = members.find((m) => m.user_id === authorId);
	return member?.display_name || member?.email || shortId(authorId);
}

type CanManageCommentParams = {
	comment: CommentDTO;
	session: Session | null;
	docInfo: DocumentDTO | null;
};

export function canManageComment({ comment, session, docInfo }: CanManageCommentParams): boolean {
	if (!session) {
		return false;
	}

	const isAuthor = comment.author_id === session.user.user_id;
	const isOwner = docInfo?.owner_id === session.user.user_id;

	return isAuthor || isOwner;
}

export type CreateCommentActionsParams = {
	id: DocumentId | undefined;
	commentDraft: string;
	setCommentDraft: Dispatch<SetStateAction<string>>;
	setComments: Dispatch<SetStateAction<CommentDTO[]>>;
	deleteCommentTarget: CommentId | null;
	setDeleteCommentTarget: (target: CommentId | null) => void;
	refreshComments: () => void;
	t: TFunction;
};

export function createCommentActions(params: CreateCommentActionsParams) {
	const { id, commentDraft, setCommentDraft, setComments, deleteCommentTarget, setDeleteCommentTarget, refreshComments, t } = params;
	function handleAddComment() {
		if (!id || !commentDraft.trim()) {
			return;
		}

		const body = commentDraft.trim();

		setCommentDraft('');
		createComment(id, { body_ciphertext: body }).then(
			(created) => setComments((cs) => [...cs, created]),
			(e: unknown) => {
				refreshComments();
				showToast(translateError(t, e), 'error');
			},
		);
	}

	function handleEditComment(commentId: CommentId, body: string) {
		if (!id) {
			return;
		}

		const editedAt = new Date().toISOString();

		setComments((cs) => cs.map((c) => (c.id === commentId ? { ...c, body_ciphertext: body, edited_at: editedAt } : c)));
		editComment(id, commentId, { body_ciphertext: body }).catch((e: unknown) => {
			refreshComments();
			showToast(translateError(t, e), 'error');
		});
	}

	function handleResolveComment(commentId: CommentId) {
		if (!id) {
			return;
		}

		setComments((cs) => cs.map((c) => (c.id === commentId ? { ...c, resolved_at: new Date().toISOString() } : c)));
		resolveComment(id, commentId).catch((e: unknown) => {
			refreshComments();
			showToast(translateError(t, e), 'error');
		});
	}

	function handleConfirmDeleteComment() {
		if (!id || !deleteCommentTarget) {
			return;
		}

		const commentId = deleteCommentTarget;
		setDeleteCommentTarget(null);
		setComments((cs) => cs.filter((c) => c.id !== commentId));
		deleteComment(id, commentId).catch((e: unknown) => {
			refreshComments();
			showToast(translateError(t, e), 'error');
		});
	}

	return { handleAddComment, handleEditComment, handleResolveComment, handleConfirmDeleteComment };
}
