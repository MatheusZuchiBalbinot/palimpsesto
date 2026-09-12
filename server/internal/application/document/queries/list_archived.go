package documentqueries

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/dto"
)

// ListArchivedHandler lists a user's own deleted documents — the vault's
// "Arquivados" view.
type ListArchivedHandler struct {
	documents document.Repository
}

func NewListArchivedHandler(documents document.Repository) *ListArchivedHandler {
	return &ListArchivedHandler{documents: documents}
}

func (h *ListArchivedHandler) Handle(ctx context.Context, ownerID user.ID) ([]documentdto.SummaryView, error) {
	summaries, err := h.documents.ListDeletedForOwner(ctx, ownerID)
	if err != nil {
		return nil, fmt.Errorf("document: listing archived: %w", err)
	}

	views := make([]documentdto.SummaryView, 0, len(summaries))
	for _, summary := range summaries {
		views = append(views, documentdto.FromSummary(summary))
	}
	return views, nil
}
