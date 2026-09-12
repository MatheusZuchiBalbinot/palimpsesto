// Package dto contains the data transfer objects the user application
// service returns to its callers — the interfaces/http layer never sees
// domain entities directly.
package userdto

import (
	"time"

	"palimpsesto/internal/domain/user"
)

// AccountView is an account, with no secret material.
type AccountView struct {
	ID          user.ID
	Email       user.Email
	DisplayName user.DisplayName
}

// TokenPair is what a successful login or refresh returns: a short-lived
// access token, and the opaque refresh token to be stored in an httpOnly
// cookie.
//
// The two expirations are tracked separately on purpose: the refresh
// cookie needs to survive the whole session, not just the access token's
// 15-minute window — mixing them up used to make the browser discard the
// refresh cookie well before the session it names actually expired.
type TokenPair struct {
	AccessToken           string
	AccessTokenExpiresAt  time.Time
	RefreshToken          string
	RefreshTokenExpiresAt time.Time
	Account               AccountView
}
