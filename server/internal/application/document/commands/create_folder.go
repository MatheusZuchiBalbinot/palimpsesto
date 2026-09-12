package documentcommands

import (
	"context"
	"fmt"
	"strings"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/dto"
)

// CreateFolderInput is what creating a folder requires.
type CreateFolderInput struct {
	OwnerID user.ID
	Name    string
	Color   string
}

// CreateFolderHandler creates a new folder for its caller.
type CreateFolderHandler struct {
	folders document.FolderRepository
}

func NewCreateFolderHandler(folders document.FolderRepository) *CreateFolderHandler {
	return &CreateFolderHandler{folders: folders}
}

const maxFolderNameLength = 60

func (h *CreateFolderHandler) Handle(ctx context.Context, in CreateFolderInput) (documentdto.FolderView, error) {
	trimmedName := strings.TrimSpace(in.Name)
	if trimmedName == "" || len(trimmedName) > maxFolderNameLength {
		return documentdto.FolderView{}, document.ErrInvalidFolderName
	}

	folderInput := document.NewFolderInput{OwnerID: in.OwnerID, Name: trimmedName, Color: in.Color}
	created, err := h.folders.CreateFolder(ctx, folderInput)
	if err != nil {
		return documentdto.FolderView{}, fmt.Errorf("document: creating folder: %w", err)
	}
	return documentdto.FromFolder(created), nil
}
