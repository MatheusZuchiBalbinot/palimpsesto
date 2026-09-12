package documentapp_test

import (
	"context"
	"errors"
	"testing"

	"palimpsesto/internal/domain/document"

	"palimpsesto/internal/application/document/commands"
)

// TestSnapshotCompaction is the acceptance test for "blind compaction":
// a client-submitted snapshot gets stored, and every update it covers
// gets removed from doc_updates in the same moment — the server never
// reads either one to decide this, it just trusts UpToUpdateID.
func TestSnapshotCompaction(t *testing.T) {
	env := newTestEnv(t)
	ctx := context.Background()

	owner := newTestUser(t, env)
	reader := newTestUser(t, env)

	doc, err := env.documents.Create(ctx, owner.ID, "")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	addReader := documentcommands.AddMemberInput{DocumentID: doc.ID, Caller: owner.ID, Email: reader.Email, Role: document.RoleReader}
	if err := env.documents.AddMemberByEmail(ctx, addReader); err != nil {
		t.Fatalf("inviting reader: %v", err)
	}

	var lastID uint64
	for i := 0; i < 5; i++ {
		id, err := env.documents.AppendUpdate(ctx, doc.ID, owner.ID, []byte("opaque ciphertext"))
		if err != nil {
			t.Fatalf("appending update %d: %v", i, err)
		}
		lastID = id
	}
	snapshotCutoff := lastID // covers the 5 updates appended so far

	// One more update arrives *after* the snapshot cutoff — it needs to
	// survive compaction.
	afterID, err := env.documents.AppendUpdate(ctx, doc.ID, owner.ID, []byte("opaque ciphertext after"))
	if err != nil {
		t.Fatalf("appending update after cutoff: %v", err)
	}

	t.Run("a reader cannot create a snapshot", func(t *testing.T) {
		in := documentcommands.CreateSnapshotInput{
			DocumentID:   doc.ID,
			Caller:       reader.ID,
			KeyEpoch:     1,
			UpToUpdateID: snapshotCutoff,
			Ciphertext:   []byte("encrypted full state"),
		}
		if _, err := env.documents.CreateSnapshot(ctx, in); !errors.Is(err, document.ErrNotEditor) {
			t.Fatalf("want %v, got %v", document.ErrNotEditor, err)
		}
	})

	t.Run("a document with no snapshot yet reports ErrSnapshotNotFound", func(t *testing.T) {
		if _, err := env.documents.GetLatestSnapshot(ctx, doc.ID, owner.ID); !errors.Is(err, document.ErrSnapshotNotFound) {
			t.Fatalf("want %v, got %v", document.ErrSnapshotNotFound, err)
		}
	})

	t.Run("the owner creates a snapshot covering the first 5 updates", func(t *testing.T) {
		in := documentcommands.CreateSnapshotInput{
			DocumentID:   doc.ID,
			Caller:       owner.ID,
			KeyEpoch:     1,
			UpToUpdateID: snapshotCutoff,
			Ciphertext:   []byte("encrypted full state"),
		}
		created, err := env.documents.CreateSnapshot(ctx, in)
		if err != nil {
			t.Fatalf("creating snapshot: %v", err)
		}
		if created.UpToUpdateID != snapshotCutoff {
			t.Fatalf("want cutoff %d, got %d", snapshotCutoff, created.UpToUpdateID)
		}
		if string(created.Ciphertext) != "encrypted full state" {
			t.Fatalf("got the wrong ciphertext back: %q", created.Ciphertext)
		}
	})

	t.Run("the snapshot is now the latest", func(t *testing.T) {
		found, err := env.documents.GetLatestSnapshot(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("getting latest snapshot: %v", err)
		}
		if found.UpToUpdateID != snapshotCutoff {
			t.Fatalf("want cutoff %d, got %d", snapshotCutoff, found.UpToUpdateID)
		}
	})

	t.Run("updates covered by the snapshot are pruned; the one after it survives", func(t *testing.T) {
		remaining, err := env.documents.ListUpdates(ctx, doc.ID, owner.ID)
		if err != nil {
			t.Fatalf("listing updates: %v", err)
		}
		if len(remaining) != 1 {
			t.Fatalf("want exactly 1 update remaining after compaction, got %d", len(remaining))
		}
		if remaining[0].ID != afterID {
			t.Fatalf("want the surviving update to be %d, got %d", afterID, remaining[0].ID)
		}
	})

	t.Run("a stranger cannot create a snapshot or read one", func(t *testing.T) {
		stranger := newTestUser(t, env)
		in := documentcommands.CreateSnapshotInput{
			DocumentID:   doc.ID,
			Caller:       stranger.ID,
			KeyEpoch:     1,
			UpToUpdateID: afterID,
			Ciphertext:   []byte("forged"),
		}
		if _, err := env.documents.CreateSnapshot(ctx, in); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
		if _, err := env.documents.GetLatestSnapshot(ctx, doc.ID, stranger.ID); !errors.Is(err, document.ErrNotFound) {
			t.Fatalf("want %v, got %v", document.ErrNotFound, err)
		}
	})
}
