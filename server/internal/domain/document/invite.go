package document

import (
	"context"
	"time"

	"palimpsesto/internal/domain/user"
)

// InviteID identifies a pending invite.
type InviteID string

// Invite is a proposal to join a document — unlike a Member, accepting
// one is a deliberate action the invitee takes. WrappedDEK is already
// sealed for the invitee's public identity key (the inviter's client did
// that before this was created), and KeyEpoch pins it to the document's
// key generation at that time — see the migration's own comment for why
// that matters once an invite can sit pending across a key rotation.
type Invite struct {
	ID         InviteID
	DocumentID ID
	InviterID  user.ID
	InviteeID  user.ID
	Role       Role
	WrappedDEK []byte
	KeyEpoch   int
	CreatedAt  time.Time
}

// InviteSummary is a pending invite plus both sides' display info — the
// vault's "Convites" list needs the inviter's name ("Ana convidou você"),
// and the Share modal's "convite enviado" row needs the invitee's.
// Deliberately doesn't carry anything about the *document itself* for
// the invitee's own view: they have no key material for it at all until
// they accept, so there's nothing to decrypt and show, e.g. no title.
type InviteSummary struct {
	Invite
	InviterName  string
	InviterEmail string
	InviteeName  string
	InviteeEmail string
}

// NewInviteInput is what creating an invite persists.
type NewInviteInput struct {
	DocumentID ID
	InviterID  user.ID
	InviteeID  user.ID
	Role       Role
	WrappedDEK []byte
	KeyEpoch   int
}

// InviteRepository is the persistence contract for pending invites.
type InviteRepository interface {
	// CreateInvite makes a new pending invite. Returns ErrAlreadyInvited
	// if inviteeID already has one pending for this document.
	CreateInvite(ctx context.Context, in NewInviteInput) (Invite, error)

	// FindInvite looks up an invite by ID. Returns ErrInviteNotFound if it
	// doesn't exist.
	FindInvite(ctx context.Context, id InviteID) (Invite, error)

	// ListInvitesForInvitee returns every pending invite addressed to
	// inviteeID, newest first — the vault's "Convites" view.
	ListInvitesForInvitee(ctx context.Context, inviteeID user.ID) ([]InviteSummary, error)

	// ListInvitesForDocument returns every pending invite sent out for
	// documentID, newest first — the Share modal's "convites enviados"
	// list, so an invited-but-not-yet-accepted person isn't invisible
	// there.
	ListInvitesForDocument(ctx context.Context, documentID ID) ([]InviteSummary, error)

	// DeleteInvite removes a pending invite (decline, cancel, or accept —
	// AcceptInviteHandler deletes it right after converting it into a
	// membership). Returns ErrInviteNotFound if it doesn't exist.
	DeleteInvite(ctx context.Context, id InviteID) error
}
