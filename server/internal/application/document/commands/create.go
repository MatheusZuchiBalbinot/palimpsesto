// Package commands implements the document application service's write
// use cases: create, rename, delete, add member, append update.
package documentcommands

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/dto"
)

// CreateHandler creates new documents.
type CreateHandler struct {
	documents document.Repository
}

func NewCreateHandler(documents document.Repository) *CreateHandler {
	return &CreateHandler{documents: documents}
}

// Handle creates a new document, with its creator as the owner member.
func (h *CreateHandler) Handle(ctx context.Context, ownerID user.ID, title string) (documentdto.DocumentView, error) {
	created, err := h.documents.Create(ctx, ownerID, title)
	if err != nil {
		return documentdto.DocumentView{}, fmt.Errorf("document: creating: %w", err)
	}
	return documentdto.FromDocument(created), nil
}
