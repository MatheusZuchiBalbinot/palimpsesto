package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
)

// AppendUpdateHandler persists CRDT updates.
type AppendUpdateHandler struct {
	updates    document.UpdateRepository
	membership document.MembershipRepository
}

func NewAppendUpdateHandler(updates document.UpdateRepository, membership document.MembershipRepository) *AppendUpdateHandler {
	return &AppendUpdateHandler{updates: updates, membership: membership}
}

// Handle persists a CRDT update and returns the ID assigned to it.
// Returns document.ErrNotEditor if the author is a reader. A reader who
// also holds the DEK could still forge a ciphertext that decrypts to
// convincing content if the server itself colluded with them — the
// server never verifies the client-side Ed25519 signature every update
// actually carries (it can't: that would need the DEK, which it never
// has), it only enforces this role check. So this stops an honest server
// from accepting writes from a read-only member, not a malicious one
// from accepting forgeries from a read-only member.
func (h *AppendUpdateHandler) Handle(ctx context.Context, in document.NewUpdateInput) (uint64, error) {
	role, err := h.membership.MemberRole(ctx, in.DocumentID, in.AuthorID)
	if errors.Is(err, document.ErrNotFound) {
		return 0, document.ErrNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("document: checking role: %w", err)
	}
	if role == document.RoleReader {
		return 0, document.ErrNotEditor
	}

	id, err := h.updates.AppendUpdate(ctx, in)
	if err != nil {
		return 0, fmt.Errorf("document: appending update: %w", err)
	}
	return id, nil
}
