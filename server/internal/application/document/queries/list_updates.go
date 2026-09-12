package documentqueries

import (
	"context"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
	"palimpsesto/internal/application/document/dto"
)

// ListUpdatesHandler lists a document's full CRDT update history.
type ListUpdatesHandler struct {
	membership document.MembershipRepository
	since      *UpdatesSinceHandler
}

func NewListUpdatesHandler(membership document.MembershipRepository, since *UpdatesSinceHandler) *ListUpdatesHandler {
	return &ListUpdatesHandler{membership: membership, since: since}
}

// Handle returns every persisted update, in order — what the client
// replays to reconstruct any past version. The payload is opaque
// ciphertext (docs/CRYPTO.md); this handler and the server as a whole
// never decrypt it, only store and replay bytes. The caller needs to be
// a member.
func (h *ListUpdatesHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) ([]documentdto.UpdateView, error) {
	if err := authz.RequireMembership(ctx, h.membership, docID, caller); err != nil {
		return nil, err
	}
	return h.since.Handle(ctx, docID, 0)
}
