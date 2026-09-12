import type {
	ActiveDocumentsDTO,
	AddMemberRequest,
	CommentDTO,
	CreateCommentRequest,
	CreateDocumentRequest,
	CreateFolderRequest,
	CreateInviteLinkRequest,
	CreateInviteRequest,
	CreateSnapshotRequest,
	DocumentDTO,
	DocumentSummaryDTO,
	EditCommentRequest,
	EpochKeyDTO,
	FolderDTO,
	InviteDTO,
	InviteLinkDTO,
	MemberDTO,
	RemoveMemberRequest,
	RemoveMemberResponseDTO,
	SetDocumentFolderRequest,
	SetWrappedDEKRequest,
	SnapshotDTO,
	UpdateDocumentRequest,
	UpdateFolderRequest,
	UpdateItemDTO,
	UpdateMemberRoleRequest,
	WrappedDEKDTO,
} from './docTypes';
import { ApiError, apiFetch } from './http';
import type { CommentId, DocumentId, FolderId, InviteId, InviteToken, UserId } from './ids';

export function listDocuments(): Promise<DocumentSummaryDTO[]> {
	return apiFetch<DocumentSummaryDTO[]>('/api/docs');
}

/** Which of the caller's own documents have someone connected right now
 * — feeds the vault list's "someone's editing this" indicator. */
export function listActiveDocuments(): Promise<ActiveDocumentsDTO> {
	return apiFetch<ActiveDocumentsDTO>('/api/docs/active');
}

/** The caller's own deleted documents — the vault's "Arquivados" view.
 * Each can still be restored via restoreDocument. */
export function listArchivedDocuments(): Promise<DocumentSummaryDTO[]> {
	return apiFetch<DocumentSummaryDTO[]>('/api/docs/archived');
}

export function createDocument(body: CreateDocumentRequest): Promise<DocumentDTO> {
	return apiFetch<DocumentDTO>('/api/docs', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function getDocument(id: DocumentId): Promise<DocumentDTO> {
	return apiFetch<DocumentDTO>(`/api/docs/${id}`);
}

export function updateDocument(id: DocumentId, body: UpdateDocumentRequest): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}`, {
		method: 'PATCH',
		body: JSON.stringify(body),
	});
}

export function deleteDocument(id: DocumentId): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}`, { method: 'DELETE' });
}

/** Undoes deleteDocument — the deleted document isn't actually gone
 * server-side, just invisible, until this is called. */
