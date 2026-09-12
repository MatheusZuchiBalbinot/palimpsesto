package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// Folder methods on DocumentRepository, implementing
// document.FolderRepository — same struct as the rest of the document
// domain's Postgres persistence (see the doc comment on DocumentRepository
// in document_repository.go), since folders share the same pool and no
// caller needs less than the full surface.

// CreateFolder inserts a new folder.
func (r *DocumentRepository) CreateFolder(ctx context.Context, in document.NewFolderInput) (document.Folder, error) {
	var (
		id        string
		createdAt time.Time
	)
	err := r.pool.pool.QueryRow(ctx,
		`INSERT INTO folders (owner_id, name, color) VALUES ($1, $2, $3) RETURNING id, created_at`,
		in.OwnerID, in.Name, in.Color,
	).Scan(&id, &createdAt)
	if err != nil {
		return document.Folder{}, fmt.Errorf("postgres: creating folder: %w", err)
	}
	return document.Folder{
		ID:        document.FolderID(id),
		OwnerID:   in.OwnerID,
		Name:      in.Name,
		Color:     in.Color,
		CreatedAt: createdAt,
	}, nil
}

// ListFoldersForOwner returns every folder ownerID has, newest first.
func (r *DocumentRepository) ListFoldersForOwner(ctx context.Context, ownerID user.ID) ([]document.Folder, error) {
	rows, err := r.pool.pool.Query(ctx,
		`SELECT id, name, color, created_at FROM folders WHERE owner_id = $1 ORDER BY created_at DESC`,
		ownerID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres: listing folders: %w", err)
	}
	defer rows.Close()

	var folders []document.Folder
	for rows.Next() {
		var (
			id, name, color string
			createdAt       time.Time
		)
		if err := rows.Scan(&id, &name, &color, &createdAt); err != nil {
			return nil, fmt.Errorf("postgres: scanning folder row: %w", err)
		}
		folders = append(folders, document.Folder{ID: document.FolderID(id), OwnerID: ownerID, Name: name, Color: color, CreatedAt: createdAt})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterating folders: %w", err)
	}
	return folders, nil
}

// UpdateFolder renames/recolors a folder owned by ownerID. Returns
// document.ErrFolderNotFound if id doesn't belong to ownerID.
func (r *DocumentRepository) UpdateFolder(ctx context.Context, in document.UpdateFolderInput) (document.Folder, error) {
	var createdAt time.Time
	err := r.pool.pool.QueryRow(ctx,
		`UPDATE folders SET name = $1, color = $2 WHERE id = $3 AND owner_id = $4 RETURNING created_at`,
		in.Name, in.Color, in.ID, in.OwnerID,
	).Scan(&createdAt)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return document.Folder{}, document.ErrFolderNotFound
	}
	if err != nil {
		return document.Folder{}, fmt.Errorf("postgres: updating folder: %w", err)
	}
	return document.Folder{ID: in.ID, OwnerID: in.OwnerID, Name: in.Name, Color: in.Color, CreatedAt: createdAt}, nil
}

// DeleteFolder removes a folder owned by ownerID. Returns
// document.ErrFolderNotFound if id doesn't belong to ownerID.
func (r *DocumentRepository) DeleteFolder(ctx context.Context, id document.FolderID, ownerID user.ID) error {
	tag, err := r.pool.pool.Exec(ctx, `DELETE FROM folders WHERE id = $1 AND owner_id = $2`, id, ownerID)
	if isInvalidTextRepresentation(err) {
		return document.ErrFolderNotFound
	}
	if err != nil {
		return fmt.Errorf("postgres: deleting folder: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return document.ErrFolderNotFound
	}
	return nil
}
