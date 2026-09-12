// Package dto contains the data transfer objects the document application
// service returns to its callers — the interfaces/http layer never sees
// domain entities directly.
package documentdto

import (
	"time"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// DocumentView is a document's metadata.
type DocumentView struct {
	ID              document.ID
	OwnerID         user.ID
	Title           string
	CurrentKeyEpoch int
	FolderID        *document.FolderID
}

// FolderView is a folder — personal document organization, per
// document.Folder.
type FolderView struct {
	ID        document.FolderID
	Name      string
	Color     string
	CreatedAt time.Time
}

func FromFolder(f document.Folder) FolderView {
	return FolderView{ID: f.ID, Name: f.Name, Color: f.Color, CreatedAt: f.CreatedAt}
}

func FromFolders(folders []document.Folder) []FolderView {
	views := make([]FolderView, len(folders))
	for i, f := range folders {
		views[i] = FromFolder(f)
	}
	return views
}

// InviteView is a pending invite, serving both sides: the invitee's
// "Convites" view (which ignores InviteeName/Email, and deliberately
// carries no document title — see document.InviteSummary's own comment:
// there's no key to decrypt one with before accepting) and the Share
// modal's "convites enviados" list (which ignores InviterName/Email).
type InviteView struct {
	ID           document.InviteID
	DocumentID   document.ID
	InviterID    user.ID
	InviterName  string
	InviterEmail string
	InviteeID    user.ID
	InviteeName  string
	InviteeEmail string
	Role         document.Role
	CreatedAt    time.Time
}

func FromInvite(i document.Invite) InviteView {
	return InviteView{ID: i.ID, DocumentID: i.DocumentID, InviterID: i.InviterID, InviteeID: i.InviteeID, Role: i.Role, CreatedAt: i.CreatedAt}
}

func FromInviteSummary(i document.InviteSummary) InviteView {
	view := FromInvite(i.Invite)
	view.InviterName = i.InviterName
	view.InviterEmail = i.InviterEmail
	view.InviteeName = i.InviteeName
	view.InviteeEmail = i.InviteeEmail
	return view
}

func FromInviteSummaries(invites []document.InviteSummary) []InviteView {
	views := make([]InviteView, len(invites))
	for i, invite := range invites {
		views[i] = FromInviteSummary(invite)
	}
	return views
}

// SummaryView is a DocumentView plus activity info for list views.
type SummaryView struct {
	DocumentView
	UpdateCount    int
	LastEditedAt   *time.Time
	LastEditorName string
}

// MemberView is a document member's access.
type MemberView struct {
	UserID        user.ID
	Email         string
	DisplayName   string
	Role          document.Role
	HasWrappedDEK bool
}

// WrappedDEKView is a document's DEK, sealed for a member — docs/CRYPTO.md's
// document-sharing envelope.
type WrappedDEKView struct {
	WrappedDEK []byte
	KeyEpoch   int
}

// UpdateView is a persisted CRDT update.
type UpdateView struct {
	ID        uint64
	AuthorID  user.ID
	Payload   []byte
	CreatedAt time.Time
}

// EpochKeyView is one of a member's own past wrapped DEKs, archived.
type EpochKeyView struct {
	KeyEpoch   int
	WrappedDEK []byte
}

// SnapshotView is a document's most recent compaction snapshot
// (docs/CRYPTO.md).
type SnapshotView struct {
	KeyEpoch     int
	UpToUpdateID uint64
	Ciphertext   []byte
	CreatedAt    time.Time
}

func FromSnapshot(s document.Snapshot) SnapshotView {
	return SnapshotView{
		KeyEpoch:     s.KeyEpoch,
		UpToUpdateID: s.UpToUpdateID,
		Ciphertext:   s.Ciphertext,
		CreatedAt:    s.CreatedAt,
	}
}

func FromDocument(d document.Document) DocumentView {
	return DocumentView{ID: d.ID, OwnerID: d.OwnerID, Title: d.Title, CurrentKeyEpoch: d.CurrentKeyEpoch, FolderID: d.FolderID}
}

func FromEpochKeys(keys []document.EpochKey) []EpochKeyView {
	views := make([]EpochKeyView, len(keys))
	for i, k := range keys {
		views[i] = EpochKeyView{KeyEpoch: k.KeyEpoch, WrappedDEK: k.WrappedDEK}
	}
	return views
}

func FromSummary(s document.Summary) SummaryView {
	return SummaryView{
		DocumentView:   FromDocument(s.Document),
		UpdateCount:    s.UpdateCount,
		LastEditedAt:   s.LastEditedAt,
		LastEditorName: s.LastEditorName,
	}
}

func FromMember(m document.Member) MemberView {
	return MemberView{
		UserID:        m.UserID,
		Email:         m.Email,
		DisplayName:   m.DisplayName,
		Role:          m.Role,
		HasWrappedDEK: m.HasWrappedDEK,
	}
}

func FromUpdate(u document.Update) UpdateView {
	return UpdateView{ID: u.ID, AuthorID: u.AuthorID, Payload: u.Payload, CreatedAt: u.CreatedAt}
}
