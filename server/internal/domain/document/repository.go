package document

import (
	"context"

	"palimpsesto/internal/domain/user"
)

// NewMemberInput is what adding a member to a document persists.
// WrappedDEK is nil for a self-service join via invite link (no client of
// whoever shared it is present to do the ECDH wrap synchronously — see
// Member.HasWrappedDEK) and is set for an email invite (the inviting
// member's client wraps it before calling this).
type NewMemberInput struct {
	DocumentID ID
	UserID     user.ID
	Role       Role
	WrappedDEK []byte
}

// NewUpdateInput is a CRDT update about to be persisted.
type NewUpdateInput struct {
	DocumentID ID
	AuthorID   user.ID
	Payload    []byte
}

// Repository is the persistence contract for a document's metadata. The
// infrastructure implements this; the domains and application layer depend
// only on the interface. See MembershipRepository and UpdateRepository for
// the member and CRDT update-log contracts — kept separate so a handler
// that touches only one of the three never needs to depend on (or mock, in
// tests) the other two.
type Repository interface {
	// Create inserts a new document, with its creator as the owner member.
	Create(ctx context.Context, ownerID user.ID, title string) (Document, error)

	// ListForUser returns every document userID is a member of, with
	// activity summaries for the vault's list view.
	ListForUser(ctx context.Context, userID user.ID) ([]Summary, error)

	// ListDeletedForOwner returns every document ownerID owns and has
	// deleted (deleted_at set), newest-deleted first — the vault's
	// "Arquivados" view. Scoped to the owner rather than every member: only
	// the owner can delete a document (see the delete command), so nobody
	// else has a deleted copy of it to restore.
	ListDeletedForOwner(ctx context.Context, ownerID user.ID) ([]Summary, error)

	// Find looks up a document by ID. Returns ErrNotFound if there's no
	// match.
	Find(ctx context.Context, docID ID) (Document, error)

	// UpdateTitle renames a document.
	UpdateTitle(ctx context.Context, docID ID, title string) error

	// Delete soft-deletes a document: sets deleted_at instead of removing
	// the row, so Restore can undo it. From the point of view of any
	// other read/write path it simply disappears (Find, IsMember, and
	// MemberRole all exclude it) until restored.
	Delete(ctx context.Context, docID ID) error

	// Restore clears deleted_at, undoing a previous Delete. Returns
	// ErrNotFound if docID doesn't exist or isn't currently deleted.
	Restore(ctx context.Context, docID ID) error

	// FindIncludingDeleted looks up a document by ID regardless of
	// deleted_at — used only by the restore command to authorize the
	// caller (verify they're the owner) before the normal "deleted =
	// doesn't exist" Find rule would also hide it from them.
	FindIncludingDeleted(ctx context.Context, docID ID) (Document, error)

	// SetFolder files docID under folderID, or clears it (nil) — only the
	// document's owner may do this. Returns ErrNotFound if docID doesn't
	// exist.
	SetFolder(ctx context.Context, docID ID, folderID *FolderID) error
}

// MembershipRepository is the persistence contract for a document's
// members: who belongs, with what role, and how to add someone by email.
type MembershipRepository interface {
	// IsMember reports whether userID belongs to docID. The check every
	// read and write of a document needs to pass first.
	IsMember(ctx context.Context, docID ID, userID user.ID) (bool, error)

	// MemberRole returns a member's role on a document. Returns
	// ErrNotFound if they aren't a member.
	MemberRole(ctx context.Context, docID ID, userID user.ID) (Role, error)

	// ListMembers returns all members of a document.
	ListMembers(ctx context.Context, docID ID) ([]Member, error)

	// AddMember adds a user to a document. Returns ErrAlreadyAdded if
	// they're already a member, ErrUserNotFound if the invited email
	// doesn't match any account.
	AddMember(ctx context.Context, in NewMemberInput) error

	// FindMemberCandidateByEmail resolves an invite email to a user ID.
	// Returns ErrUserNotFound if no account matches.
	FindMemberCandidateByEmail(ctx context.Context, email string) (user.ID, error)

	// SetMemberWrappedDEK sets (or replaces) userID's wrapped_dek on
	// docID — the owner filling in their own right after creating the
	// document, or any existing member completing a pending member's wrap
	// (docs/CRYPTO.md: "this must happen client-side, on the device of
	// someone who already has access"). Returns ErrNotFound if userID
	// isn't a member of docID.
	SetMemberWrappedDEK(ctx context.Context, docID ID, userID user.ID, wrappedDEK []byte) error

	// FindMemberWrappedDEK returns userID's wrapped_dek and key_epoch on
	// docID. Returns ErrPendingWrappedDEK if the member exists but no one
	// has wrapped the DEK for them yet.
	FindMemberWrappedDEK(ctx context.Context, docID ID, userID user.ID) (wrappedDEK []byte, keyEpoch int, err error)

	// ListMemberKeyHistory returns every epoch older than userID's
	// current one for which their DEK was once wrapped and then rotated
	// away from — what their client needs, together with
	// FindMemberWrappedDEK's current-epoch result, to decrypt the full
	// update history of a document they have legitimate access to.
	ListMemberKeyHistory(ctx context.Context, docID ID, userID user.ID) ([]EpochKey, error)

	// RemoveMemberAndRotate is how the owner removes a member
	// (docs/CRYPTO.md: "real revocation requires rotation"). Atomically:
	// archives each remaining member's current wrapped_dek into key
	// history, applies newWraps (freshly sealed for the same identities
	// at the new epoch) to each of them, removes targetUser's membership,
	// and advances the document to the new epoch. newWraps' keys must be
	// exactly the set of members remaining after targetUser's removal —
	// otherwise ErrIncompleteRotation. Returns the new epoch number.
	RemoveMemberAndRotate(ctx context.Context, docID ID, targetUser user.ID, newWraps map[user.ID][]byte) (newEpoch int, err error)

	// UpdateMemberRole changes a member's role in place — no key material
	// changes, since a role is pure authorization, enforced server-side on
	// every write, never something the DEK's encryption depends on.
	// Returns ErrNotFound if userID isn't a member of docID.
	UpdateMemberRole(ctx context.Context, docID ID, userID user.ID, role Role) error

	// LeaveDocument is a member voluntarily removing themselves — unlike
	// RemoveMemberAndRotate, this never rotates the document's key: a
	// member who leaves by choice already had the DEK and choosing to
	// leave doesn't retroactively need to un-know it (that's what
	// RemoveMemberAndRotate is for). Deletes the membership row and any
	// archived key history for that user on this document. Returns
	// ErrNotFound if userID isn't a member of docID.
	LeaveDocument(ctx context.Context, docID ID, userID user.ID) error
}

// UpdateRepository is the persistence contract for a document's CRDT
// update log.
type UpdateRepository interface {
	// AppendUpdate persists a CRDT update and returns the ID assigned to it.
	AppendUpdate(ctx context.Context, in NewUpdateInput) (uint64, error)

	// ListUpdatesSince returns every update after sinceID, in order — what
	// a client needs to catch up on joining or reconnecting.
	ListUpdatesSince(ctx context.Context, docID ID, sinceID uint64) ([]Update, error)
}
