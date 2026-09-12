// Package documentapp is the document domain's application layer: wires
// together the create/rename/delete/add-member/append-update commands
// and the list/get/list-members/list-updates/is-member queries into a
// single Service, the one entry point interfaces/http and
// infrastructure/realtime depend on.
package documentapp

import (
	"context"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/commands"
	"palimpsesto/internal/application/document/dto"
	"palimpsesto/internal/application/document/queries"
)

// Service is the document application service. Never imports net/http —
// interfaces/http translates HTTP into these method calls and back.
type Service struct {
	create              *documentcommands.CreateHandler
	updateTitle         *documentcommands.UpdateTitleHandler
	delete              *documentcommands.DeleteHandler
	restore             *documentcommands.RestoreHandler
	addMember           *documentcommands.AddMemberHandler
	setMemberWrappedDEK *documentcommands.SetMemberWrappedDEKHandler
	removeMember        *documentcommands.RemoveMemberHandler
	updateMemberRole    *documentcommands.UpdateMemberRoleHandler
	leaveDocument       *documentcommands.LeaveDocumentHandler
	appendUpdate        *documentcommands.AppendUpdateHandler
	createSnapshot      *documentcommands.CreateSnapshotHandler

	list              *documentqueries.ListHandler
	listArchived      *documentqueries.ListArchivedHandler
	get               *documentqueries.GetHandler
	listMembers       *documentqueries.ListMembersHandler
	listUpdates       *documentqueries.ListUpdatesHandler
	updatesSince      *documentqueries.UpdatesSinceHandler
	isMember          *documentqueries.IsMemberHandler
	getInviteLink     *documentqueries.GetInviteLinkHandler
	getWrappedDEK     *documentqueries.GetWrappedDEKHandler
	getKeyHistory     *documentqueries.GetKeyHistoryHandler
	getLatestSnapshot *documentqueries.GetLatestSnapshotHandler

	createInviteLink  *documentcommands.CreateInviteLinkHandler
	revokeInviteLink  *documentcommands.RevokeInviteLinkHandler
	joinViaInviteLink *documentcommands.JoinViaInviteLinkHandler

	listComments   *documentqueries.ListCommentsHandler
	createComment  *documentcommands.CreateCommentHandler
	editComment    *documentcommands.EditCommentHandler
	resolveComment *documentcommands.ResolveCommentHandler
	deleteComment  *documentcommands.DeleteCommentHandler

	createFolder      *documentcommands.CreateFolderHandler
	updateFolder      *documentcommands.UpdateFolderHandler
	deleteFolder      *documentcommands.DeleteFolderHandler
	setDocumentFolder *documentcommands.SetDocumentFolderHandler
	listFolders       *documentqueries.ListFoldersHandler

	createInvite           *documentcommands.CreateInviteHandler
	acceptInvite           *documentcommands.AcceptInviteHandler
	declineInvite          *documentcommands.DeclineInviteHandler
	cancelInvite           *documentcommands.CancelInviteHandler
	listInvites            *documentqueries.ListInvitesHandler
	listInvitesForDocument *documentqueries.ListInvitesForDocumentHandler
}

