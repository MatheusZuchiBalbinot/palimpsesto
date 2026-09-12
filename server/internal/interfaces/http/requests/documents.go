package requests

// CreateDocument is what a client sends to create a document.
type CreateDocument struct {
	Title string `json:"title_ciphertext"`
}

// UpdateDocument is what a client sends to rename a document.
type UpdateDocument struct {
	Title string `json:"title_ciphertext"`
}

// AddMember is what a client sends to invite a user to a document.
// WrappedDEK is standard base64 — the document's DEK, sealed by the
// caller's client for the invitee's identity_pub.
type AddMember struct {
	Email      string `json:"email"`
	Role       string `json:"role"`
	WrappedDEK string `json:"wrapped_dek"`
}

// SetWrappedDEK is what a client sends to seal the document's DEK for a
// member. Standard base64.
type SetWrappedDEK struct {
	WrappedDEK string `json:"wrapped_dek"`
}

// RemoveMember is what a client sends to remove a member and rotate the
// document's key in a single step. NewWraps maps each remaining
// member's user_id to their freshly generated wrapped_dek under the new
// epoch — both the map's keys and the wrapped_dek values are computed
// client-side, never by the server.
type RemoveMember struct {
	NewWraps map[string]string `json:"new_wraps"`
}

// UpdateMemberRole is what a client sends to change a member's role.
type UpdateMemberRole struct {
	Role string `json:"role"`
}

// CreateFolder is what a client sends to create a folder.
type CreateFolder struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// UpdateFolder is what a client sends to rename/recolor a folder.
type UpdateFolder struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// SetDocumentFolder is what a client sends to file (or un-file, with a
// null folder_id) a document under a folder.
type SetDocumentFolder struct {
	FolderID *string `json:"folder_id"`
}

// CreateInvite is what a client sends to invite a user by email — same
// shape as AddMember, since the caller's client does the same seal
// either way; only the server-side result differs (pending vs. immediate).
type CreateInvite struct {
	Email      string `json:"email"`
	Role       string `json:"role"`
	WrappedDEK string `json:"wrapped_dek"`
}

// CreateInviteLink is what a client sends to (re)generate a document's
// share link.
type CreateInviteLink struct {
	Role string `json:"role"`
}

// CreateComment is what a client sends to post a comment on a document.
type CreateComment struct {
	Body string `json:"body_ciphertext"`
}

// CreateSnapshot is what a client sends to compact a document's update
// log. Ciphertext is standard base64.
type CreateSnapshot struct {
	KeyEpoch     int    `json:"key_epoch"`
	UpToUpdateID uint64 `json:"up_to_update_id"`
	Ciphertext   string `json:"ciphertext"`
}
