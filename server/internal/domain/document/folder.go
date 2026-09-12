package document

import (
	"context"
	"time"

	"palimpsesto/internal/domain/user"
)

// FolderID identifies a folder.
type FolderID string

// Folder groups a subset of its owner's own documents — personal
// organization, not a shared object and never nested.
type Folder struct {
	ID        FolderID
	OwnerID   user.ID
	Name      string
	Color     string
	CreatedAt time.Time
}

// NewFolderInput is what creating a folder persists.
type NewFolderInput struct {
	OwnerID user.ID
	Name    string
	Color   string
}

// UpdateFolderInput is what renaming/recoloring a folder persists.
type UpdateFolderInput struct {
	ID      FolderID
	OwnerID user.ID
	Name    string
	Color   string
}

// FolderRepository is the persistence contract for folders. Named
// Create/List/Delete*Folder — not the shorter Create/ListForOwner/Delete —
// since the same Postgres struct that implements this also implements
// Repository's document-scoped Create/Delete, and Go methods can't be
// overloaded by signature.
type FolderRepository interface {
	// CreateFolder makes a new folder.
	CreateFolder(ctx context.Context, in NewFolderInput) (Folder, error)

	// ListFoldersForOwner returns every folder ownerID has, newest first.
	ListFoldersForOwner(ctx context.Context, ownerID user.ID) ([]Folder, error)

	// UpdateFolder renames/recolors a folder. Returns ErrFolderNotFound if
	// id doesn't belong to ownerID (or doesn't exist at all — never
	// distinguished).
	UpdateFolder(ctx context.Context, in UpdateFolderInput) (Folder, error)

	// DeleteFolder removes a folder. Returns ErrFolderNotFound if id
	// doesn't belong to ownerID (or doesn't exist at all — never
	// distinguished). Documents in the folder are not deleted; see the
	// migration's ON DELETE SET NULL on documents.folder_id.
	DeleteFolder(ctx context.Context, id FolderID, ownerID user.ID) error
}
