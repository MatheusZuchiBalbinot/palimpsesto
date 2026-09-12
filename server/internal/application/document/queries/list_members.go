package documentqueries

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
	"palimpsesto/internal/application/document/dto"
)

// ListMembersHandler lists a document's members.
type ListMembersHandler struct {
	membership document.MembershipRepository
}

func NewListMembersHandler(membership document.MembershipRepository) *ListMembersHandler {
	return &ListMembersHandler{membership: membership}
}

// Handle returns every member of a document. The caller needs to be a
// member.
func (h *ListMembersHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) ([]documentdto.MemberView, error) {
	if err := authz.RequireMembership(ctx, h.membership, docID, caller); err != nil {
		return nil, err
	}

	members, err := h.membership.ListMembers(ctx, docID)
	if err != nil {
		return nil, fmt.Errorf("document: listing members: %w", err)
	}

	views := make([]documentdto.MemberView, 0, len(members))
	for _, member := range members {
		views = append(views, documentdto.FromMember(member))
	}
	return views, nil
}
