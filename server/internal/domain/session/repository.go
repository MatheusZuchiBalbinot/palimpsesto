package session

import (
	"context"
	"time"

	"palimpsesto/internal/domain/user"
)

// Repository is the persistence contract for refresh token sessions.
type Repository interface {
	// Create inserts a brand-new session, starting a new rotation family.
	Create(ctx context.Context, userID user.ID, refreshHash, deviceLabel string, expiresAt time.Time) (Session, error)

	// Rotate inserts the next link in an existing rotation family.
	Rotate(ctx context.Context, familyID FamilyID, userID user.ID, refreshHash, deviceLabel string, expiresAt time.Time) (Session, error)

	// FindByRefreshHash looks up the session whose hash matches a
	// presented refresh token. Returns ErrInvalidRefreshToken if there's
	// no match.
	FindByRefreshHash(ctx context.Context, refreshHash string) (Session, error)

	// Revoke marks a single session as revoked (used when it's rotated).
	Revoke(ctx context.Context, id ID) error

	// RevokeFamily revokes every session in a rotation family — used both
	// for logout and for refresh token reuse detection.
	RevokeFamily(ctx context.Context, familyID FamilyID) error

	// ListActiveByUser returns one entry per currently usable rotation
	// family belonging to userID — its most recent link, i.e. one row
	// per logged-in device.
	ListActiveByUser(ctx context.Context, userID user.ID) ([]Session, error)

	// RevokeFamilyForUser is RevokeFamily scoped to a specific owner —
	// what a "sign out of this device" action in the device list needs,
	// so a caller can never revoke a family that isn't theirs. Returns
	// ErrNotFound if familyID doesn't belong to userID (or doesn't exist
	// at all — never distinguished).
	RevokeFamilyForUser(ctx context.Context, familyID FamilyID, userID user.ID) error
}
