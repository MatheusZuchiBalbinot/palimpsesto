package documentcommands

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
)

// EditCommentInput is what correcting a comment's body requires.
type EditCommentInput struct {
	DocumentID document.ID
	CommentID  document.CommentID
	Caller     user.ID
	Body       string
}

// EditCommentHandler lets a comment's own author fix a typo in place —
// unlike ResolveCommentHandler/DeleteCommentHandler, the document owner
// gets no exception here.
type EditCommentHandler struct {
	comments document.CommentRepository
}

func NewEditCommentHandler(comments document.CommentRepository) *EditCommentHandler {
	return &EditCommentHandler{comments: comments}
}

func (h *EditCommentHandler) Handle(ctx context.Context, in EditCommentInput) error {
	if err := authz.RequireCommentAuthor(ctx, h.comments, in.DocumentID, in.CommentID, in.Caller); err != nil {
		return err
	}

	if err := h.comments.EditComment(ctx, in.DocumentID, in.CommentID, in.Body); err != nil {
		return fmt.Errorf("document: editing comment: %w", err)
	}
	return nil
}
