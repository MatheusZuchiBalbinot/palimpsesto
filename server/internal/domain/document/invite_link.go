package document

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"time"
)

const inviteTokenBytes = 32

// InviteToken is the bearer credential a document's sharing link carries.
// Unlike a session refresh token, it's recoverable by the document owner
// while it's active — its blast radius is limited to one document in a
// grantable role, not an account, so there's no reason to hide it from
// whoever created it.
type InviteToken string

// NewInviteToken generates a new, unpredictable invite token.
func NewInviteToken() (InviteToken, error) {
	raw := make([]byte, inviteTokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("document: generating invite token: %w", err)
	}
	return InviteToken(base64.RawURLEncoding.EncodeToString(raw)), nil
}

// InviteLink is a document's current sharing link: whoever presents its
// token joins the document with Role. Never grants RoleOwner.
type InviteLink struct {
	DocumentID ID
	Token      InviteToken
	Role       Role
	CreatedAt  time.Time
}

// InviteLinkRepository is the persistence contract for a document's sharing
// link. A document has at most one active link at a time; creating one
// where another already exists rotates it (the old token stops working).
type InviteLinkRepository interface {
	// Upsert creates or rotates docID's invite link, generating a new
	// token and setting role. Returns the new link.
	Upsert(ctx context.Context, docID ID, role Role) (InviteLink, error)

	// FindLink returns docID's current invite link. Returns
	// ErrInviteLinkNotFound if none exists.
	FindLink(ctx context.Context, docID ID) (InviteLink, error)

	// FindByToken resolves a presented token to its invite link. Returns
	// ErrInviteLinkNotFound if the token is unknown or has been rotated.
	FindByToken(ctx context.Context, token InviteToken) (InviteLink, error)

	// Revoke removes docID's invite link, if any. Idempotent.
	Revoke(ctx context.Context, docID ID) error
}
