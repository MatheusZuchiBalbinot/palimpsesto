package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// UpdateMemberRoleInput is what changing a member's role requires.
type UpdateMemberRoleInput struct {
	DocumentID document.ID
	Caller     user.ID
	TargetUser user.ID
	Role       document.Role
}

// UpdateMemberRoleHandler changes a member's role between editor and
// reader. No key material changes — a role is pure authorization, enforced
// server-side on every write (AppendUpdateHandler, UpdateTitleHandler), and
// the DEK's encryption never depends on it. Only the owner can call this,
// and never on themselves.
type UpdateMemberRoleHandler struct {
	membership document.MembershipRepository
}

func NewUpdateMemberRoleHandler(membership document.MembershipRepository) *UpdateMemberRoleHandler {
	return &UpdateMemberRoleHandler{membership: membership}
}

func (h *UpdateMemberRoleHandler) Handle(ctx context.Context, in UpdateMemberRoleInput) error {
	if in.Role != document.RoleEditor && in.Role != document.RoleReader {
		return document.ErrInvalidRole
	}

	role, err := h.membership.MemberRole(ctx, in.DocumentID, in.Caller)
	if errors.Is(err, document.ErrNotFound) {
		return document.ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("document: checking role: %w", err)
	}
	if !role.IsOwner() {
		return document.ErrNotOwner
	}
	if in.TargetUser == in.Caller {
		return document.ErrCannotChangeOwnRole
	}

	if err := h.membership.UpdateMemberRole(ctx, in.DocumentID, in.TargetUser, in.Role); err != nil {
		return fmt.Errorf("document: updating member role: %w", err)
	}
	return nil
}
