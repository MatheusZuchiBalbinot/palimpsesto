package documentcommands

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
)

// ResolveCommentHandler marks comments as resolved.
type ResolveCommentHandler struct {
	membership document.MembershipRepository
	comments   document.CommentRepository
}

func NewResolveCommentHandler(membership document.MembershipRepository, comments document.CommentRepository) *ResolveCommentHandler {
	return &ResolveCommentHandler{membership: membership, comments: comments}
}

// Handle resolves a comment. Only its author or the document's owner can.
func (h *ResolveCommentHandler) Handle(ctx context.Context, docID document.ID, commentID document.CommentID, caller user.ID) error {
	if err := authz.RequireCommentAuthorOrOwner(ctx, h.membership, h.comments, docID, commentID, caller); err != nil {
		return err
	}

	if err := h.comments.ResolveComment(ctx, docID, commentID); err != nil {
		return fmt.Errorf("document: resolving comment: %w", err)
	}
	return nil
}
