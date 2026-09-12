package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
)

// CancelInviteHandler removes a pending invite from the sender's side —
// unlike DeclineInviteHandler (which only the invitee can call), any
// member of the invite's document can cancel one they or a co-member
// sent, since it's their Share modal showing it as "sent".
type CancelInviteHandler struct {
	invites    document.InviteRepository
	membership document.MembershipRepository
}

func NewCancelInviteHandler(invites document.InviteRepository, membership document.MembershipRepository) *CancelInviteHandler {
	return &CancelInviteHandler{invites: invites, membership: membership}
}

// Handle returns the cancelled invite on success — same reasoning as
// AcceptInviteHandler.Handle: a caller notifying the invitee needs
// InviteeID without a second lookup.
func (h *CancelInviteHandler) Handle(ctx context.Context, id document.InviteID, caller user.ID) (document.Invite, error) {
	invite, err := h.invites.FindInvite(ctx, id)
	if errors.Is(err, document.ErrInviteNotFound) {
		return document.Invite{}, document.ErrInviteNotFound
	}
	if err != nil {
		return document.Invite{}, fmt.Errorf("document: finding invite: %w", err)
	}

	if err := authz.RequireMembership(ctx, h.membership, invite.DocumentID, caller); err != nil {
		return document.Invite{}, err
	}

	if err := h.invites.DeleteInvite(ctx, id); err != nil {
		return document.Invite{}, fmt.Errorf("document: cancelling invite: %w", err)
	}
	return invite, nil
}