func NewService(
	documents document.Repository,
	membership document.MembershipRepository,
	updates document.UpdateRepository,
	inviteLinks document.InviteLinkRepository,
	comments document.CommentRepository,
	snapshots document.SnapshotRepository,
	folders document.FolderRepository,
	invites document.InviteRepository,
) *Service {
	updatesSince := documentqueries.NewUpdatesSinceHandler(updates)

	return &Service{
		create:              documentcommands.NewCreateHandler(documents),
		updateTitle:         documentcommands.NewUpdateTitleHandler(documents, membership),
		delete:              documentcommands.NewDeleteHandler(documents, membership, inviteLinks),
		restore:             documentcommands.NewRestoreHandler(documents),
		addMember:           documentcommands.NewAddMemberHandler(membership),
		setMemberWrappedDEK: documentcommands.NewSetMemberWrappedDEKHandler(membership),
		removeMember:        documentcommands.NewRemoveMemberHandler(membership),
		updateMemberRole:    documentcommands.NewUpdateMemberRoleHandler(membership),
		leaveDocument:       documentcommands.NewLeaveDocumentHandler(membership),
		appendUpdate:        documentcommands.NewAppendUpdateHandler(updates, membership),
		createSnapshot:      documentcommands.NewCreateSnapshotHandler(membership, snapshots),

		list:              documentqueries.NewListHandler(documents),
		listArchived:      documentqueries.NewListArchivedHandler(documents),
		get:               documentqueries.NewGetHandler(documents, membership),
		listMembers:       documentqueries.NewListMembersHandler(membership),
		listUpdates:       documentqueries.NewListUpdatesHandler(membership, updatesSince),
		updatesSince:      updatesSince,
		isMember:          documentqueries.NewIsMemberHandler(membership),
		getInviteLink:     documentqueries.NewGetInviteLinkHandler(membership, inviteLinks),
		getWrappedDEK:     documentqueries.NewGetWrappedDEKHandler(membership),
		getKeyHistory:     documentqueries.NewGetKeyHistoryHandler(membership),
		getLatestSnapshot: documentqueries.NewGetLatestSnapshotHandler(membership, snapshots),

		createInviteLink:  documentcommands.NewCreateInviteLinkHandler(membership, inviteLinks),
		revokeInviteLink:  documentcommands.NewRevokeInviteLinkHandler(membership, inviteLinks),
		joinViaInviteLink: documentcommands.NewJoinViaInviteLinkHandler(documents, membership, inviteLinks),

		listComments:   documentqueries.NewListCommentsHandler(membership, comments),
		createComment:  documentcommands.NewCreateCommentHandler(membership, comments),
		editComment:    documentcommands.NewEditCommentHandler(comments),
		resolveComment: documentcommands.NewResolveCommentHandler(membership, comments),
		deleteComment:  documentcommands.NewDeleteCommentHandler(membership, comments),

		createFolder:      documentcommands.NewCreateFolderHandler(folders),
		updateFolder:      documentcommands.NewUpdateFolderHandler(folders),
		deleteFolder:      documentcommands.NewDeleteFolderHandler(folders),
		setDocumentFolder: documentcommands.NewSetDocumentFolderHandler(documents, membership),
		listFolders:       documentqueries.NewListFoldersHandler(folders),

		createInvite:           documentcommands.NewCreateInviteHandler(documents, membership, invites),
		acceptInvite:           documentcommands.NewAcceptInviteHandler(documents, membership, invites),
		declineInvite:          documentcommands.NewDeclineInviteHandler(invites),
		cancelInvite:           documentcommands.NewCancelInviteHandler(invites, membership),
		listInvites:            documentqueries.NewListInvitesHandler(invites),
		listInvitesForDocument: documentqueries.NewListInvitesForDocumentHandler(invites, membership),
	}
}

func (s *Service) Create(ctx context.Context, ownerID user.ID, title string) (documentdto.DocumentView, error) {
	return s.create.Handle(ctx, ownerID, title)
}

func (s *Service) List(ctx context.Context, userID user.ID) ([]documentdto.SummaryView, error) {
	return s.list.Handle(ctx, userID)
}

func (s *Service) ListArchived(ctx context.Context, ownerID user.ID) ([]documentdto.SummaryView, error) {
	return s.listArchived.Handle(ctx, ownerID)
}

func (s *Service) Get(ctx context.Context, docID document.ID, caller user.ID) (documentdto.DocumentView, error) {
	return s.get.Handle(ctx, docID, caller)
}

func (s *Service) UpdateTitle(ctx context.Context, docID document.ID, caller user.ID, title string) error {
	return s.updateTitle.Handle(ctx, docID, caller, title)
}

