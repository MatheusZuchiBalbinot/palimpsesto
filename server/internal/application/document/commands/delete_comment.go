package documentcommands

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
)

// DeleteCommentHandler deletes comments.
type DeleteCommentHandler struct {
	membership document.MembershipRepository
	comments   document.CommentRepository
}

func NewDeleteCommentHandler(membership document.MembershipRepository, comments document.CommentRepository) *DeleteCommentHandler {
	return &DeleteCommentHandler{membership: membership, comments: comments}
}

// Handle deletes a comment. Only its author or the document owner can.
func (h *DeleteCommentHandler) Handle(ctx context.Context, docID document.ID, commentID document.CommentID, caller user.ID) error {
	if err := authz.RequireCommentAuthorOrOwner(ctx, h.membership, h.comments, docID, commentID, caller); err != nil {
		return err
	}

	if err := h.comments.DeleteComment(ctx, docID, commentID); err != nil {
		return fmt.Errorf("document: deleting comment: %w", err)
	}
	return nil
}
