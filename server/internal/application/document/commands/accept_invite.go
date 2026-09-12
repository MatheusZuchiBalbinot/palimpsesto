package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// AcceptInviteHandler converts a pending invite into real membership.
// Purely server-side: WrappedDEK was already sealed for the invitee's
// public key at invite time, so there's no client-side crypto step here
// — unlike a self-service invite-link join, which starts a member with no
// wrapped key at all.
type AcceptInviteHandler struct {
	documents  document.Repository
	membership document.MembershipRepository
	invites    document.InviteRepository
}

func NewAcceptInviteHandler(documents document.Repository, membership document.MembershipRepository, invites document.InviteRepository) *AcceptInviteHandler {
	return &AcceptInviteHandler{documents: documents, membership: membership, invites: invites}
}

// Handle returns the accepted invite on success — callers that need to
// notify the inviter (e.g. a live "your invite was accepted" push) get
// InviterID from it without a second lookup.
func (h *AcceptInviteHandler) Handle(ctx context.Context, id document.InviteID, caller user.ID) (document.Invite, error) {
	invite, err := h.invites.FindInvite(ctx, id)
	if errors.Is(err, document.ErrInviteNotFound) {
		return document.Invite{}, document.ErrInviteNotFound
	}
	if err != nil {
		return document.Invite{}, fmt.Errorf("document: finding invite: %w", err)
	}
	if invite.InviteeID != caller {
		// Same "existence itself isn't public information" reasoning as
		// authz.RequireMembership — someone else's invite ID shouldn't
		// distinguish "not yours" from "doesn't exist" for a caller probing.
		return document.Invite{}, document.ErrInviteNotFound
	}

	doc, err := h.documents.Find(ctx, invite.DocumentID)
	if err != nil {
		return document.Invite{}, fmt.Errorf("document: loading document for accept: %w", err)
	}
	if doc.CurrentKeyEpoch != invite.KeyEpoch {
		return document.Invite{}, document.ErrInviteStale
	}

	newMember := document.NewMemberInput{DocumentID: invite.DocumentID, UserID: caller, Role: invite.Role, WrappedDEK: invite.WrappedDEK}
	if err := h.membership.AddMember(ctx, newMember); err != nil {
		return document.Invite{}, fmt.Errorf("document: adding member on invite accept: %w", err)
	}

	if err := h.invites.DeleteInvite(ctx, id); err != nil {
		return document.Invite{}, fmt.Errorf("document: deleting accepted invite: %w", err)
	}
	return invite, nil
}
