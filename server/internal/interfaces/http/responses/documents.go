package responses

import (
	"encoding/base64"
	"time"

	"palimpsesto/internal/application/document/dto"
)

// Document is a document's metadata, as sent to the client.
type Document struct {
	ID              string  `json:"id"`
	OwnerID         string  `json:"owner_id"`
	Title           string  `json:"title_ciphertext"`
	CurrentKeyEpoch int     `json:"current_key_epoch"`
	FolderID        *string `json:"folder_id"`
}

// Folder is a folder, as sent to the client.
type Folder struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"created_at"`
}

func FromFolder(f documentdto.FolderView) Folder {
	return Folder{ID: string(f.ID), Name: f.Name, Color: f.Color, CreatedAt: f.CreatedAt}
}

func FromFolders(folders []documentdto.FolderView) []Folder {
	views := make([]Folder, len(folders))
	for i, f := range folders {
		views[i] = FromFolder(f)
	}
	return views
}

// Invite is a pending invite — serves both the invitee's own view (no
// document title, per documentdto.InviteView's own comment: there's no
// key to decrypt one with before accepting) and the Share modal's
// "convite enviado" row.
type Invite struct {
	ID           string    `json:"id"`
	InviterName  string    `json:"inviter_name"`
	InviterEmail string    `json:"inviter_email"`
	InviteeName  string    `json:"invitee_name"`
	InviteeEmail string    `json:"invitee_email"`
	Role         string    `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
}

func FromInvite(i documentdto.InviteView) Invite {
	return Invite{
		ID:           string(i.ID),
		InviterName:  i.InviterName,
		InviterEmail: i.InviterEmail,
		InviteeName:  i.InviteeName,
		InviteeEmail: i.InviteeEmail,
		Role:         string(i.Role),
		CreatedAt:    i.CreatedAt,
	}
}

func FromInvites(invites []documentdto.InviteView) []Invite {
	views := make([]Invite, len(invites))
	for i, invite := range invites {
		views[i] = FromInvite(invite)
	}
	return views
}

// DocumentSummary is a Document plus activity info for the document
// list view.
type DocumentSummary struct {
	Document
	UpdateCount    int        `json:"update_count"`
	LastEditedAt   *time.Time `json:"last_edited_at"`
	LastEditorName string     `json:"last_editor_name"`
}

// Member is a document member's access, as sent to the client.
type Member struct {
	UserID        string `json:"user_id"`
	Email         string `json:"email"`
	DisplayName   string `json:"display_name"`
	Role          string `json:"role"`
	HasWrappedDEK bool   `json:"has_wrapped_dek"`
}

// WrappedDEK is a document's DEK, sealed for the caller — docs/CRYPTO.md's
// sharing envelope. WrappedDEK is standard base64.
type WrappedDEK struct {
	WrappedDEK string `json:"wrapped_dek"`
	KeyEpoch   int    `json:"key_epoch"`
}

func FromWrappedDEK(v documentdto.WrappedDEKView) WrappedDEK {
	return WrappedDEK{WrappedDEK: base64.StdEncoding.EncodeToString(v.WrappedDEK), KeyEpoch: v.KeyEpoch}
}

// EpochKey is one of the caller's own past sealed DEKs, from before some
// key rotation moved past it.
type EpochKey struct {
	KeyEpoch   int    `json:"key_epoch"`
	WrappedDEK string `json:"wrapped_dek"`
}

func FromEpochKeys(keys []documentdto.EpochKeyView) []EpochKey {
	views := make([]EpochKey, len(keys))
	for i, k := range keys {
		views[i] = EpochKey{KeyEpoch: k.KeyEpoch, WrappedDEK: base64.StdEncoding.EncodeToString(k.WrappedDEK)}
	}
	return views
}

// RemoveMemberResult is what removing a member and rotating the
// document's key returns — the client needs the new epoch to encrypt
// anything from this point on.
type RemoveMemberResult struct {
	KeyEpoch int `json:"key_epoch"`
}

