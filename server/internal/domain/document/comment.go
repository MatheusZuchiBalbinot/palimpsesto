package document

import (
	"context"
	"time"

	"palimpsesto/internal/domain/user"
)

// CommentID identifies a comment on a document.
type CommentID string

// Comment is a note left on a document — flat, not threaded: this matches
// the vault's discussion-feed presentation, not an annotation anchored to a
// text range (that would require tracking a relative Yjs position per
// comment, a bigger feature this doesn't aim to have yet).
type Comment struct {
	ID         CommentID
	DocumentID ID
	AuthorID   user.ID
	Body       string
	CreatedAt  time.Time
	EditedAt   *time.Time
	ResolvedAt *time.Time
}

// NewCommentInput is what posting a comment persists.
type NewCommentInput struct {
	DocumentID ID
	AuthorID   user.ID
	Body       string
}

// CommentRepository is the persistence contract for a document's comments.
type CommentRepository interface {
	// CreateComment posts a new comment.
	CreateComment(ctx context.Context, in NewCommentInput) (Comment, error)

	// ListForDocument returns all comments for a document, oldest to newest.
	ListForDocument(ctx context.Context, docID ID) ([]Comment, error)

	// FindCommentAuthor returns who posted commentID, for the
	// delete/resolve authorization check. Returns ErrCommentNotFound if it
	// doesn't exist under docID.
	FindCommentAuthor(ctx context.Context, docID ID, commentID CommentID) (user.ID, error)

	// EditComment replaces a comment's body and sets edited_at. Returns
	// ErrCommentNotFound if it doesn't exist under docID.
	EditComment(ctx context.Context, docID ID, commentID CommentID, body string) error

	// ResolveComment marks a comment as resolved.
	ResolveComment(ctx context.Context, docID ID, commentID CommentID) error

	// DeleteComment removes a comment.
	DeleteComment(ctx context.Context, docID ID, commentID CommentID) error
}
