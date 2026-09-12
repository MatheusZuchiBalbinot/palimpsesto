package documentqueries

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
	"palimpsesto/internal/application/document/dto"
)

// GetKeyHistoryHandler returns a member's own archived past wrapped
// DEKs.
type GetKeyHistoryHandler struct {
	membership document.MembershipRepository
}

func NewGetKeyHistoryHandler(membership document.MembershipRepository) *GetKeyHistoryHandler {
	return &GetKeyHistoryHandler{membership: membership}
}

// Handle returns every epoch before the caller's current one for which
// they've ever had a wrapped DEK — what their client needs to decrypt
// update history from before any key rotation they lived through.
func (h *GetKeyHistoryHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) ([]documentdto.EpochKeyView, error) {
	if err := authz.RequireMembership(ctx, h.membership, docID, caller); err != nil {
		return nil, err
	}
	history, err := h.membership.ListMemberKeyHistory(ctx, docID, caller)
	if err != nil {
		return nil, fmt.Errorf("document: listing key history: %w", err)
	}
	return documentdto.FromEpochKeys(history), nil
}