func (s *Service) Delete(ctx context.Context, docID document.ID, caller user.ID) error {
	return s.delete.Handle(ctx, docID, caller)
}

func (s *Service) Restore(ctx context.Context, docID document.ID, caller user.ID) error {
	return s.restore.Handle(ctx, docID, caller)
}

func (s *Service) ListMembers(ctx context.Context, docID document.ID, caller user.ID) ([]documentdto.MemberView, error) {
	return s.listMembers.Handle(ctx, docID, caller)
}

func (s *Service) AddMemberByEmail(ctx context.Context, in documentcommands.AddMemberInput) error {
	return s.addMember.Handle(ctx, in)
}

func (s *Service) SetMemberWrappedDEK(ctx context.Context, in documentcommands.SetMemberWrappedDEKInput) error {
	return s.setMemberWrappedDEK.Handle(ctx, in)
}

func (s *Service) GetWrappedDEK(ctx context.Context, docID document.ID, caller user.ID) (documentdto.WrappedDEKView, error) {
	return s.getWrappedDEK.Handle(ctx, docID, caller)
}

func (s *Service) GetKeyHistory(ctx context.Context, docID document.ID, caller user.ID) ([]documentdto.EpochKeyView, error) {
	return s.getKeyHistory.Handle(ctx, docID, caller)
}

// RemoveMember removes a member and rotates the document's key,
// returning the new epoch (docs/CRYPTO.md).
func (s *Service) RemoveMember(ctx context.Context, in documentcommands.RemoveMemberInput) (int, error) {
	return s.removeMember.Handle(ctx, in)
}

// UpdateMemberRole changes a member's role between editor and reader — no
// key rotation, the owner-only counterpart to LeaveDocument.
func (s *Service) UpdateMemberRole(ctx context.Context, in documentcommands.UpdateMemberRoleInput) error {
	return s.updateMemberRole.Handle(ctx, in)
}

// LeaveDocument removes the caller's own membership, voluntarily and
// without rotating the document's key (docs/CRYPTO.md: a member
// leaving already had the DEK, so nothing needs to be revoked from them).
func (s *Service) LeaveDocument(ctx context.Context, in documentcommands.LeaveDocumentInput) error {
	return s.leaveDocument.Handle(ctx, in)
}

// CreateSnapshot compacts a document's update log (docs/CRYPTO.md).
func (s *Service) CreateSnapshot(ctx context.Context, in documentcommands.CreateSnapshotInput) (documentdto.SnapshotView, error) {
	return s.createSnapshot.Handle(ctx, in)
}

// GetLatestSnapshot returns a document's most recent snapshot. Returns
// document.ErrSnapshotNotFound if it doesn't have one yet.
func (s *Service) GetLatestSnapshot(ctx context.Context, docID document.ID, caller user.ID) (documentdto.SnapshotView, error) {
	return s.getLatestSnapshot.Handle(ctx, docID, caller)
}

// IsMember is exported for the websocket handler in interfaces/http,
// which authenticates membership on its own before any handler-level
// logic runs.
func (s *Service) IsMember(ctx context.Context, docID document.ID, userID user.ID) (bool, error) {
	return s.isMember.Handle(ctx, docID, userID)
}

func (s *Service) AppendUpdate(ctx context.Context, docID document.ID, authorID user.ID, payload []byte) (uint64, error) {
	return s.appendUpdate.Handle(ctx, document.NewUpdateInput{DocumentID: docID, AuthorID: authorID, Payload: payload})
}

func (s *Service) ListUpdates(ctx context.Context, docID document.ID, caller user.ID) ([]documentdto.UpdateView, error) {
	return s.listUpdates.Handle(ctx, docID, caller)
}

func (s *Service) UpdatesSince(ctx context.Context, docID document.ID, sinceID uint64) ([]documentdto.UpdateView, error) {
	return s.updatesSince.Handle(ctx, docID, sinceID)
}

