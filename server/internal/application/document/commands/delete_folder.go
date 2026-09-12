package documentcommands

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// DeleteFolderHandler deletes one of the caller's own folders. Documents
// inside it aren't deleted — see document.FolderRepository.Delete.
type DeleteFolderHandler struct {
	folders document.FolderRepository
}

func NewDeleteFolderHandler(folders document.FolderRepository) *DeleteFolderHandler {
	return &DeleteFolderHandler{folders: folders}
}

func (h *DeleteFolderHandler) Handle(ctx context.Context, id document.FolderID, ownerID user.ID) error {
	if err := h.folders.DeleteFolder(ctx, id, ownerID); err != nil {
		return fmt.Errorf("document: deleting folder: %w", err)
	}
	return nil
}
