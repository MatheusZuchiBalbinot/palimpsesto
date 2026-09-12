package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// DeclineInviteHandler removes a pending invite the invitee doesn't want.
type DeclineInviteHandler struct {
	invites document.InviteRepository
}

func NewDeclineInviteHandler(invites document.InviteRepository) *DeclineInviteHandler {
	return &DeclineInviteHandler{invites: invites}
}

// Handle returns the declined invite on success — same reasoning as
// AcceptInviteHandler.Handle: a caller notifying the inviter needs
// InviterID without a second lookup.
func (h *DeclineInviteHandler) Handle(ctx context.Context, id document.InviteID, caller user.ID) (document.Invite, error) {
	invite, err := h.invites.FindInvite(ctx, id)
	if errors.Is(err, document.ErrInviteNotFound) {
		return document.Invite{}, document.ErrInviteNotFound
	}
	if err != nil {
		return document.Invite{}, fmt.Errorf("document: finding invite: %w", err)
	}
	if invite.InviteeID != caller {
		return document.Invite{}, document.ErrInviteNotFound
	}

	if err := h.invites.DeleteInvite(ctx, id); err != nil {
		return document.Invite{}, fmt.Errorf("document: declining invite: %w", err)
	}
	return invite, nil
}
