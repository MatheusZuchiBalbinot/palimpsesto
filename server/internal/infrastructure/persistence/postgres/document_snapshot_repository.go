package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"palimpsesto/internal/domain/document"
)

// CreateSnapshot stores a new snapshot and, in the same transaction,
// deletes every doc_updates row it covers — the actual compaction.
// Never checks that the snapshot's content matches those updates (the
// server can't read either one), only that the caller already went
// through AppendUpdate to get UpToUpdateID in the first place — trusting
// the client the same way it already trusts every other ciphertext it
// receives.
func (r *DocumentRepository) CreateSnapshot(ctx context.Context, in document.NewSnapshotInput) (document.Snapshot, error) {
	tx, err := r.pool.pool.Begin(ctx)
	if err != nil {
		return document.Snapshot{}, fmt.Errorf("postgres: beginning snapshot transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		id        int64
		createdAt time.Time
	)
	err = tx.QueryRow(ctx,
		`INSERT INTO doc_snapshots (doc_id, key_epoch, up_to_update_id, ciphertext)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, created_at`,
		in.DocumentID, in.KeyEpoch, in.UpToUpdateID, in.Ciphertext,
	).Scan(&id, &createdAt)
	if err != nil {
		return document.Snapshot{}, fmt.Errorf("postgres: creating snapshot: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`DELETE FROM doc_updates WHERE doc_id = $1 AND id <= $2`,
		in.DocumentID, in.UpToUpdateID,
	); err != nil {
		return document.Snapshot{}, fmt.Errorf("postgres: pruning updates covered by snapshot: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return document.Snapshot{}, fmt.Errorf("postgres: committing snapshot: %w", err)
	}

	return document.Snapshot{
		ID:           document.SnapshotID(fmt.Sprintf("%d", id)),
		DocumentID:   in.DocumentID,
		KeyEpoch:     in.KeyEpoch,
		UpToUpdateID: in.UpToUpdateID,
		Ciphertext:   in.Ciphertext,
		CreatedAt:    createdAt,
	}, nil
}

// FindLatestSnapshot returns docID's most recent snapshot — the
// highest UpToUpdateID, which is also always the most recently created,
// since snapshots only move forward. Returns document.ErrSnapshotNotFound
// if none exists yet.
func (r *DocumentRepository) FindLatestSnapshot(ctx context.Context, docID document.ID) (document.Snapshot, error) {
	var (
		id           int64
		keyEpoch     int
		upToUpdateID uint64
		ciphertext   []byte
		createdAt    time.Time
	)
	err := r.pool.pool.QueryRow(ctx,
		`SELECT id, key_epoch, up_to_update_id, ciphertext, created_at
		 FROM doc_snapshots WHERE doc_id = $1 ORDER BY up_to_update_id DESC LIMIT 1`,
		docID,
	).Scan(&id, &keyEpoch, &upToUpdateID, &ciphertext, &createdAt)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return document.Snapshot{}, document.ErrSnapshotNotFound
	}
	if err != nil {
		return document.Snapshot{}, fmt.Errorf("postgres: finding latest snapshot: %w", err)
	}
	return document.Snapshot{
		ID:           document.SnapshotID(fmt.Sprintf("%d", id)),
		DocumentID:   docID,
		KeyEpoch:     keyEpoch,
		UpToUpdateID: upToUpdateID,
		Ciphertext:   ciphertext,
		CreatedAt:    createdAt,
	}, nil
}
