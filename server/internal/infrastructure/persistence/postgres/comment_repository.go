package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// CreateComment creates a new comment, per document.CommentRepository.
func (r *DocumentRepository) CreateComment(ctx context.Context, in document.NewCommentInput) (document.Comment, error) {
	var (
		id        string
		createdAt time.Time
	)
	err := r.pool.pool.QueryRow(ctx,
		`INSERT INTO document_comments (document_id, author_id, body_ciphertext)
		 VALUES ($1, $2, $3)
		 RETURNING id, created_at`,
		in.DocumentID, in.AuthorID, in.Body,
	).Scan(&id, &createdAt)
	if err != nil {
		return document.Comment{}, fmt.Errorf("postgres: creating comment: %w", err)
	}

	return document.Comment{
		ID:         document.CommentID(id),
		DocumentID: in.DocumentID,
		AuthorID:   in.AuthorID,
		Body:       in.Body,
		CreatedAt:  createdAt,
	}, nil
}

// ListForDocument returns all of a document's comments, oldest to
// newest, per document.CommentRepository.
func (r *DocumentRepository) ListForDocument(ctx context.Context, docID document.ID) ([]document.Comment, error) {
	rows, err := r.pool.pool.Query(ctx,
		`SELECT id, author_id, body_ciphertext, created_at, edited_at, resolved_at
		 FROM document_comments WHERE document_id = $1 ORDER BY created_at`,
		docID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres: listing comments: %w", err)
	}
	defer rows.Close()

	var comments []document.Comment
	for rows.Next() {
		var (
			id, authorID string
		)
		comment := document.Comment{DocumentID: docID}
		if err := rows.Scan(&id, &authorID, &comment.Body, &comment.CreatedAt, &comment.EditedAt, &comment.ResolvedAt); err != nil {
			return nil, fmt.Errorf("postgres: scanning comment row: %w", err)
		}
		comment.ID = document.CommentID(id)
		comment.AuthorID = user.ID(authorID)
		comments = append(comments, comment)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterating comments: %w", err)
	}
	return comments, nil
}

// FindCommentAuthor returns who posted commentID, per document.CommentRepository.
func (r *DocumentRepository) FindCommentAuthor(ctx context.Context, docID document.ID, commentID document.CommentID) (user.ID, error) {
	var authorID string
	err := r.pool.pool.QueryRow(ctx,
		`SELECT author_id FROM document_comments WHERE document_id = $1 AND id = $2`,
		docID, commentID,
	).Scan(&authorID)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return "", document.ErrCommentNotFound
	}
	if err != nil {
		return "", fmt.Errorf("postgres: finding comment author: %w", err)
	}
	return user.ID(authorID), nil
}

// EditComment replaces a comment's body and stamps edited_at, per
// document.CommentRepository. Returns document.ErrCommentNotFound if it
// doesn't exist under docID.
func (r *DocumentRepository) EditComment(ctx context.Context, docID document.ID, commentID document.CommentID, body string) error {
	tag, err := r.pool.pool.Exec(ctx,
		`UPDATE document_comments SET body_ciphertext = $3, edited_at = now() WHERE document_id = $1 AND id = $2`,
		docID, commentID, body,
	)
	if err != nil {
		return fmt.Errorf("postgres: editing comment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return document.ErrCommentNotFound
	}
	return nil
}

// ResolveComment marks a comment as resolved, per document.CommentRepository.
func (r *DocumentRepository) ResolveComment(ctx context.Context, docID document.ID, commentID document.CommentID) error {
	_, err := r.pool.pool.Exec(ctx,
		`UPDATE document_comments SET resolved_at = now() WHERE document_id = $1 AND id = $2`,
		docID, commentID,
	)
	if err != nil {
		return fmt.Errorf("postgres: resolving comment: %w", err)
	}
	return nil
}

// DeleteComment removes a comment, per document.CommentRepository.
func (r *DocumentRepository) DeleteComment(ctx context.Context, docID document.ID, commentID document.CommentID) error {
	_, err := r.pool.pool.Exec(ctx,
		`DELETE FROM document_comments WHERE document_id = $1 AND id = $2`,
		docID, commentID,
	)
	if err != nil {
		return fmt.Errorf("postgres: deleting comment: %w", err)
	}
	return nil
}
