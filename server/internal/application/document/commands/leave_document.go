package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// LeaveDocumentInput is what a member voluntarily leaving a document
// requires.
type LeaveDocumentInput struct {
	DocumentID document.ID
	Caller     user.ID
}

// LeaveDocumentHandler removes the caller's own membership — unlike
// RemoveMemberHandler, this never rotates the document's key (see
// MembershipRepository.LeaveDocument) and needs no owner's consent, since
// it's the caller's own access being given up. The owner can't leave this
// way, since that would strand the document without one.
type LeaveDocumentHandler struct {
	membership document.MembershipRepository
}

func NewLeaveDocumentHandler(membership document.MembershipRepository) *LeaveDocumentHandler {
	return &LeaveDocumentHandler{membership: membership}
}

func (h *LeaveDocumentHandler) Handle(ctx context.Context, in LeaveDocumentInput) error {
	role, err := h.membership.MemberRole(ctx, in.DocumentID, in.Caller)
	if errors.Is(err, document.ErrNotFound) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("document: checking role: %w", err)
	}
	if role.IsOwner() {
		return document.ErrCannotRemoveOwner
	}

	if err := h.membership.LeaveDocument(ctx, in.DocumentID, in.Caller); err != nil {
		return fmt.Errorf("document: leaving document: %w", err)
	}
	return nil
}
