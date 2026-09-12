// Package queries implements the user application service's read use
// cases.
package userqueries

import (
	"palimpsesto/internal/domain/auth"
	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"
)

// ParseAccessTokenHandler validates an access token and identifies its
// owner — what the HTTP auth middleware runs on every protected request.
type ParseAccessTokenHandler struct {
	jwtSecret []byte
}

func NewParseAccessTokenHandler(jwtSecret []byte) *ParseAccessTokenHandler {
	return &ParseAccessTokenHandler{jwtSecret: jwtSecret}
}

func (h *ParseAccessTokenHandler) Handle(token string) (user.ID, session.FamilyID, error) {
	return auth.ParseAccessToken(h.jwtSecret, token)
}
