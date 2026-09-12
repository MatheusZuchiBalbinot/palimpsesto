package postgres

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// AppendUpdate persists an update and returns its assigned ID (used
// both to rebroadcast it with a stable identifier and as the client's
// resync cursor).
func (r *DocumentRepository) AppendUpdate(ctx context.Context, in document.NewUpdateInput) (uint64, error) {
	var id uint64
	err := r.pool.pool.QueryRow(ctx,
		`INSERT INTO doc_updates (doc_id, author_id, ciphertext) VALUES ($1, $2, $3) RETURNING id`,
		in.DocumentID, in.AuthorID, in.Payload,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("postgres: appending update: %w", err)
	}
	return id, nil
}

// ListUpdatesSince returns every update after sinceID, in order — the
// history a client needs to catch up on joining or reconnecting.
func (r *DocumentRepository) ListUpdatesSince(ctx context.Context, docID document.ID, sinceID uint64) ([]document.Update, error) {
	rows, err := r.pool.pool.Query(ctx,
		`SELECT id, author_id, ciphertext, created_at
		 FROM doc_updates WHERE doc_id = $1 AND id > $2 ORDER BY id`,
		docID, sinceID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres: listing updates: %w", err)
	}
	defer rows.Close()

	var updates []document.Update
	for rows.Next() {
		var update document.Update
		var authorID string
		if err := rows.Scan(&update.ID, &authorID, &update.Payload, &update.CreatedAt); err != nil {
			return nil, fmt.Errorf("postgres: scanning update row: %w", err)
		}
		update.AuthorID = user.ID(authorID)
		updates = append(updates, update)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterating updates: %w", err)
	}
	return updates, nil
}
