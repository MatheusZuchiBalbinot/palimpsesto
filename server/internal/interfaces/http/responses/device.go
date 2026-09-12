package responses

import (
	"time"

	"palimpsesto/internal/application/user/dto"
)

// Device is a currently logged-in device, as sent to the client.
type Device struct {
	FamilyID     string    `json:"family_id"`
	DeviceLabel  string    `json:"device_label"`
	LastActiveAt time.Time `json:"last_active_at"`
	IsCurrent    bool      `json:"is_current"`
}

func FromDevice(d userdto.DeviceView) Device {
	return Device{FamilyID: d.FamilyID, DeviceLabel: d.DeviceLabel, LastActiveAt: d.LastActiveAt, IsCurrent: d.IsCurrent}
}
