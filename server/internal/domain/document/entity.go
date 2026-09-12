// Package document is the document domain: the document/member/update
// entities, their value objects, and the repository contract that the
// infrastructure needs to satisfy. Never imports net/http or database
// drivers.
package document

import (
	"time"

	"palimpsesto/internal/domain/user"
)

// Document is a document's metadata, without its content (which lives in
// doc_updates, applied via Yjs).
type Document struct {
	ID      ID
	OwnerID user.ID
	Title   string
	// CurrentKeyEpoch is the DEK generation in effect now — 1 until the
	// first member removal rotates it. New updates, a new title, and new
	// member wraps always use this one; older updates stay under the
	// epoch they were encrypted with, so removing this client-side is
	// never safe on its own.
	CurrentKeyEpoch int
	// FolderID is nil when the document isn't filed under any folder —
	// personal organization, set only by the document's owner.
	FolderID *FolderID
}

// Summary is a Document plus activity information for the list views — who
// last touched it and how many updates it has, computed from doc_updates.
type Summary struct {
	Document
	UpdateCount    int
	LastEditedAt   *time.Time
	LastEditorName string
}

// Member is a document member's access.
type Member struct {
	UserID      user.ID
	Email       string
	DisplayName string
	Role        Role
	// HasWrappedDEK is false for a member who joined via invite link and
	// hasn't yet had the document's DEK wrapped for them by an existing
	// member (docs/CRYPTO.md) — "pending" in the UI. Never exposes the
	// wrapped_dek ciphertext itself here; nothing in ListMembers needs it
	// (see WrappedDEKRepository.FindMemberWrappedDEK, the only caller —
	// always fetching its own — that does).
	HasWrappedDEK bool
}

// EpochKey is one of a member's past wrapped DEKs, archived when a rotation
// moved it to a newer epoch — what their client needs, together with the
// current wrap, to decrypt update history predating that rotation.
type EpochKey struct {
	KeyEpoch   int
	WrappedDEK []byte
}

// Update is a persisted CRDT update.
type Update struct {
	ID        uint64
	AuthorID  user.ID
	Payload   []byte
	CreatedAt time.Time
}
