package documentqueries

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/dto"
)

// ListFoldersHandler lists every folder the caller owns.
type ListFoldersHandler struct {
	folders document.FolderRepository
}

func NewListFoldersHandler(folders document.FolderRepository) *ListFoldersHandler {
	return &ListFoldersHandler{folders: folders}
}

func (h *ListFoldersHandler) Handle(ctx context.Context, ownerID user.ID) ([]documentdto.FolderView, error) {
	folders, err := h.folders.ListFoldersForOwner(ctx, ownerID)
	if err != nil {
		return nil, fmt.Errorf("document: listing folders: %w", err)
	}
	return documentdto.FromFolders(folders), nil
}
