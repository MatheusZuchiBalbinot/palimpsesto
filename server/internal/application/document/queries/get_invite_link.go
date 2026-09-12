package documentqueries

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/dto"
)

// GetInviteLinkHandler fetches a document's current share link.
type GetInviteLinkHandler struct {
	membership  document.MembershipRepository
	inviteLinks document.InviteLinkRepository
}

func NewGetInviteLinkHandler(membership document.MembershipRepository, inviteLinks document.InviteLinkRepository) *GetInviteLinkHandler {
	return &GetInviteLinkHandler{membership: membership, inviteLinks: inviteLinks}
}

// Handle returns docID's share link. Only the owner can see it — same
// gate as creating or revoking one.
func (h *GetInviteLinkHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) (documentdto.InviteLinkView, error) {
	role, err := h.membership.MemberRole(ctx, docID, caller)
	if errors.Is(err, document.ErrNotFound) {
		return documentdto.InviteLinkView{}, document.ErrNotFound
	}
	if err != nil {
		return documentdto.InviteLinkView{}, fmt.Errorf("document: checking role: %w", err)
	}
	if !role.IsOwner() {
		return documentdto.InviteLinkView{}, document.ErrNotOwner
	}

	link, err := h.inviteLinks.FindLink(ctx, docID)
	if errors.Is(err, document.ErrInviteLinkNotFound) {
		return documentdto.InviteLinkView{}, document.ErrInviteLinkNotFound
	}
	if err != nil {
		return documentdto.InviteLinkView{}, fmt.Errorf("document: finding invite link: %w", err)
	}
	return documentdto.FromInviteLink(link), nil
}
