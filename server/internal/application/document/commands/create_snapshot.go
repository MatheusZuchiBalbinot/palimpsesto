package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/dto"
)

// CreateSnapshotInput is what a client sends to compact a document's
// update log ("blind compaction"). Ciphertext is the client's own
// complete, encrypted state capture, sealed the same way as any other
// document content — the server stores and deletes by it, never reads it.
type CreateSnapshotInput struct {
	DocumentID   document.ID
	Caller       user.ID
	KeyEpoch     int
	UpToUpdateID uint64
	Ciphertext   []byte
}

// CreateSnapshotHandler compacts a document's update log. Any editor can
// (same bar as writing an update — a reader can't).
type CreateSnapshotHandler struct {
	membership document.MembershipRepository
	snapshots  document.SnapshotRepository
}

func NewCreateSnapshotHandler(membership document.MembershipRepository, snapshots document.SnapshotRepository) *CreateSnapshotHandler {
	return &CreateSnapshotHandler{membership: membership, snapshots: snapshots}
}

func (h *CreateSnapshotHandler) Handle(ctx context.Context, in CreateSnapshotInput) (documentdto.SnapshotView, error) {
	role, err := h.membership.MemberRole(ctx, in.DocumentID, in.Caller)
	if errors.Is(err, document.ErrNotFound) {
		return documentdto.SnapshotView{}, document.ErrNotFound
	}
	if err != nil {
		return documentdto.SnapshotView{}, fmt.Errorf("document: checking role: %w", err)
	}
	if role == document.RoleReader {
		return documentdto.SnapshotView{}, document.ErrNotEditor
	}

	created, err := h.snapshots.CreateSnapshot(ctx, document.NewSnapshotInput{
		DocumentID:   in.DocumentID,
		KeyEpoch:     in.KeyEpoch,
		UpToUpdateID: in.UpToUpdateID,
		Ciphertext:   in.Ciphertext,
	})
	if err != nil {
		return documentdto.SnapshotView{}, fmt.Errorf("document: creating snapshot: %w", err)
	}
	return documentdto.FromSnapshot(created), nil
}
