package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/dto"
)

// CreateInviteLinkInput is what a client sends to (re)create a document's
// sharing link.
type CreateInviteLinkInput struct {
	DocumentID document.ID
	Caller     user.ID
	Role       document.Role
}

// CreateInviteLinkHandler (re)generates a document's sharing link. Only
// the owner can — a link with RoleEditor is as powerful as inviting
// someone by email, so it gets the same gate as membership changes.
type CreateInviteLinkHandler struct {
	membership  document.MembershipRepository
	inviteLinks document.InviteLinkRepository
}

func NewCreateInviteLinkHandler(membership document.MembershipRepository, inviteLinks document.InviteLinkRepository) *CreateInviteLinkHandler {
	return &CreateInviteLinkHandler{membership: membership, inviteLinks: inviteLinks}
}

// Handle creates docID's sharing link if none exists, or rotates it (a
// fresh token, the old one stops working) if one already does.
func (h *CreateInviteLinkHandler) Handle(ctx context.Context, in CreateInviteLinkInput) (documentdto.InviteLinkView, error) {
	if in.Role != document.RoleEditor && in.Role != document.RoleReader {
		return documentdto.InviteLinkView{}, document.ErrInvalidRole
	}

	role, err := h.membership.MemberRole(ctx, in.DocumentID, in.Caller)
	if errors.Is(err, document.ErrNotFound) {
		return documentdto.InviteLinkView{}, document.ErrNotFound
	}
	if err != nil {
		return documentdto.InviteLinkView{}, fmt.Errorf("document: checking role: %w", err)
	}
	if !role.IsOwner() {
		return documentdto.InviteLinkView{}, document.ErrNotOwner
	}

	link, err := h.inviteLinks.Upsert(ctx, in.DocumentID, in.Role)
	if err != nil {
		return documentdto.InviteLinkView{}, fmt.Errorf("document: creating invite link: %w", err)
	}
	return documentdto.FromInviteLink(link), nil
}
