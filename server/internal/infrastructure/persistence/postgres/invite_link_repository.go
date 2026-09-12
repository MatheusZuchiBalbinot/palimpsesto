package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"palimpsesto/internal/domain/document"
)

// Upsert creates or rotates docID's invite link, per document.InviteLinkRepository.
func (r *DocumentRepository) Upsert(ctx context.Context, docID document.ID, role document.Role) (document.InviteLink, error) {
	token, err := document.NewInviteToken()
	if err != nil {
		return document.InviteLink{}, err
	}

	var link document.InviteLink
	err = r.pool.pool.QueryRow(ctx,
		`INSERT INTO document_invite_links (document_id, token, role)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (document_id) DO UPDATE SET token = $2, role = $3
		 RETURNING document_id, token, role, created_at`,
		docID, token, role,
	).Scan(&link.DocumentID, &link.Token, &link.Role, &link.CreatedAt)
	if err != nil {
		return document.InviteLink{}, fmt.Errorf("postgres: upserting invite link: %w", err)
	}
	return link, nil
}

// FindLink returns docID's current invite link, per
// document.InviteLinkRepository.
func (r *DocumentRepository) FindLink(ctx context.Context, docID document.ID) (document.InviteLink, error) {
	var link document.InviteLink
	err := r.pool.pool.QueryRow(ctx,
		`SELECT document_id, token, role, created_at FROM document_invite_links WHERE document_id = $1`,
		docID,
	).Scan(&link.DocumentID, &link.Token, &link.Role, &link.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return document.InviteLink{}, document.ErrInviteLinkNotFound
	}
	if err != nil {
		return document.InviteLink{}, fmt.Errorf("postgres: finding invite link: %w", err)
	}
	return link, nil
}

// FindByToken resolves a presented token to its invite link, per
// document.InviteLinkRepository.
func (r *DocumentRepository) FindByToken(ctx context.Context, token document.InviteToken) (document.InviteLink, error) {
	var link document.InviteLink
	err := r.pool.pool.QueryRow(ctx,
		`SELECT document_id, token, role, created_at FROM document_invite_links WHERE token = $1`,
		token,
	).Scan(&link.DocumentID, &link.Token, &link.Role, &link.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return document.InviteLink{}, document.ErrInviteLinkNotFound
	}
	if err != nil {
		return document.InviteLink{}, fmt.Errorf("postgres: finding invite link by token: %w", err)
	}
	return link, nil
}

// Revoke removes docID's invite link, per document.InviteLinkRepository.
func (r *DocumentRepository) Revoke(ctx context.Context, docID document.ID) error {
	_, err := r.pool.pool.Exec(ctx, `DELETE FROM document_invite_links WHERE document_id = $1`, docID)
	if err != nil {
		return fmt.Errorf("postgres: revoking invite link: %w", err)
	}
	return nil
}