func (s *Service) GetInviteLink(ctx context.Context, docID document.ID, caller user.ID) (documentdto.InviteLinkView, error) {
	return s.getInviteLink.Handle(ctx, docID, caller)
}

func (s *Service) CreateInviteLink(ctx context.Context, in documentcommands.CreateInviteLinkInput) (documentdto.InviteLinkView, error) {
	return s.createInviteLink.Handle(ctx, in)
}

func (s *Service) RevokeInviteLink(ctx context.Context, docID document.ID, caller user.ID) error {
	return s.revokeInviteLink.Handle(ctx, docID, caller)
}

func (s *Service) JoinViaInviteLink(ctx context.Context, token document.InviteToken, caller user.ID) (documentdto.DocumentView, error) {
	return s.joinViaInviteLink.Handle(ctx, token, caller)
}

func (s *Service) ListComments(ctx context.Context, docID document.ID, caller user.ID) ([]documentdto.CommentView, error) {
	return s.listComments.Handle(ctx, docID, caller)
}

func (s *Service) CreateComment(ctx context.Context, in documentcommands.CreateCommentInput) (documentdto.CommentView, error) {
	return s.createComment.Handle(ctx, in)
}

func (s *Service) EditComment(ctx context.Context, in documentcommands.EditCommentInput) error {
	return s.editComment.Handle(ctx, in)
}

func (s *Service) ResolveComment(ctx context.Context, docID document.ID, commentID document.CommentID, caller user.ID) error {
	return s.resolveComment.Handle(ctx, docID, commentID, caller)
}

func (s *Service) DeleteComment(ctx context.Context, docID document.ID, commentID document.CommentID, caller user.ID) error {
	return s.deleteComment.Handle(ctx, docID, commentID, caller)
}

func (s *Service) CreateFolder(ctx context.Context, in documentcommands.CreateFolderInput) (documentdto.FolderView, error) {
	return s.createFolder.Handle(ctx, in)
}

func (s *Service) ListFolders(ctx context.Context, ownerID user.ID) ([]documentdto.FolderView, error) {
	return s.listFolders.Handle(ctx, ownerID)
}

func (s *Service) UpdateFolder(ctx context.Context, in documentcommands.UpdateFolderInput) (documentdto.FolderView, error) {
	return s.updateFolder.Handle(ctx, in)
}

func (s *Service) DeleteFolder(ctx context.Context, id document.FolderID, ownerID user.ID) error {
	return s.deleteFolder.Handle(ctx, id, ownerID)
}

func (s *Service) SetDocumentFolder(ctx context.Context, in documentcommands.SetDocumentFolderInput) error {
	return s.setDocumentFolder.Handle(ctx, in)
}

func (s *Service) CreateInvite(ctx context.Context, in documentcommands.CreateInviteInput) (documentdto.InviteView, error) {
	return s.createInvite.Handle(ctx, in)
}

func (s *Service) AcceptInvite(ctx context.Context, id document.InviteID, caller user.ID) (document.Invite, error) {
	return s.acceptInvite.Handle(ctx, id, caller)
}

func (s *Service) DeclineInvite(ctx context.Context, id document.InviteID, caller user.ID) (document.Invite, error) {
	return s.declineInvite.Handle(ctx, id, caller)
}

func (s *Service) ListInvites(ctx context.Context, inviteeID user.ID) ([]documentdto.InviteView, error) {
	return s.listInvites.Handle(ctx, inviteeID)
}

func (s *Service) CancelInvite(ctx context.Context, id document.InviteID, caller user.ID) (document.Invite, error) {
	return s.cancelInvite.Handle(ctx, id, caller)
}

func (s *Service) ListInvitesForDocument(ctx context.Context, docID document.ID, caller user.ID) ([]documentdto.InviteView, error) {
	return s.listInvitesForDocument.Handle(ctx, docID, caller)
}
