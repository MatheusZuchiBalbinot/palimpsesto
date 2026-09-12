// Package session is the refresh token domain: opaque refresh tokens,
// rotation, and family-based reuse detection. Never imports net/http or
// database drivers.
package session

import (
	"time"

	"palimpsesto/internal/domain/user"
)

// Session is one link in a refresh token rotation chain. A non-nil
// RevokedAt means presenting this session's token again is theft, not a
// valid rotation.
type Session struct {
	ID          ID
	UserID      user.ID
	FamilyID    FamilyID
	RefreshHash string
	// DeviceLabel is the User-Agent string captured at login/refresh time
	// — a minimally readable "which device is this" hint in a device
	// list, nothing more precise than that.
	DeviceLabel string
	ExpiresAt   time.Time
	RevokedAt   *time.Time
	// CreatedAt is when this specific link was issued — for a family's
	// most recent link (the one ListActiveByUser returns), this is that
	// device's last activity, since every refresh spins up a new link.
	CreatedAt time.Time
}

// DetectReuse validates a session found by refresh token lookup, in the
// order rotation needs to check it: revoked (theft) before expired, since a
// token that's both revoked and expired is still theft, not mere staleness.
// Returns nil if the token is safe to rotate.
func (s Session) DetectReuse(now time.Time) error {
	if s.RevokedAt != nil {
		return ErrRefreshTokenReused
	}
	if now.After(s.ExpiresAt) {
		return ErrInvalidRefreshToken
	}
	return nil
}
