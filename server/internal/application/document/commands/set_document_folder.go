package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// SetDocumentFolderInput is what filing (or un-filing) a document under a
// folder requires. FolderID nil clears the document's folder.
type SetDocumentFolderInput struct {
	DocumentID document.ID
	Caller     user.ID
	FolderID   *document.FolderID
}

// SetDocumentFolderHandler files a document under one of the owner's own
// folders — only the document's owner can do this, since a folder is
// their own personal organization, not a shared property of the document.
type SetDocumentFolderHandler struct {
	documents  document.Repository
	membership document.MembershipRepository
}

func NewSetDocumentFolderHandler(documents document.Repository, membership document.MembershipRepository) *SetDocumentFolderHandler {
	return &SetDocumentFolderHandler{documents: documents, membership: membership}
}

func (h *SetDocumentFolderHandler) Handle(ctx context.Context, in SetDocumentFolderInput) error {
	role, err := h.membership.MemberRole(ctx, in.DocumentID, in.Caller)
	if errors.Is(err, document.ErrNotFound) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("document: checking role: %w", err)
	}
	if !role.IsOwner() {
		return document.ErrNotOwner
	}

	if err := h.documents.SetFolder(ctx, in.DocumentID, in.FolderID); err != nil {
		return fmt.Errorf("document: setting document folder: %w", err)
	}
	return nil
}
