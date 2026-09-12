package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// RestoreHandler undoes an earlier Delete.
type RestoreHandler struct {
	documents document.Repository
}

func NewRestoreHandler(documents document.Repository) *RestoreHandler {
	return &RestoreHandler{documents: documents}
}

// Handle restores a soft-deleted document. Only the owner can — checked
// against FindIncludingDeleted instead of the membership repository,
// since a deleted document's membership is (deliberately) invisible to
// every other check in the app.
func (h *RestoreHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) error {
	doc, err := h.documents.FindIncludingDeleted(ctx, docID)
	if errors.Is(err, document.ErrNotFound) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("document: finding document to restore: %w", err)
	}
	if doc.OwnerID != caller {
		return document.ErrNotOwner
	}

	if err := h.documents.Restore(ctx, docID); err != nil {
		return fmt.Errorf("document: restoring: %w", err)
	}
	return nil
}
