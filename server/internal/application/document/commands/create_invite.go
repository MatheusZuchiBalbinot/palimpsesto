package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
	"palimpsesto/internal/application/document/dto"
)

// CreateInviteInput is what a client sends to invite a user by email —
// same shape as AddMemberInput, except this becomes a pending Invite
// instead of an immediate Member; see the migration's own comment on
// document_invites for why WrappedDEK/KeyEpoch are captured now instead
// of at accept time.
type CreateInviteInput struct {
	DocumentID document.ID
	Caller     user.ID
	Email      string
	Role       document.Role
	WrappedDEK []byte
}

// CreateInviteHandler invites an existing user by email — pending until
// they accept.
type CreateInviteHandler struct {
	documents  document.Repository
	membership document.MembershipRepository
	invites    document.InviteRepository
}

func NewCreateInviteHandler(documents document.Repository, membership document.MembershipRepository, invites document.InviteRepository) *CreateInviteHandler {
	return &CreateInviteHandler{documents: documents, membership: membership, invites: invites}
}

func (h *CreateInviteHandler) Handle(ctx context.Context, in CreateInviteInput) (documentdto.InviteView, error) {
	if in.Role != document.RoleEditor && in.Role != document.RoleReader {
		return documentdto.InviteView{}, document.ErrInvalidRole
	}
	if err := authz.RequireMembership(ctx, h.membership, in.DocumentID, in.Caller); err != nil {
		return documentdto.InviteView{}, err
	}

	invitee, err := h.membership.FindMemberCandidateByEmail(ctx, in.Email)
	if errors.Is(err, document.ErrUserNotFound) {
		return documentdto.InviteView{}, document.ErrUserNotFound
	}
	if err != nil {
		return documentdto.InviteView{}, fmt.Errorf("document: finding invitee: %w", err)
	}

	isAlreadyMember, err := h.membership.IsMember(ctx, in.DocumentID, invitee)
	if err != nil {
		return documentdto.InviteView{}, fmt.Errorf("document: checking existing membership: %w", err)
	}
	if isAlreadyMember {
		return documentdto.InviteView{}, document.ErrAlreadyAdded
	}

	doc, err := h.documents.Find(ctx, in.DocumentID)
	if err != nil {
		return documentdto.InviteView{}, fmt.Errorf("document: loading document for invite: %w", err)
	}

	newInvite := document.NewInviteInput{
		DocumentID: in.DocumentID,
		InviterID:  in.Caller,
		InviteeID:  invitee,
		Role:       in.Role,
		WrappedDEK: in.WrappedDEK,
		KeyEpoch:   doc.CurrentKeyEpoch,
	}
	created, err := h.invites.CreateInvite(ctx, newInvite)
	if errors.Is(err, document.ErrAlreadyInvited) {
		return documentdto.InviteView{}, document.ErrAlreadyInvited
	}
	if err != nil {
		return documentdto.InviteView{}, fmt.Errorf("document: creating invite: %w", err)
	}
	return documentdto.FromInvite(created), nil
}