export function restoreDocument(id: DocumentId): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}/restore`, { method: 'POST' });
}

export function listMembers(id: DocumentId): Promise<MemberDTO[]> {
	return apiFetch<MemberDTO[]>(`/api/docs/${id}/members`);
}

export function addMember(id: DocumentId, body: AddMemberRequest): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}/members`, {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function createInvite(id: DocumentId, body: CreateInviteRequest): Promise<InviteDTO> {
	return apiFetch<InviteDTO>(`/api/docs/${id}/invites`, {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

/** The caller's own pending invites — the vault's "Convites" view. */
export function listInvites(): Promise<InviteDTO[]> {
	return apiFetch<InviteDTO[]>('/api/invites');
}

/** The pending invites sent out for a document — the Share modal's
 * "convite enviado" rows, so an invited-but-not-accepted person isn't
 * invisible there. */
export function listInvitesForDocument(id: DocumentId): Promise<InviteDTO[]> {
	return apiFetch<InviteDTO[]>(`/api/docs/${id}/invites`);
}

export function acceptInvite(id: InviteId): Promise<void> {
	return apiFetch<void>(`/api/invites/${id}/accept`, { method: 'POST' });
}

export function declineInvite(id: InviteId): Promise<void> {
	return apiFetch<void>(`/api/invites/${id}`, { method: 'DELETE' });
}

/** Cancels a pending invite from the sender's side — any member of the
 * document can call this, unlike declineInvite which only the invitee
 * can call on themselves. */
export function cancelInvite(docId: DocumentId, inviteId: InviteId): Promise<void> {
	return apiFetch<void>(`/api/docs/${docId}/invites/${inviteId}`, { method: 'DELETE' });
}

export function listUpdates(id: DocumentId): Promise<UpdateItemDTO[]> {
	return apiFetch<UpdateItemDTO[]>(`/api/docs/${id}/updates`);
}

/** Compacts a document's update log — only an editor can. */
export function createSnapshot(id: DocumentId, body: CreateSnapshotRequest): Promise<SnapshotDTO> {
	return apiFetch<SnapshotDTO>(`/api/docs/${id}/snapshots`, {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

/** Resolves to null when the document doesn't have a snapshot yet — not
 * an error, just nothing to apply before replaying the full update
 * log. */
export function getLatestSnapshot(id: DocumentId): Promise<SnapshotDTO | null> {
	return apiFetch<SnapshotDTO>(`/api/docs/${id}/snapshots/latest`).catch((err: unknown) => {
		const isMissingSnapshot = err instanceof ApiError && err.code === 'snapshot_not_found';
		if (isMissingSnapshot) {
			return null;
		}
		throw err;
	});
}

/** The caller's own wrapped DEK for a document — what's needed to decrypt
 * anything on open. Throws ApiError with code 'pending_wrapped_dek' if
 * the caller is a member but nobody's wrapped it for them yet (joined via
 * invite link). */
export function getWrappedDEK(id: DocumentId): Promise<WrappedDEKDTO> {
	return apiFetch<WrappedDEKDTO>(`/api/docs/${id}/wrapped-dek`);
}

/** Wraps the document's DEK for a member — the owner's own row right
 * after creating the document, or completing the wrap for a pending
 * member. */
export function setMemberWrappedDEK(id: DocumentId, userId: UserId, body: SetWrappedDEKRequest): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}/members/${userId}/wrapped-dek`, {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

/** The caller's own archived wrapped DEKs, from before any key rotation
 * they've lived through — needed to decrypt update history from before
 * that rotation. */
export function getKeyHistory(id: DocumentId): Promise<EpochKeyDTO[]> {
	return apiFetch<EpochKeyDTO[]>(`/api/docs/${id}/key-history`);
}

/** Removes a member and rotates the document's key in a single step —
 * only the owner can call this. newWraps needs to be freshly sealed,
 * client-side, for every member left after userId leaves. */
export function removeMember(id: DocumentId, userId: UserId, body: RemoveMemberRequest): Promise<RemoveMemberResponseDTO> {
	return apiFetch<RemoveMemberResponseDTO>(`/api/docs/${id}/members/${userId}`, {
		method: 'DELETE',
		body: JSON.stringify(body),
	});
}

/** A member removing their own membership, voluntarily — the same
 * endpoint as removeMember, with no body: the server tells the two apart
 * by whether the path's userId is the caller's own. Unlike removeMember,
 * this never rotates the document's key (a member who leaves already had
 * the DEK, so there's nothing to revoke from them). */
export function leaveDocument(id: DocumentId, userId: UserId): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}/members/${userId}`, { method: 'DELETE' });
}

/** Changes a member's role between editor and reader — owner-only, no
 * key rotation: a role is pure authorization, enforced on every write,
 * never something the DEK's encryption depends on. */
export function updateMemberRole(id: DocumentId, userId: UserId, body: UpdateMemberRoleRequest): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}/members/${userId}`, {
		method: 'PATCH',
		body: JSON.stringify(body),
	});
}

/** Resolves to null when the document doesn't have an active share link
 * yet — not an error, just nothing to show. */
export function getInviteLink(id: DocumentId): Promise<InviteLinkDTO | null> {
	return apiFetch<InviteLinkDTO>(`/api/docs/${id}/invite-link`).catch((err: unknown) => {
		const isMissingLink = err instanceof ApiError && err.code === 'invite_link_not_found';
		if (isMissingLink) {
			return null;
		}
		throw err;
	});
}

/** Creates the document's share link, or rotates it (the previous token
 * stops working) if one already exists. */
export function createInviteLink(id: DocumentId, body: CreateInviteLinkRequest): Promise<InviteLinkDTO> {
	return apiFetch<InviteLinkDTO>(`/api/docs/${id}/invite-link`, {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function revokeInviteLink(id: DocumentId): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}/invite-link`, { method: 'DELETE' });
}

/** Redeems an invite link's token to join the document — the self-service
 * counterpart to being invited by email. */
export function joinInviteLink(token: InviteToken): Promise<DocumentDTO> {
	return apiFetch<DocumentDTO>(`/api/invite-links/${token}/join`, { method: 'POST' });
}

export function listComments(id: DocumentId): Promise<CommentDTO[]> {
	return apiFetch<CommentDTO[]>(`/api/docs/${id}/comments`);
}

export function createComment(id: DocumentId, body: CreateCommentRequest): Promise<CommentDTO> {
	return apiFetch<CommentDTO>(`/api/docs/${id}/comments`, {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function editComment(id: DocumentId, commentId: CommentId, body: EditCommentRequest): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}/comments/${commentId}`, {
		method: 'PATCH',
		body: JSON.stringify(body),
	});
}

export function resolveComment(id: DocumentId, commentId: CommentId): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}/comments/${commentId}/resolve`, {
		method: 'POST',
	});
}

export function deleteComment(id: DocumentId, commentId: CommentId): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}/comments/${commentId}`, { method: 'DELETE' });
}

/** Personal document organization — a folder groups a subset of the
 * caller's own documents, never shared. */
export function listFolders(): Promise<FolderDTO[]> {
	return apiFetch<FolderDTO[]>('/api/folders');
}

export function createFolder(body: CreateFolderRequest): Promise<FolderDTO> {
	return apiFetch<FolderDTO>('/api/folders', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function updateFolder(id: FolderId, body: UpdateFolderRequest): Promise<FolderDTO> {
	return apiFetch<FolderDTO>(`/api/folders/${id}`, {
		method: 'PATCH',
		body: JSON.stringify(body),
	});
}

export function deleteFolder(id: FolderId): Promise<void> {
	return apiFetch<void>(`/api/folders/${id}`, { method: 'DELETE' });
}

/** Files a document under a folder, or clears it with folder_id: null. */
export function setDocumentFolder(id: DocumentId, body: SetDocumentFolderRequest): Promise<void> {
	return apiFetch<void>(`/api/docs/${id}/folder`, {
		method: 'PATCH',
		body: JSON.stringify(body),
	});
}
