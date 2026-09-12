// Package queries implements the document application service's read
// use cases: list, get, list members, list updates, membership checks.
package documentqueries

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/dto"
)

// ListHandler lists a user's documents.
type ListHandler struct {
	documents document.Repository
}

func NewListHandler(documents document.Repository) *ListHandler {
	return &ListHandler{documents: documents}
}

// Handle returns every document userID is a member of, with activity
// summaries for the vault's list view.
func (h *ListHandler) Handle(ctx context.Context, userID user.ID) ([]documentdto.SummaryView, error) {
	summaries, err := h.documents.ListForUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("document: listing: %w", err)
	}

	views := make([]documentdto.SummaryView, 0, len(summaries))
	for _, summary := range summaries {
		views = append(views, documentdto.FromSummary(summary))
	}
	return views, nil
}
