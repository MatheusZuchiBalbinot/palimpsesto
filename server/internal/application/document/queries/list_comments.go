package documentqueries

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
	"palimpsesto/internal/application/document/dto"
)

// ListCommentsHandler lists a document's comments.
type ListCommentsHandler struct {
	membership document.MembershipRepository
	comments   document.CommentRepository
}

func NewListCommentsHandler(membership document.MembershipRepository, comments document.CommentRepository) *ListCommentsHandler {
	return &ListCommentsHandler{membership: membership, comments: comments}
}

// Handle returns every comment on a document, oldest to newest. The
// caller needs to be a member.
func (h *ListCommentsHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) ([]documentdto.CommentView, error) {
	if err := authz.RequireMembership(ctx, h.membership, docID, caller); err != nil {
		return nil, err
	}

	comments, err := h.comments.ListForDocument(ctx, docID)
	if err != nil {
		return nil, fmt.Errorf("document: listing comments: %w", err)
	}

	views := make([]documentdto.CommentView, 0, len(comments))
	for _, comment := range comments {
		views = append(views, documentdto.FromComment(comment))
	}
	return views, nil
}
