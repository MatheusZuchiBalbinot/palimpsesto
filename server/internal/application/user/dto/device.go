package userdto

import "time"

// DeviceView is a currently logged-in device — the most recent, still
// usable session link in a rotation family.
type DeviceView struct {
	FamilyID    string
	DeviceLabel string
	// LastActiveAt is when this link was issued — every refresh rotates a
	// new link, so this is, in practice, "last seen".
	LastActiveAt time.Time
	// IsCurrent marks the device making the request that produced this
	// list — never persisted, computed fresh from the caller's own access
	// token family on every call.
	IsCurrent bool
}
