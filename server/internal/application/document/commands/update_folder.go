package documentcommands

import (
	"context"
	"fmt"
	"strings"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/dto"
)

// UpdateFolderInput is what renaming/recoloring a folder requires.
type UpdateFolderInput struct {
	ID      document.FolderID
	OwnerID user.ID
	Name    string
	Color   string
}

// UpdateFolderHandler renames/recolors one of the caller's own folders.
type UpdateFolderHandler struct {
	folders document.FolderRepository
}

func NewUpdateFolderHandler(folders document.FolderRepository) *UpdateFolderHandler {
	return &UpdateFolderHandler{folders: folders}
}

func (h *UpdateFolderHandler) Handle(ctx context.Context, in UpdateFolderInput) (documentdto.FolderView, error) {
	trimmedName := strings.TrimSpace(in.Name)
	if trimmedName == "" || len(trimmedName) > maxFolderNameLength {
		return documentdto.FolderView{}, document.ErrInvalidFolderName
	}

	updateInput := document.UpdateFolderInput{ID: in.ID, OwnerID: in.OwnerID, Name: trimmedName, Color: in.Color}
	updated, err := h.folders.UpdateFolder(ctx, updateInput)
	if err != nil {
		return documentdto.FolderView{}, fmt.Errorf("document: updating folder: %w", err)
	}
	return documentdto.FromFolder(updated), nil
}
