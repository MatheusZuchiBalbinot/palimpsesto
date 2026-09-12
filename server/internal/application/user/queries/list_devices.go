package userqueries

import (
	"context"
	"fmt"

	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/user/dto"
)

// ListDevicesHandler lists every device currently logged into the
// caller's own account.
type ListDevicesHandler struct {
	sessions session.Repository
}

func NewListDevicesHandler(sessions session.Repository) *ListDevicesHandler {
	return &ListDevicesHandler{sessions: sessions}
}

func (h *ListDevicesHandler) Handle(ctx context.Context, userID user.ID, callerFamilyID session.FamilyID) ([]userdto.DeviceView, error) {
	active, err := h.sessions.ListActiveByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("user: listing active sessions: %w", err)
	}

	views := make([]userdto.DeviceView, len(active))
	for i, s := range active {
		views[i] = userdto.DeviceView{
			FamilyID:     string(s.FamilyID),
			DeviceLabel:  s.DeviceLabel,
			LastActiveAt: s.CreatedAt,
			IsCurrent:    s.FamilyID == callerFamilyID,
		}
	}
	return views, nil
}
