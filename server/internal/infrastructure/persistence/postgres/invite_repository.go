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

// Invite methods on DocumentRepository, implementing
// document.InviteRepository — same struct as the rest of the document
// domain's Postgres persistence (see the doc comment on DocumentRepository
// in document_repository.go).

// CreateInvite inserts a new pending invite. Returns
// document.ErrAlreadyInvited if inviteeID already has one pending for
// this document.
func (r *DocumentRepository) CreateInvite(ctx context.Context, in document.NewInviteInput) (document.Invite, error) {
	var (
		id        string
		createdAt time.Time
	)
	err := r.pool.pool.QueryRow(ctx,
		`INSERT INTO document_invites (document_id, inviter_id, invitee_id, role, wrapped_dek, key_epoch)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
		in.DocumentID, in.InviterID, in.InviteeID, in.Role, in.WrappedDEK, in.KeyEpoch,
	).Scan(&id, &createdAt)
	if isUniqueViolation(err) {
		return document.Invite{}, document.ErrAlreadyInvited
	}
	if err != nil {
		return document.Invite{}, fmt.Errorf("postgres: creating invite: %w", err)
	}
	return document.Invite{
		ID:         document.InviteID(id),
		DocumentID: in.DocumentID,
		InviterID:  in.InviterID,
		InviteeID:  in.InviteeID,
		Role:       in.Role,
		WrappedDEK: in.WrappedDEK,
		KeyEpoch:   in.KeyEpoch,
		CreatedAt:  createdAt,
	}, nil
}

// FindInvite looks up an invite by ID. Returns document.ErrInviteNotFound
// if it doesn't exist.
func (r *DocumentRepository) FindInvite(ctx context.Context, id document.InviteID) (document.Invite, error) {
	var (
		documentID, inviterID, inviteeID, role string
		wrappedDEK                             []byte
		keyEpoch                               int
		createdAt                              time.Time
	)
	err := r.pool.pool.QueryRow(ctx,
		`SELECT document_id, inviter_id, invitee_id, role, wrapped_dek, key_epoch, created_at
		 FROM document_invites WHERE id = $1`,
		id,
	).Scan(&documentID, &inviterID, &inviteeID, &role, &wrappedDEK, &keyEpoch, &createdAt)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return document.Invite{}, document.ErrInviteNotFound
	}
	if err != nil {
		return document.Invite{}, fmt.Errorf("postgres: finding invite: %w", err)
	}
	return document.Invite{
		ID:         id,
		DocumentID: document.ID(documentID),
		InviterID:  user.ID(inviterID),
		InviteeID:  user.ID(inviteeID),
		Role:       document.Role(role),
		WrappedDEK: wrappedDEK,
		KeyEpoch:   keyEpoch,
		CreatedAt:  createdAt,
	}, nil
}

// ListInvitesForInvitee returns every pending invite addressed to
// inviteeID, newest first, with both sides' display info joined in.
func (r *DocumentRepository) ListInvitesForInvitee(ctx context.Context, inviteeID user.ID) ([]document.InviteSummary, error) {
	return r.listInvites(ctx, "i.invitee_id = $1", inviteeID)
}

// ListInvitesForDocument returns every pending invite sent out for
// documentID, newest first, with both sides' display info joined in.
func (r *DocumentRepository) ListInvitesForDocument(ctx context.Context, documentID document.ID) ([]document.InviteSummary, error) {
	return r.listInvites(ctx, "i.document_id = $1", documentID)
}

// listInvites is the shared query behind ListInvitesForInvitee and
// ListInvitesForDocument — they differ only in which column filters the
// WHERE clause.
func (r *DocumentRepository) listInvites(ctx context.Context, whereClause string, filterValue any) ([]document.InviteSummary, error) {
	rows, err := r.pool.pool.Query(ctx,
		`SELECT i.id, i.document_id, i.inviter_id, i.invitee_id, i.role, i.wrapped_dek, i.key_epoch, i.created_at,
		        inviter.display_name, inviter.email, invitee.display_name, invitee.email
		 FROM document_invites i
		 JOIN users inviter ON inviter.id = i.inviter_id
		 JOIN users invitee ON invitee.id = i.invitee_id
		 WHERE `+whereClause+`
		 ORDER BY i.created_at DESC`,
		filterValue,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres: listing invites: %w", err)
	}
	defer rows.Close()

	var invites []document.InviteSummary
	for rows.Next() {
		var (
			id, documentID, inviterID, inviteeID, role           string
			inviterName, inviterEmail, inviteeName, inviteeEmail string
			wrappedDEK                                           []byte
			keyEpoch                                             int
			createdAt                                            time.Time
		)
		if err := rows.Scan(&id, &documentID, &inviterID, &inviteeID, &role, &wrappedDEK, &keyEpoch, &createdAt,
			&inviterName, &inviterEmail, &inviteeName, &inviteeEmail); err != nil {
			return nil, fmt.Errorf("postgres: scanning invite row: %w", err)
		}
		invites = append(invites, document.InviteSummary{
			Invite: document.Invite{
				ID:         document.InviteID(id),
				DocumentID: document.ID(documentID),
				InviterID:  user.ID(inviterID),
				InviteeID:  user.ID(inviteeID),
				Role:       document.Role(role),
				WrappedDEK: wrappedDEK,
				KeyEpoch:   keyEpoch,
				CreatedAt:  createdAt,
			},
			InviterName:  inviterName,
			InviterEmail: inviterEmail,
			InviteeName:  inviteeName,
			InviteeEmail: inviteeEmail,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterating invites: %w", err)
	}
	return invites, nil
}

// DeleteInvite removes a pending invite. Returns
// document.ErrInviteNotFound if it doesn't exist.
func (r *DocumentRepository) DeleteInvite(ctx context.Context, id document.InviteID) error {
	tag, err := r.pool.pool.Exec(ctx, `DELETE FROM document_invites WHERE id = $1`, id)
	if isInvalidTextRepresentation(err) {
		return document.ErrInviteNotFound
	}
	if err != nil {
		return fmt.Errorf("postgres: deleting invite: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return document.ErrInviteNotFound
	}
	return nil
}
