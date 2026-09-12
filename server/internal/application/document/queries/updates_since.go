package documentqueries

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"

	"palimpsesto/internal/application/document/dto"
)

// UpdatesSinceHandler resolves update history for a reconnecting
// websocket client. Unlike ListUpdatesHandler, it doesn't check
// membership — callers (the websocket handler) have already
// authenticated membership once at connection time.
type UpdatesSinceHandler struct {
	updates document.UpdateRepository
}

func NewUpdatesSinceHandler(updates document.UpdateRepository) *UpdatesSinceHandler {
	return &UpdatesSinceHandler{updates: updates}
}

// Handle returns every update after sinceID, in order — what a client
// needs to catch up on joining or reconnecting.
func (h *UpdatesSinceHandler) Handle(ctx context.Context, docID document.ID, sinceID uint64) ([]documentdto.UpdateView, error) {
	updates, err := h.updates.ListUpdatesSince(ctx, docID, sinceID)
	if err != nil {
		return nil, fmt.Errorf("document: listing updates: %w", err)
	}

	views := make([]documentdto.UpdateView, 0, len(updates))
	for _, update := range updates {
		views = append(views, documentdto.FromUpdate(update))
	}
	return views, nil
}
