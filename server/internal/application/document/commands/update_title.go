package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// UpdateTitleHandler renames documents.
type UpdateTitleHandler struct {
	documents  document.Repository
	membership document.MembershipRepository
}

func NewUpdateTitleHandler(documents document.Repository, membership document.MembershipRepository) *UpdateTitleHandler {
	return &UpdateTitleHandler{documents: documents, membership: membership}
}

// Handle renames a document. Returns document.ErrNotEditor if the
// caller is a reader (renaming is a write, same as any other change to
// the document's content).
func (h *UpdateTitleHandler) Handle(ctx context.Context, docID document.ID, caller user.ID, title string) error {
	role, err := h.membership.MemberRole(ctx, docID, caller)
	if errors.Is(err, document.ErrNotFound) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("document: checking role: %w", err)
	}
	if role == document.RoleReader {
		return document.ErrNotEditor
	}

	if err := h.documents.UpdateTitle(ctx, docID, title); err != nil {
		return fmt.Errorf("document: updating title: %w", err)
	}
	return nil
}
