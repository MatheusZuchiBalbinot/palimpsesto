package documentdto

import (
	"time"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// CommentView is a comment on a document.
type CommentView struct {
	ID         document.CommentID
	AuthorID   user.ID
	Body       string
	CreatedAt  time.Time
	EditedAt   *time.Time
	ResolvedAt *time.Time
}

func FromComment(c document.Comment) CommentView {
	return CommentView{
		ID:         c.ID,
		AuthorID:   c.AuthorID,
		Body:       c.Body,
		CreatedAt:  c.CreatedAt,
		EditedAt:   c.EditedAt,
		ResolvedAt: c.ResolvedAt,
	}
}
