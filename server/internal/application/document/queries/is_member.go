package documentqueries

import (
	"context"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// IsMemberHandler checks membership on a document — the one gate every
// websocket connection, and every update read/write, has to pass.
type IsMemberHandler struct {
	membership document.MembershipRepository
}

func NewIsMemberHandler(membership document.MembershipRepository) *IsMemberHandler {
	return &IsMemberHandler{membership: membership}
}

func (h *IsMemberHandler) Handle(ctx context.Context, docID document.ID, userID user.ID) (bool, error) {
	return h.membership.IsMember(ctx, docID, userID)
}
