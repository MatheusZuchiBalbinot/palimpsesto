package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
)

// AddMemberInput is what a client sends to invite a user by email.
// WrappedDEK is the document's DEK, sealed by the caller's client for the
// invitee's identity_pub (docs/CRYPTO.md) — the caller already has
// access, so their client is the one obligated to do that wrap.
type AddMemberInput struct {
	DocumentID document.ID
	Caller     user.ID
	Email      string
	Role       document.Role
	WrappedDEK []byte
}

// AddMemberHandler invites existing users to a document by email.
type AddMemberHandler struct {
	membership document.MembershipRepository
}

func NewAddMemberHandler(membership document.MembershipRepository) *AddMemberHandler {
	return &AddMemberHandler{membership: membership}
}

// Handle invites an existing user by email. The caller must already be a
// member.
func (h *AddMemberHandler) Handle(ctx context.Context, in AddMemberInput) error {
	if in.Role != document.RoleEditor && in.Role != document.RoleReader {
		return document.ErrInvalidRole
	}
	if err := authz.RequireMembership(ctx, h.membership, in.DocumentID, in.Caller); err != nil {
		return err
	}

	invitee, err := h.membership.FindMemberCandidateByEmail(ctx, in.Email)
	if errors.Is(err, document.ErrUserNotFound) {
		return document.ErrUserNotFound
	}
	if err != nil {
		return fmt.Errorf("document: finding invitee: %w", err)
	}

	newMember := document.NewMemberInput{DocumentID: in.DocumentID, UserID: invitee, Role: in.Role, WrappedDEK: in.WrappedDEK}
	err = h.membership.AddMember(ctx, newMember)
	if errors.Is(err, document.ErrAlreadyAdded) {
		return document.ErrAlreadyAdded
	}
	if err != nil {
		return fmt.Errorf("document: adding member: %w", err)
	}
	return nil
}
