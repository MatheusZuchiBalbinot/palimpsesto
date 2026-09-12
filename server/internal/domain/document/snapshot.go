package document

import (
	"context"
	"time"
)

// Snapshot is a complete, encrypted, client-generated capture of a
// document's state at some point in its update log — "blind compaction":
// the server can't compact what it can't read, so it never builds a
// snapshot itself. It only stores the ciphertext a client hands it and, in
// the same moment, removes the updates that snapshot attests to covering.
type Snapshot struct {
	ID           SnapshotID
	DocumentID   ID
	KeyEpoch     int
	UpToUpdateID uint64
	Ciphertext   []byte
	CreatedAt    time.Time
}

// NewSnapshotInput is what creating a snapshot persists.
type NewSnapshotInput struct {
	DocumentID   ID
	KeyEpoch     int
	UpToUpdateID uint64
	Ciphertext   []byte
}

// SnapshotRepository is the persistence contract for a document's snapshots.
type SnapshotRepository interface {
	// CreateSnapshot stores a new snapshot and, atomically, deletes every
	// doc_updates row it covers (id <= in.UpToUpdateID) — the actual
	// "compaction". A client only calls this after it has already applied
	// and can reconstruct up to UpToUpdateID on its own; nothing here
	// re-derives or verifies that (the server can't — see docs/CRYPTO.md).
	CreateSnapshot(ctx context.Context, in NewSnapshotInput) (Snapshot, error)

	// FindLatestSnapshot returns the most recently created snapshot for
	// docID (the one with the highest UpToUpdateID). Returns
	// ErrSnapshotNotFound if the document doesn't have one yet.
	FindLatestSnapshot(ctx context.Context, docID ID) (Snapshot, error)
}
