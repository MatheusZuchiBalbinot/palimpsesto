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

// DocumentRepository implements document.Repository,
// document.MembershipRepository, document.UpdateRepository,
// document.InviteLinkRepository, and document.CommentRepository over
// Postgres — a single struct satisfying five narrow domain interfaces,
// since every method already shares the same pool and no caller needs
// less than the full Postgres surface.
type DocumentRepository struct {
	pool *Pool
}

func NewDocumentRepository(pool *Pool) *DocumentRepository {
	return &DocumentRepository{pool: pool}
}

// toFolderID converts a nullable folder_id column scan into
// document.Document's *document.FolderID field.
func toFolderID(id *string) *document.FolderID {
	if id == nil {
		return nil
	}
	fid := document.FolderID(*id)
	return &fid
}

// Create inserts a new document and adds its owner as the first member,
// atomically.
func (r *DocumentRepository) Create(ctx context.Context, ownerID user.ID, title string) (document.Document, error) {
	tx, err := r.pool.pool.Begin(ctx)
	if err != nil {
		return document.Document{}, fmt.Errorf("postgres: beginning transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		id, scannedOwnerID, scannedTitle string
		currentKeyEpoch                  int
	)
	err = tx.QueryRow(ctx,
		`INSERT INTO documents (owner_id, title_ciphertext) VALUES ($1, $2)
		 RETURNING id, owner_id, title_ciphertext, current_key_epoch`,
		ownerID, title,
	).Scan(&id, &scannedOwnerID, &scannedTitle, &currentKeyEpoch)
	if err != nil {
		return document.Document{}, fmt.Errorf("postgres: creating document: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO doc_members (doc_id, user_id, role) VALUES ($1, $2, 'owner')`,
		id, ownerID,
	)
	if err != nil {
		return document.Document{}, fmt.Errorf("postgres: adding owner as member: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return document.Document{}, fmt.Errorf("postgres: committing document creation: %w", err)
	}

	return document.Document{ID: document.ID(id), OwnerID: user.ID(scannedOwnerID), Title: scannedTitle, CurrentKeyEpoch: currentKeyEpoch}, nil
}

// Find fetches a document by ID. Returns document.ErrNotFound if there's
// no match — callers check membership separately (IsMember), so a
// document that exists but the caller can't see still comes back as
// ErrNotFound to the outside world, never distinguished from "doesn't
// exist". A soft-deleted document (deleted_at set) is treated the same
// as nonexistent — see FindIncludingDeleted for the one caller
// (Restore) that needs to see it anyway.
func (r *DocumentRepository) Find(ctx context.Context, docID document.ID) (document.Document, error) {
	var (
		id, ownerID, title string
		currentKeyEpoch    int
		folderID           *string
	)
	err := r.pool.pool.QueryRow(ctx,
		`SELECT id, owner_id, title_ciphertext, current_key_epoch, folder_id FROM documents WHERE id = $1 AND deleted_at IS NULL`,
		docID,
	).Scan(&id, &ownerID, &title, &currentKeyEpoch, &folderID)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return document.Document{}, document.ErrNotFound
	}
	if err != nil {
		return document.Document{}, fmt.Errorf("postgres: finding document: %w", err)
	}
	return document.Document{ID: document.ID(id), OwnerID: user.ID(ownerID), Title: title, CurrentKeyEpoch: currentKeyEpoch, FolderID: toFolderID(folderID)}, nil
}

// FindIncludingDeleted is Find without the deleted_at filter — only the
// restore command should call this; every other caller wants a
// soft-deleted document to look exactly like it doesn't exist.
func (r *DocumentRepository) FindIncludingDeleted(ctx context.Context, docID document.ID) (document.Document, error) {
	var (
		id, ownerID, title string
		currentKeyEpoch    int
		folderID           *string
	)
	err := r.pool.pool.QueryRow(ctx,
		`SELECT id, owner_id, title_ciphertext, current_key_epoch, folder_id FROM documents WHERE id = $1`,
		docID,
	).Scan(&id, &ownerID, &title, &currentKeyEpoch, &folderID)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return document.Document{}, document.ErrNotFound
	}
	if err != nil {
		return document.Document{}, fmt.Errorf("postgres: finding document (including deleted): %w", err)
	}
	return document.Document{ID: document.ID(id), OwnerID: user.ID(ownerID), Title: title, CurrentKeyEpoch: currentKeyEpoch, FolderID: toFolderID(folderID)}, nil
}

// ListForUser returns every document the user is a member of, with
// activity summaries (update count, last editor) computed from
// doc_updates.
func (r *DocumentRepository) ListForUser(ctx context.Context, userID user.ID) ([]document.Summary, error) {
	rows, err := r.pool.pool.Query(ctx,
		`SELECT d.id, d.owner_id, d.title_ciphertext, d.folder_id,
		        COALESCE(agg.update_count, 0), agg.last_edited_at,
		        COALESCE(last_editor.display_name, '')
		 FROM documents d
		 JOIN doc_members m ON m.doc_id = d.id
		 LEFT JOIN (
		     SELECT doc_id, COUNT(*) AS update_count, MAX(created_at) AS last_edited_at
		     FROM doc_updates
		     GROUP BY doc_id
		 ) agg ON agg.doc_id = d.id
		 LEFT JOIN doc_updates last_u ON last_u.id = (
		     SELECT id FROM doc_updates WHERE doc_id = d.id ORDER BY id DESC LIMIT 1
		 )
		 LEFT JOIN users last_editor ON last_editor.id = last_u.author_id
		 WHERE m.user_id = $1 AND d.deleted_at IS NULL
		 ORDER BY d.created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres: listing documents: %w", err)
	}
	defer rows.Close()

	var summaries []document.Summary
	for rows.Next() {
		var (
			id, ownerID, title, lastEditorName string
			folderID                           *string
			updateCount                        int
			lastEditedAt                       *time.Time
		)
		if err := rows.Scan(&id, &ownerID, &title, &folderID, &updateCount, &lastEditedAt, &lastEditorName); err != nil {
			return nil, fmt.Errorf("postgres: scanning document row: %w", err)
		}
		summaries = append(summaries, document.Summary{
			Document:       document.Document{ID: document.ID(id), OwnerID: user.ID(ownerID), Title: title, FolderID: toFolderID(folderID)},
			UpdateCount:    updateCount,
			LastEditedAt:   lastEditedAt,
			LastEditorName: lastEditorName,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterating documents: %w", err)
	}
	return summaries, nil
}

// ListDeletedForOwner returns every document ownerID owns and has
// deleted, newest-deleted first.
func (r *DocumentRepository) ListDeletedForOwner(ctx context.Context, ownerID user.ID) ([]document.Summary, error) {
	rows, err := r.pool.pool.Query(ctx,
		`SELECT d.id, d.owner_id, d.title_ciphertext, d.folder_id,
		        COALESCE(agg.update_count, 0), agg.last_edited_at,
		        COALESCE(last_editor.display_name, '')
		 FROM documents d
		 LEFT JOIN (
		     SELECT doc_id, COUNT(*) AS update_count, MAX(created_at) AS last_edited_at
		     FROM doc_updates
		     GROUP BY doc_id
		 ) agg ON agg.doc_id = d.id
		 LEFT JOIN doc_updates last_u ON last_u.id = (
		     SELECT id FROM doc_updates WHERE doc_id = d.id ORDER BY id DESC LIMIT 1
		 )
		 LEFT JOIN users last_editor ON last_editor.id = last_u.author_id
		 WHERE d.owner_id = $1 AND d.deleted_at IS NOT NULL
		 ORDER BY d.deleted_at DESC`,
		ownerID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres: listing deleted documents: %w", err)
	}
	defer rows.Close()

	var summaries []document.Summary
	for rows.Next() {
		var (
			id, ownerIDCol, title, lastEditorName string
			folderID                              *string
			updateCount                           int
			lastEditedAt                          *time.Time
		)
		if err := rows.Scan(&id, &ownerIDCol, &title, &folderID, &updateCount, &lastEditedAt, &lastEditorName); err != nil {
			return nil, fmt.Errorf("postgres: scanning deleted document row: %w", err)
		}
		summaries = append(summaries, document.Summary{
			Document:       document.Document{ID: document.ID(id), OwnerID: user.ID(ownerIDCol), Title: title, FolderID: toFolderID(folderID)},
			UpdateCount:    updateCount,
			LastEditedAt:   lastEditedAt,
			LastEditorName: lastEditorName,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterating deleted documents: %w", err)
	}
	return summaries, nil
}

// UpdateTitle renames a document.
func (r *DocumentRepository) UpdateTitle(ctx context.Context, docID document.ID, title string) error {
	_, err := r.pool.pool.Exec(ctx,
		`UPDATE documents SET title_ciphertext = $1 WHERE id = $2`,
		title, docID,
	)
	if err != nil {
		return fmt.Errorf("postgres: updating document title: %w", err)
	}
	return nil
}

// SetFolder files docID under folderID, or clears it if folderID is nil.
// Returns document.ErrNotFound if docID doesn't exist.
func (r *DocumentRepository) SetFolder(ctx context.Context, docID document.ID, folderID *document.FolderID) error {
	tag, err := r.pool.pool.Exec(ctx,
		`UPDATE documents SET folder_id = $1 WHERE id = $2`,
		folderID, docID,
	)
	if isInvalidTextRepresentation(err) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("postgres: setting document folder: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return document.ErrNotFound
	}
	return nil
}

// Delete soft-deletes a document — sets deleted_at instead of removing
// the row (or cascading to its members/updates), so Restore can undo
// it.
func (r *DocumentRepository) Delete(ctx context.Context, docID document.ID) error {
	_, err := r.pool.pool.Exec(ctx,
		`UPDATE documents SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
		docID,
	)
	if err != nil {
		return fmt.Errorf("postgres: deleting document: %w", err)
	}
	return nil
}

// Restore clears deleted_at, undoing an earlier Delete. Returns
// document.ErrNotFound if docID doesn't exist or isn't currently
// deleted (restoring something that was never deleted would otherwise
// be a silent no-op).
func (r *DocumentRepository) Restore(ctx context.Context, docID document.ID) error {
	tag, err := r.pool.pool.Exec(ctx,
		`UPDATE documents SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL`,
		docID,
	)
	if isInvalidTextRepresentation(err) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("postgres: restoring document: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return document.ErrNotFound
	}
	return nil
}

// IsMember reports whether userID belongs to docID. The check every
// read and write of a document has to pass first — done with a join
// against documents so a soft-deleted document (deleted_at set) returns
// false for everyone, as if the membership row didn't exist.
func (r *DocumentRepository) IsMember(ctx context.Context, docID document.ID, userID user.ID) (bool, error) {
	var isMember bool
	err := r.pool.pool.QueryRow(ctx,
		`SELECT EXISTS (
		     SELECT 1 FROM doc_members m
		     JOIN documents d ON d.id = m.doc_id
		     WHERE m.doc_id = $1 AND m.user_id = $2 AND d.deleted_at IS NULL
		 )`,
		docID, userID,
	).Scan(&isMember)
	if isInvalidTextRepresentation(err) {
		// A malformed docID can't possibly match a row — same as "not a
		// member", not a repository error. Letting this fall through as
		// an error would surface a raw driver error as a 500 for what's
		// really just "not found" one layer up (authz.RequireMembership).
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("postgres: checking membership: %w", err)
	}
	return isMember, nil
}

// MemberRole returns the caller's role on a document. Returns
// document.ErrNotFound if they're not a member, or if the document is
// soft-deleted — see IsMember's comment for why.
func (r *DocumentRepository) MemberRole(ctx context.Context, docID document.ID, userID user.ID) (document.Role, error) {
	var role string
	err := r.pool.pool.QueryRow(ctx,
		`SELECT m.role FROM doc_members m
		 JOIN documents d ON d.id = m.doc_id
		 WHERE m.doc_id = $1 AND m.user_id = $2 AND d.deleted_at IS NULL`,
		docID, userID,
	).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return "", document.ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("postgres: finding member role: %w", err)
	}
	return document.Role(role), nil
}

