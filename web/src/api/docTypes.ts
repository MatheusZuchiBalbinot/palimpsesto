// DTOs for /api/docs*.

import type { FolderColor } from '../lib/folderColors';
import type { CommentId, DocumentId, FolderId, InviteId, InviteToken, UserId } from './ids';

export type Role = 'owner' | 'editor' | 'reader';

export type DocumentDTO = {
	id: DocumentId;
	owner_id: UserId;
	title_ciphertext: string;
	current_key_epoch: number;
	folder_id: FolderId | null;
};

export type DocumentSummaryDTO = {
	update_count: number;
	last_edited_at: string | null;
	last_editor_name: string;
} & DocumentDTO;

export type FolderDTO = {
	id: FolderId;
	name: string;
	color: FolderColor;
	created_at: string;
};

export type CreateFolderRequest = {
	name: string;
	color: FolderColor;
};

export type UpdateFolderRequest = {
	name: string;
	color: FolderColor;
};

export type SetDocumentFolderRequest = {
	folder_id: FolderId | null;
};

export type MemberDTO = {
	user_id: UserId;
	email: string;
	display_name: string;
	role: Role;
	/** False for a member who joined via invite link and hasn't had the
	 * document's DEK wrapped for them by an existing member yet —
	 * "pending" in the UI. */
	has_wrapped_dek: boolean;
};

/** The document's DEK, sealed for the caller. wrapped_dek is standard
 * base64. */
export type WrappedDEKDTO = {
	wrapped_dek: string;
	key_epoch: number;
};

/** One of the caller's own documents that has someone connected right
 * now, plus who — an entry in GET /api/docs/active's response. */
export type ActiveDocumentDTO = {
	document_id: DocumentId;
	users: MemberDTO[];
};

export type ActiveDocumentsDTO = {
	documents: ActiveDocumentDTO[];
};

export type CreateDocumentRequest = {
	title_ciphertext: string;
};

export type UpdateDocumentRequest = {
	title_ciphertext: string;
};

export type AddMemberRequest = {
	email: string;
	role?: Role;
	/** Standard base64 — the document's DEK, sealed for the invitee. */
	wrapped_dek: string;
};

/** Same shape as AddMemberRequest — the invitee just doesn't get access
 * until they accept. */
export type CreateInviteRequest = {
	email: string;
	role?: Role;
	wrapped_dek: string;
};

/** A pending invite. Serves both the invitee's "Convites" view (which
 * ignores invitee_name/invitee_email, and has no document title — there's
 * no key to decrypt one with before accepting) and the Share modal's
 * "convite enviado" row (which ignores inviter_name/inviter_email). */
export type InviteDTO = {
	id: InviteId;
	inviter_name: string;
	inviter_email: string;
	invitee_name: string;
	invitee_email: string;
	role: Role;
	created_at: string;
};

/** Standard base64. */
export type SetWrappedDEKRequest = {
	wrapped_dek: string;
};

/** One of the caller's own archived wrapped DEKs, from before some key
 * rotation moved past it. wrapped_dek is standard base64. */
export type EpochKeyDTO = {
	key_epoch: number;
	wrapped_dek: string;
};

/** What removing a member and rotating the document's key requires: each
 * remaining member's user_id mapped to their new wrapped_dek (standard
 * base64) under the new epoch, both computed client-side. */
export type RemoveMemberRequest = {
	new_wraps: Record<UserId, string>;
};

export type RemoveMemberResponseDTO = {
	key_epoch: number;
};

export type UpdateMemberRoleRequest = {
	role: Exclude<Role, 'owner'>;
};

/** A persisted CRDT update. `payload` is standard base64 (not base64url —
 * see the backend handler's comment) of the raw Yjs update bytes. */
export type UpdateItemDTO = {
	id: number;
	author_id: UserId;
	payload: string;
	created_at: string;
};

/** A document's share link — never carries the 'owner' role (see
 * server/internal/domain/document/invite_link.go). */
export type InviteLinkRole = Exclude<Role, 'owner'>;

export type InviteLinkDTO = {
	token: InviteToken;
	role: InviteLinkRole;
	created_at: string;
};

export type CreateInviteLinkRequest = {
	role: InviteLinkRole;
};

export type CommentDTO = {
	id: CommentId;
	author_id: UserId;
	body_ciphertext: string;
	created_at: string;
	edited_at: string | null;
	resolved_at: string | null;
};

export type EditCommentRequest = {
	body_ciphertext: string;
};

export type CreateCommentRequest = {
	body_ciphertext: string;
};

/** A document's most recent compaction snapshot. ciphertext is standard
 * base64 of an encrypted `Y.encodeStateAsUpdate` capture. */
export type SnapshotDTO = {
	key_epoch: number;
	up_to_update_id: number;
	ciphertext: string;
	created_at: string;
};

export type CreateSnapshotRequest = {
	key_epoch: number;
	up_to_update_id: number;
	ciphertext: string;
};
