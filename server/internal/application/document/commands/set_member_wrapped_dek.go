package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
)

// SetMemberWrappedDEKInput is what a client sends to wrap the document's
// DEK for one of its members — itself (the owner, right after creating
// the document) or someone else (completing a member's pending wrap,
// docs/CRYPTO.md).
type SetMemberWrappedDEKInput struct {
	DocumentID document.ID
	Caller     user.ID
	TargetUser user.ID
	WrappedDEK []byte
}

// SetMemberWrappedDEKHandler sets a member's wrapped DEK.
type SetMemberWrappedDEKHandler struct {
	membership document.MembershipRepository
}

func NewSetMemberWrappedDEKHandler(membership document.MembershipRepository) *SetMemberWrappedDEKHandler {
	return &SetMemberWrappedDEKHandler{membership: membership}
}

// Handle requires that the caller already be a member — the same gate
// as AddMember, since wrapping a DEK for someone else is a form of
// sharing. When the caller is wrapping for someone other than
// themselves, the target's wrap must still be pending: this action is
// for completing another member's pending wrap (docs/CRYPTO.md), not for
// overwriting a wrap that's already set — anyone who's merely a member
// (even a reader) would otherwise be able to clobber another member's
// key material at will.
func (h *SetMemberWrappedDEKHandler) Handle(ctx context.Context, in SetMemberWrappedDEKInput) error {
	if err := authz.RequireMembership(ctx, h.membership, in.DocumentID, in.Caller); err != nil {
		return err
	}

	if in.Caller != in.TargetUser {
		_, _, err := h.membership.FindMemberWrappedDEK(ctx, in.DocumentID, in.TargetUser)
		if err == nil {
			return document.ErrWrappedDEKAlreadySet
		}
		if !errors.Is(err, document.ErrPendingWrappedDEK) {
			if errors.Is(err, document.ErrNotFound) {
				return document.ErrNotFound
			}
			return fmt.Errorf("document: checking target wrapped DEK: %w", err)
		}
	}

	if err := h.membership.SetMemberWrappedDEK(ctx, in.DocumentID, in.TargetUser, in.WrappedDEK); err != nil {
		return fmt.Errorf("document: setting member wrapped DEK: %w", err)
	}
	return nil
}