// ListMembers returns all of a document's members.
func (r *DocumentRepository) ListMembers(ctx context.Context, docID document.ID) ([]document.Member, error) {
	rows, err := r.pool.pool.Query(ctx,
		`SELECT m.user_id, u.email, u.display_name, m.role, m.wrapped_dek IS NOT NULL
		 FROM doc_members m
		 JOIN users u ON u.id = m.user_id
		 WHERE m.doc_id = $1
		 ORDER BY m.added_at`,
		docID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres: listing members: %w", err)
	}
	defer rows.Close()

	var members []document.Member
	for rows.Next() {
		var (
			userID, email, displayName, role string
			hasWrappedDEK                    bool
		)
		if err := rows.Scan(&userID, &email, &displayName, &role, &hasWrappedDEK); err != nil {
			return nil, fmt.Errorf("postgres: scanning member row: %w", err)
		}
		members = append(members, document.Member{
			UserID:        user.ID(userID),
			Email:         email,
			DisplayName:   displayName,
			Role:          document.Role(role),
			HasWrappedDEK: hasWrappedDEK,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterating members: %w", err)
	}
	return members, nil
}

// AddMember adds userID to a document with the given role. Returns
// document.ErrAlreadyAdded if they're already a member.
func (r *DocumentRepository) AddMember(ctx context.Context, in document.NewMemberInput) error {
	// key_epoch must match the epoch the caller's client actually used
	// to seal the WrappedDEK — always the document's *current* epoch.
	// Trusting the column's default value (1) would silently mislabel
	// every invite sent after the first rotation, and the new member's
	// client would go on to use the wrong epoch number in every AAD it
	// computes from then on.
	tag, err := r.pool.pool.Exec(ctx,
		`INSERT INTO doc_members (doc_id, user_id, role, wrapped_dek, key_epoch)
		 SELECT $1, $2, $3, $4, current_key_epoch FROM documents WHERE id = $1 AND deleted_at IS NULL`,
		in.DocumentID, in.UserID, in.Role, in.WrappedDEK,
	)
	if isUniqueViolation(err) {
		return document.ErrAlreadyAdded
	}
	if isInvalidTextRepresentation(err) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("postgres: adding member: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return document.ErrNotFound
	}
	return nil
}

// SetMemberWrappedDEK sets or replaces userID's wrapped_dek on docID.
// Returns document.ErrNotFound if userID isn't a member of docID.
func (r *DocumentRepository) SetMemberWrappedDEK(ctx context.Context, docID document.ID, userID user.ID, wrappedDEK []byte) error {
	tag, err := r.pool.pool.Exec(ctx,
		`UPDATE doc_members SET wrapped_dek = $3 WHERE doc_id = $1 AND user_id = $2`,
		docID, userID, wrappedDEK,
	)
	if isInvalidTextRepresentation(err) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("postgres: setting member wrapped DEK: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return document.ErrNotFound
	}
	return nil
}

// FindMemberWrappedDEK returns userID's wrapped_dek and key_epoch on
// docID. Returns document.ErrNotFound if userID isn't a member, or
// document.ErrPendingWrappedDEK if they're a member but nobody's
// sealed the DEK for them yet.
func (r *DocumentRepository) FindMemberWrappedDEK(ctx context.Context, docID document.ID, userID user.ID) ([]byte, int, error) {
	var (
		wrappedDEK []byte
		keyEpoch   int
	)
	err := r.pool.pool.QueryRow(ctx,
		`SELECT wrapped_dek, key_epoch FROM doc_members WHERE doc_id = $1 AND user_id = $2`,
		docID, userID,
	).Scan(&wrappedDEK, &keyEpoch)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return nil, 0, document.ErrNotFound
	}
	if err != nil {
		return nil, 0, fmt.Errorf("postgres: finding member wrapped DEK: %w", err)
	}
	if wrappedDEK == nil {
		return nil, 0, document.ErrPendingWrappedDEK
	}
	return wrappedDEK, keyEpoch, nil
}

// ListMemberKeyHistory returns every epoch older than userID's current
// one for which their DEK was once sealed and then replaced by a
// rotation.
func (r *DocumentRepository) ListMemberKeyHistory(ctx context.Context, docID document.ID, userID user.ID) ([]document.EpochKey, error) {
	rows, err := r.pool.pool.Query(ctx,
		`SELECT key_epoch, wrapped_dek FROM doc_member_key_history WHERE doc_id = $1 AND user_id = $2 ORDER BY key_epoch`,
		docID, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres: listing member key history: %w", err)
	}
	defer rows.Close()

	var history []document.EpochKey
	for rows.Next() {
		var key document.EpochKey
		if err := rows.Scan(&key.KeyEpoch, &key.WrappedDEK); err != nil {
			return nil, fmt.Errorf("postgres: scanning member key history row: %w", err)
		}
		history = append(history, key)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterating member key history: %w", err)
	}
	return history, nil
}

// RemoveMemberAndRotate removes targetUser from docID and rotates the
// document's key epoch in a single transaction ("real revocation
// requires rotation"). newWraps must cover exactly the members
// remaining after targetUser leaves, or this returns
// document.ErrIncompleteRotation without changing anything. Each
// remaining member's previous wrapped_dek (if they had one — a still-pending
// member has nothing to archive) is preserved in
// doc_member_key_history before being replaced.
func (r *DocumentRepository) RemoveMemberAndRotate(ctx context.Context, docID document.ID, targetUser user.ID, newWraps map[user.ID][]byte) (int, error) {
	tx, err := r.pool.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("postgres: beginning rotation transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var currentEpoch int
	err = tx.QueryRow(ctx, `SELECT current_key_epoch FROM documents WHERE id = $1 FOR UPDATE`, docID).Scan(&currentEpoch)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return 0, document.ErrNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("postgres: locking document for rotation: %w", err)
	}

	rows, err := tx.Query(ctx, `SELECT user_id, wrapped_dek FROM doc_members WHERE doc_id = $1 FOR UPDATE`, docID)
	if err != nil {
		return 0, fmt.Errorf("postgres: locking members for rotation: %w", err)
	}
	type existingMember struct {
		userID     user.ID
		wrappedDEK []byte
	}
	var existing []existingMember
	for rows.Next() {
		var uid string
		var wrapped []byte
		if err := rows.Scan(&uid, &wrapped); err != nil {
			rows.Close()
			return 0, fmt.Errorf("postgres: scanning member for rotation: %w", err)
		}
		existing = append(existing, existingMember{userID: user.ID(uid), wrappedDEK: wrapped})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, fmt.Errorf("postgres: iterating members for rotation: %w", err)
	}
	rows.Close()

	foundTarget := false
	remaining := make(map[user.ID][]byte, len(existing))
	for _, m := range existing {
		if m.userID == targetUser {
			foundTarget = true
			continue
		}
		remaining[m.userID] = m.wrappedDEK
	}
	if !foundTarget {
		return 0, document.ErrNotFound
	}
	if len(remaining) != len(newWraps) {
		return 0, document.ErrIncompleteRotation
	}
	for uid := range remaining {
		if _, ok := newWraps[uid]; !ok {
			return 0, document.ErrIncompleteRotation
		}
	}

	newEpoch := currentEpoch + 1

	for uid, oldWrapped := range remaining {
		if oldWrapped != nil {
			_, err := tx.Exec(ctx,
				`INSERT INTO doc_member_key_history (doc_id, user_id, key_epoch, wrapped_dek) VALUES ($1, $2, $3, $4)`,
				docID, uid, currentEpoch, oldWrapped,
			)
			if err != nil {
				return 0, fmt.Errorf("postgres: archiving member key history: %w", err)
			}
		}
		_, err := tx.Exec(ctx,
			`UPDATE doc_members SET wrapped_dek = $3, key_epoch = $4 WHERE doc_id = $1 AND user_id = $2`,
			docID, uid, newWraps[uid], newEpoch,
		)
		if err != nil {
			return 0, fmt.Errorf("postgres: rewrapping member: %w", err)
		}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM doc_members WHERE doc_id = $1 AND user_id = $2`, docID, targetUser); err != nil {
		return 0, fmt.Errorf("postgres: removing member: %w", err)
	}

	if _, err := tx.Exec(ctx, `UPDATE documents SET current_key_epoch = $2 WHERE id = $1`, docID, newEpoch); err != nil {
		return 0, fmt.Errorf("postgres: advancing document epoch: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("postgres: committing rotation: %w", err)
	}
	return newEpoch, nil
}

// UpdateMemberRole changes userID's role on docID. Returns
// document.ErrNotFound if userID isn't a member of docID.
func (r *DocumentRepository) UpdateMemberRole(ctx context.Context, docID document.ID, userID user.ID, role document.Role) error {
	tag, err := r.pool.pool.Exec(ctx,
		`UPDATE doc_members SET role = $3 WHERE doc_id = $1 AND user_id = $2`,
		docID, userID, role,
	)
	if isInvalidTextRepresentation(err) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("postgres: updating member role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return document.ErrNotFound
	}
	return nil
}

// LeaveDocument removes userID's membership on docID and any of their
// archived key history — no rotation, unlike RemoveMemberAndRotate.
// Returns document.ErrNotFound if userID isn't a member of docID.
func (r *DocumentRepository) LeaveDocument(ctx context.Context, docID document.ID, userID user.ID) error {
	tx, err := r.pool.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("postgres: beginning leave transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `DELETE FROM doc_members WHERE doc_id = $1 AND user_id = $2`, docID, userID)
	if isInvalidTextRepresentation(err) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("postgres: leaving document: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return document.ErrNotFound
	}

	if _, err := tx.Exec(ctx, `DELETE FROM doc_member_key_history WHERE doc_id = $1 AND user_id = $2`, docID, userID); err != nil {
		return fmt.Errorf("postgres: clearing key history on leave: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("postgres: committing leave: %w", err)
	}
	return nil
}

// FindMemberCandidateByEmail resolves an invite email to a user ID.
// Returns document.ErrUserNotFound if no account matches.
func (r *DocumentRepository) FindMemberCandidateByEmail(ctx context.Context, email string) (user.ID, error) {
	var id string
	err := r.pool.pool.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", document.ErrUserNotFound
	}
	if err != nil {
		return "", fmt.Errorf("postgres: finding invitee: %w", err)
	}
	return user.ID(id), nil
}
