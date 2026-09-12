package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// DeleteHandler deletes documents.
type DeleteHandler struct {
	documents   document.Repository
	membership  document.MembershipRepository
	inviteLinks document.InviteLinkRepository
}

func NewDeleteHandler(documents document.Repository, membership document.MembershipRepository, inviteLinks document.InviteLinkRepository) *DeleteHandler {
	return &DeleteHandler{documents: documents, membership: membership, inviteLinks: inviteLinks}
}

// Handle removes a document. Only the owner can. The document's sharing
// link, if any, is revoked at the same time — otherwise anyone still
// holding the URL could join a soft-deleted document while it's deleted,
// leaving membership rows that resurface with full access if the owner
// later restores it.
func (h *DeleteHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) error {
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

	if err := h.documents.Delete(ctx, docID); err != nil {
		return fmt.Errorf("document: deleting: %w", err)
	}
	if err := h.inviteLinks.Revoke(ctx, docID); err != nil {
		return fmt.Errorf("document: revoking invite link on delete: %w", err)
	}
	return nil
}