// Update is a persisted CRDT update, as sent to the client.
//
// Payload is base64-encoded by encoding/json's default []byte handling
// (standard base64, with padding) — slightly different from
// docs/API.md's base64url convention for this more internal endpoint;
// not worth a custom encoder for now.
type Update struct {
	ID        uint64    `json:"id"`
	AuthorID  string    `json:"author_id"`
	Payload   []byte    `json:"payload"`
	CreatedAt time.Time `json:"created_at"`
}

func FromDocument(d documentdto.DocumentView) Document {
	var folderID *string
	if d.FolderID != nil {
		s := string(*d.FolderID)
		folderID = &s
	}
	return Document{ID: string(d.ID), OwnerID: string(d.OwnerID), Title: d.Title, CurrentKeyEpoch: d.CurrentKeyEpoch, FolderID: folderID}
}

func FromSummary(s documentdto.SummaryView) DocumentSummary {
	return DocumentSummary{
		Document:       FromDocument(s.DocumentView),
		UpdateCount:    s.UpdateCount,
		LastEditedAt:   s.LastEditedAt,
		LastEditorName: s.LastEditorName,
	}
}

func FromMember(m documentdto.MemberView) Member {
	return Member{
		UserID:        string(m.UserID),
		Email:         m.Email,
		DisplayName:   m.DisplayName,
		Role:          string(m.Role),
		HasWrappedDEK: m.HasWrappedDEK,
	}
}

func FromUpdate(u documentdto.UpdateView) Update {
	return Update{ID: u.ID, AuthorID: string(u.AuthorID), Payload: u.Payload, CreatedAt: u.CreatedAt}
}

// InviteLink is a document's share link, as sent to its owner.
type InviteLink struct {
	Token     string    `json:"token"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

func FromInviteLink(l documentdto.InviteLinkView) InviteLink {
	return InviteLink{Token: string(l.Token), Role: string(l.Role), CreatedAt: l.CreatedAt}
}

// Comment is a comment on a document, as sent to the client.
type Comment struct {
	ID         string     `json:"id"`
	AuthorID   string     `json:"author_id"`
	Body       string     `json:"body_ciphertext"`
	CreatedAt  time.Time  `json:"created_at"`
	EditedAt   *time.Time `json:"edited_at"`
	ResolvedAt *time.Time `json:"resolved_at"`
}

func FromComment(c documentdto.CommentView) Comment {
	return Comment{
		ID:         string(c.ID),
		AuthorID:   string(c.AuthorID),
		Body:       c.Body,
		CreatedAt:  c.CreatedAt,
		EditedAt:   c.EditedAt,
		ResolvedAt: c.ResolvedAt,
	}
}

// Snapshot is a document's most recent compaction snapshot, as sent to
// the client. Ciphertext is standard base64.
type Snapshot struct {
	KeyEpoch     int       `json:"key_epoch"`
	UpToUpdateID uint64    `json:"up_to_update_id"`
	Ciphertext   string    `json:"ciphertext"`
	CreatedAt    time.Time `json:"created_at"`
}

func FromSnapshot(s documentdto.SnapshotView) Snapshot {
	return Snapshot{
		KeyEpoch:     s.KeyEpoch,
		UpToUpdateID: s.UpToUpdateID,
		Ciphertext:   base64.StdEncoding.EncodeToString(s.Ciphertext),
		CreatedAt:    s.CreatedAt,
	}
}

// ActiveDocument is one of the caller's own documents that has someone
// connected right now, plus who.
type ActiveDocument struct {
	DocumentID string   `json:"document_id"`
	Users      []Member `json:"users"`
}

// ActiveDocuments lists, among the caller's own documents, which ones
// have at least one client connected right now, and who.
type ActiveDocuments struct {
	Documents []ActiveDocument `json:"documents"`
}
