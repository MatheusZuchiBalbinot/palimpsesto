package documentqueries

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
	"palimpsesto/internal/application/document/dto"
)

// GetWrappedDEKHandler returns the caller's own wrapped DEK for a
// document — what a client needs before it can decrypt anything on
// open.
type GetWrappedDEKHandler struct {
	membership document.MembershipRepository
}

func NewGetWrappedDEKHandler(membership document.MembershipRepository) *GetWrappedDEKHandler {
	return &GetWrappedDEKHandler{membership: membership}
}

// Handle returns document.ErrPendingWrappedDEK if the caller is a
// member but nobody has wrapped the DEK for them yet (docs/CRYPTO.md).
func (h *GetWrappedDEKHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) (documentdto.WrappedDEKView, error) {
	if err := authz.RequireMembership(ctx, h.membership, docID, caller); err != nil {
		return documentdto.WrappedDEKView{}, err
	}

	wrappedDEK, keyEpoch, err := h.membership.FindMemberWrappedDEK(ctx, docID, caller)
	if errors.Is(err, document.ErrPendingWrappedDEK) {
		return documentdto.WrappedDEKView{}, document.ErrPendingWrappedDEK
	}
	if err != nil {
		return documentdto.WrappedDEKView{}, fmt.Errorf("document: getting wrapped DEK: %w", err)
	}
	return documentdto.WrappedDEKView{WrappedDEK: wrappedDEK, KeyEpoch: keyEpoch}, nil
}
