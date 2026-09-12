package usercommands

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"
)

// RevokeDeviceHandler logs out a specific device — the device list's
// "sign out of this device" action, as opposed to Logout (this device's
// own session, from its own refresh cookie).
type RevokeDeviceHandler struct {
	sessions session.Repository
}

func NewRevokeDeviceHandler(sessions session.Repository) *RevokeDeviceHandler {
	return &RevokeDeviceHandler{sessions: sessions}
}

// Handle revokes familyID, but only if it belongs to callerID — returns
// session.ErrNotFound otherwise (RevokeFamilyForUser never distinguishes
// "not yours" from "doesn't exist").
func (h *RevokeDeviceHandler) Handle(ctx context.Context, callerID user.ID, familyID session.FamilyID) error {
	if err := h.sessions.RevokeFamilyForUser(ctx, familyID, callerID); err != nil {
		return fmt.Errorf("user: revoking device: %w", err)
	}
	return nil
}
