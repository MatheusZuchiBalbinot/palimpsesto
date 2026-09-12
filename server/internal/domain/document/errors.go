package document

import "errors"

// Sentinel errors. The HTTP layer maps each one to a status code in a
// single place — see internal/interfaces/http/responses.
var (
	ErrNotFound             = errors.New("document: not found")
	ErrNotOwner             = errors.New("document: only the owner can do this")
	ErrAlreadyAdded         = errors.New("document: user is already a member")
	ErrUserNotFound         = errors.New("document: no user with that email")
	ErrInviteLinkNotFound   = errors.New("document: invite link not found or revoked")
	ErrCommentNotFound      = errors.New("document: comment not found")
	ErrNotCommentAuthor     = errors.New("document: only the comment's author or the document owner can do this")
	ErrPendingWrappedDEK    = errors.New("document: no one has wrapped the DEK for this member yet")
	ErrCannotRemoveOwner    = errors.New("document: the owner cannot remove themselves")
	ErrIncompleteRotation   = errors.New("document: rotation wraps must cover exactly the members remaining after removal")
	ErrNotEditor            = errors.New("document: readers cannot write to a document")
	ErrSnapshotNotFound     = errors.New("document: no snapshot exists yet")
	ErrInvalidRole          = errors.New("document: role must be editor or reader")
	ErrCannotChangeOwnRole  = errors.New("document: the owner's own role cannot be changed")
	ErrFolderNotFound       = errors.New("document: folder not found")
	ErrInvalidFolderName    = errors.New("document: folder name must be 1 to 60 characters")
	ErrInviteNotFound       = errors.New("document: invite not found")
	ErrAlreadyInvited       = errors.New("document: user already has a pending invite to this document")
	ErrInviteStale          = errors.New("document: this document's key has changed since the invite was sent")
	ErrWrappedDEKAlreadySet = errors.New("document: this member's wrapped DEK is already set")
)
