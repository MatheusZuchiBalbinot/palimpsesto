package documentqueries

import (
	"context"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
	"palimpsesto/internal/application/document/dto"
)

// GetLatestSnapshotHandler returns a document's most recent snapshot, if
// there is one — what a client needs before replaying its update log, so
// it only has to fetch/decrypt/apply what's left after the snapshot,
// instead of everything since the document was created.
type GetLatestSnapshotHandler struct {
	membership document.MembershipRepository
	snapshots  document.SnapshotRepository
}

func NewGetLatestSnapshotHandler(membership document.MembershipRepository, snapshots document.SnapshotRepository) *GetLatestSnapshotHandler {
	return &GetLatestSnapshotHandler{membership: membership, snapshots: snapshots}
}

func (h *GetLatestSnapshotHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) (documentdto.SnapshotView, error) {
	if err := authz.RequireMembership(ctx, h.membership, docID, caller); err != nil {
		return documentdto.SnapshotView{}, err
	}
	found, err := h.snapshots.FindLatestSnapshot(ctx, docID)
	if err != nil {
		return documentdto.SnapshotView{}, err
	}
	return documentdto.FromSnapshot(found), nil
}
