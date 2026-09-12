// Package auth issues and validates short-lived JWT access tokens. It is
// stateless — no repository, no database — unlike the session domain, which
// owns the stateful refresh token rotation chain.
package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"
)

const accessTokenTTL = 15 * time.Minute

type accessClaims struct {
	jwt.RegisteredClaims
	// FamilyID names the refresh-token rotation family (i.e. the device)
	// this access token was issued alongside — informational only, never
	// used for authorization. It lets a handler like ListDevices mark
	// which row in the device list is the caller's own current session.
	FamilyID string `json:"family_id"`
}

// NewAccessToken issues a signed, short-lived JWT identifying userID and the
// session family it was issued for.
func NewAccessToken(secret []byte, userID user.ID, familyID session.FamilyID) (token string, expiresAt time.Time, err error) {
	expiresAt = time.Now().Add(accessTokenTTL)
	claims := accessClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   string(userID),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
		FamilyID: string(familyID),
	}

	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("auth: signing access token: %w", err)
	}
	return signed, expiresAt, nil
}

// ParseAccessToken validates an access token's signature and expiration and
// returns the ID of the user and the session family it was issued for.
func ParseAccessToken(secret []byte, tokenString string) (user.ID, session.FamilyID, error) {
	var claims accessClaims
	token, err := jwt.ParseWithClaims(tokenString, &claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("auth: unexpected signing method %v", t.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return "", "", fmt.Errorf("auth: %w", err)
	}
	if !token.Valid {
		return "", "", errors.New("auth: invalid access token")
	}
	return user.ID(claims.Subject), session.FamilyID(claims.FamilyID), nil
}
