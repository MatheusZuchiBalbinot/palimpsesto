package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// RemoveMemberInput is what removing a member and rotating the
// document's key requires. NewWraps is the document's brand-new DEK,
// freshly generated and sealed by the caller's client for every member
// remaining after TargetUser leaves — this has to happen client-side
// (docs/CRYPTO.md: the server never sees a plaintext DEK) before this
// command even runs.
type RemoveMemberInput struct {
	DocumentID document.ID
	Caller     user.ID
	TargetUser user.ID
	NewWraps   map[user.ID][]byte
}

// RemoveMemberHandler removes a member and rotates the document's key —
// docs/CRYPTO.md: "real revocation requires rotation," since removing
// just the membership row does nothing to stop someone who already has
// the DEK from reading anything encrypted with it in the future. Only
// the owner can remove a member, and never themselves (that would leave
// the document without an owner).
type RemoveMemberHandler struct {
	membership document.MembershipRepository
}

func NewRemoveMemberHandler(membership document.MembershipRepository) *RemoveMemberHandler {
	return &RemoveMemberHandler{membership: membership}
}

// Handle returns the document's new key epoch on success.
func (h *RemoveMemberHandler) Handle(ctx context.Context, in RemoveMemberInput) (int, error) {
	role, err := h.membership.MemberRole(ctx, in.DocumentID, in.Caller)
	if errors.Is(err, document.ErrNotFound) {
		return 0, document.ErrNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("document: checking role: %w", err)
	}
	if !role.IsOwner() {
		return 0, document.ErrNotOwner
	}
	if in.TargetUser == in.Caller {
		return 0, document.ErrCannotRemoveOwner
	}

	newEpoch, err := h.membership.RemoveMemberAndRotate(ctx, in.DocumentID, in.TargetUser, in.NewWraps)
	if err != nil {
		return 0, fmt.Errorf("document: removing member and rotating: %w", err)
	}
	return newEpoch, nil
}
