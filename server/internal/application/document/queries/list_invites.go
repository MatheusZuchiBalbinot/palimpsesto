package documentqueries

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/dto"
)

// ListInvitesHandler lists the pending invites addressed to a user — the
// vault's "Convites" view.
type ListInvitesHandler struct {
	invites document.InviteRepository
}

func NewListInvitesHandler(invites document.InviteRepository) *ListInvitesHandler {
	return &ListInvitesHandler{invites: invites}
}

func (h *ListInvitesHandler) Handle(ctx context.Context, inviteeID user.ID) ([]documentdto.InviteView, error) {
	invites, err := h.invites.ListInvitesForInvitee(ctx, inviteeID)
	if err != nil {
		return nil, fmt.Errorf("document: listing invites: %w", err)
	}
	return documentdto.FromInviteSummaries(invites), nil
}
