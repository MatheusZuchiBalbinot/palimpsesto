package document

// ID identifies a document.
type ID string

// SnapshotID identifies one of a document's snapshots.
type SnapshotID string

// Role is a member's access level to a document. Only "owner" carries any
// special privilege today (deleting the document); the reader/editor
// distinction is enforced.
type Role string

const (
	RoleOwner  Role = "owner"
	RoleEditor Role = "editor"
	RoleReader Role = "reader"
)

// IsOwner reports whether the role is the owner role.
func (r Role) IsOwner() bool {
	return r == RoleOwner
}
