package documentcommands

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
	"palimpsesto/internal/application/document/dto"
)

// CreateCommentInput is what a client sends to post a comment.
type CreateCommentInput struct {
	DocumentID document.ID
	AuthorID   user.ID
	Body       string
}

// CreateCommentHandler posts new comments.
type CreateCommentHandler struct {
	membership document.MembershipRepository
	comments   document.CommentRepository
}

func NewCreateCommentHandler(membership document.MembershipRepository, comments document.CommentRepository) *CreateCommentHandler {
	return &CreateCommentHandler{membership: membership, comments: comments}
}

// Handle posts a comment. The caller must be a member.
func (h *CreateCommentHandler) Handle(ctx context.Context, in CreateCommentInput) (documentdto.CommentView, error) {
	if err := authz.RequireMembership(ctx, h.membership, in.DocumentID, in.AuthorID); err != nil {
		return documentdto.CommentView{}, err
	}

	newComment := document.NewCommentInput{DocumentID: in.DocumentID, AuthorID: in.AuthorID, Body: in.Body}
	created, err := h.comments.CreateComment(ctx, newComment)
	if err != nil {
		return documentdto.CommentView{}, fmt.Errorf("document: creating comment: %w", err)
	}
	return documentdto.FromComment(created), nil
}
