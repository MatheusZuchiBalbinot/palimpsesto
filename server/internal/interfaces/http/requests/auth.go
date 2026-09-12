// Package requests holds the HTTP request body DTOs — the shapes
// clients send over the wire, decoded directly from http.Request.Body.
package requests

import "palimpsesto/internal/domain/user"

// Register is what a client sends to create an account. LoginKey is
// derived via client-side HKDF from the master key (docs/CRYPTO.md),
// never the raw password. SaltMK is standard base64, generated
// client-side.
type Register struct {
	Email       user.Email       `json:"email"`
	LoginKey    user.LoginKey    `json:"login_key"`
	DisplayName user.DisplayName `json:"display_name"`
	SaltMK      string           `json:"salt_mk"`
}

// Login is what a client sends to start a session.
type Login struct {
	Email    user.Email    `json:"email"`
	LoginKey user.LoginKey `json:"login_key"`
}

// UpdateProfile is what a client sends to change its own display name.
type UpdateProfile struct {
	DisplayName user.DisplayName `json:"display_name"`
}

// ChangePassword is what a client sends to change its password. Both
// keys are derived via client-side HKDF, never raw passwords. NewSaltMK
// is standard base64.
type ChangePassword struct {
	CurrentLoginKey user.LoginKey `json:"current_login_key"`
	NewLoginKey     user.LoginKey `json:"new_login_key"`
	NewSaltMK       string        `json:"new_salt_mk"`
}
