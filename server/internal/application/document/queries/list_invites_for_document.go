package documentqueries

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
	"palimpsesto/internal/application/document/dto"
)

// ListInvitesForDocumentHandler lists the pending invites sent out for a
// document — the Share modal's "convites enviados" list, so an
// invited-but-not-yet-accepted person isn't invisible there.
type ListInvitesForDocumentHandler struct {
	invites    document.InviteRepository
	membership document.MembershipRepository
}

func NewListInvitesForDocumentHandler(invites document.InviteRepository, membership document.MembershipRepository) *ListInvitesForDocumentHandler {
	return &ListInvitesForDocumentHandler{invites: invites, membership: membership}
}

func (h *ListInvitesForDocumentHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) ([]documentdto.InviteView, error) {
	if err := authz.RequireMembership(ctx, h.membership, docID, caller); err != nil {
		return nil, err
	}

	invites, err := h.invites.ListInvitesForDocument(ctx, docID)
	if err != nil {
		return nil, fmt.Errorf("document: listing invites for document: %w", err)
	}
	return documentdto.FromInviteSummaries(invites), nil
}
