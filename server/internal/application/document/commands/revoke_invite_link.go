package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// RevokeInviteLinkHandler deactivates a document's share link.
type RevokeInviteLinkHandler struct {
	membership  document.MembershipRepository
	inviteLinks document.InviteLinkRepository
}

func NewRevokeInviteLinkHandler(membership document.MembershipRepository, inviteLinks document.InviteLinkRepository) *RevokeInviteLinkHandler {
	return &RevokeInviteLinkHandler{membership: membership, inviteLinks: inviteLinks}
}

// Handle revokes docID's share link. Only the owner can. Idempotent: a
// document with no active link isn't an error.
func (h *RevokeInviteLinkHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) error {
	role, err := h.membership.MemberRole(ctx, docID, caller)
	if errors.Is(err, document.ErrNotFound) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("document: checking role: %w", err)
	}
	if !role.IsOwner() {
		return document.ErrNotOwner
	}

	if err := h.inviteLinks.Revoke(ctx, docID); err != nil {
		return fmt.Errorf("document: revoking invite link: %w", err)
	}
	return nil
}
