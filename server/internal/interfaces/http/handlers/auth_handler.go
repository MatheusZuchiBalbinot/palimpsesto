package handlers

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"

	"palimpsesto/internal/application/user"
	"palimpsesto/internal/application/user/commands"
	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/interfaces/http/middleware"
	"palimpsesto/internal/interfaces/http/requests"
	"palimpsesto/internal/interfaces/http/responses"
)

const refreshCookieName = "refresh"

func Register(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body requests.Register
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		saltMK, err := base64.StdEncoding.DecodeString(body.SaltMK)
		if err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "salt_mk inválido")
			return
		}

		in := usercommands.RegisterInput{
			Email:       body.Email,
			LoginKey:    body.LoginKey,
			DisplayName: body.DisplayName,
			SaltMK:      saltMK,
		}
		if err := users.Register(r.Context(), in); err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// GetSalt returns an account's salt_mk by email — public, unauthenticated
// on purpose: a client needs this before having anything to log in with.
func GetSalt(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email := user.Email(r.URL.Query().Get("email"))
		if email == "" {
			responses.WriteError(w, http.StatusBadRequest, "invalid_request", "parâmetro email é obrigatório")
			return
		}

		salt, err := users.GetSalt(r.Context(), email)
		if err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.Salt{SaltMK: base64.StdEncoding.EncodeToString(salt)})
	}
}

// SetWrappedPrivateKeys publishes the caller's sealed private keys —
// called once at registration, and again after a password change
// (re-sealed with the new wrapKey).
func SetWrappedPrivateKeys(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		var body requests.SetWrappedPrivateKeys
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		ciphertext, err := base64.StdEncoding.DecodeString(body.Ciphertext)
		if err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "ciphertext inválido")
			return
		}
		nonce, err := base64.StdEncoding.DecodeString(body.Nonce)
		if err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "nonce inválido")
			return
		}

		keys := user.WrappedPrivateKeys{Ciphertext: ciphertext, Nonce: nonce}
		if err := users.SetWrappedPrivateKeys(r.Context(), userID, keys); err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// ChangePassword replaces the caller's login-key material — re-verifying
// the current one first (see ChangePasswordHandler's comment). Never
// touches the identity private keys; the client re-seals and resends
// those separately via SetWrappedPrivateKeys with the new wrapKey.
func ChangePassword(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		var body requests.ChangePassword
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		newSaltMK, err := base64.StdEncoding.DecodeString(body.NewSaltMK)
		if err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "new_salt_mk inválido")
			return
		}

		in := usercommands.ChangePasswordInput{
			UserID:          userID,
			CurrentLoginKey: body.CurrentLoginKey,
			NewLoginKey:     body.NewLoginKey,
			NewSaltMK:       newSaltMK,
		}
		if err := users.ChangePassword(r.Context(), in); err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// UpdateProfile changes the caller's own display name — the only account
// field a user can edit after registration.
func UpdateProfile(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		var body requests.UpdateProfile
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		if err := users.UpdateDisplayName(r.Context(), userID, body.DisplayName); err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// GetOwnWrappedPrivateKeys returns the caller's own sealed private
// keys — what a new device needs to recover identity after deriving the
// wrapKey from the account's password.
func GetOwnWrappedPrivateKeys(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		keys, err := users.GetWrappedPrivateKeys(r.Context(), userID)
		if err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.WrappedPrivateKeys{
			Ciphertext: base64.StdEncoding.EncodeToString(keys.Ciphertext),
			Nonce:      base64.StdEncoding.EncodeToString(keys.Nonce),
		})
	}
}

func Login(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body requests.Login
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		in := usercommands.LoginInput{Email: body.Email, LoginKey: body.LoginKey, DeviceLabel: r.UserAgent()}
		tokens, err := users.Login(r.Context(), in)
		if err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		setRefreshCookie(w, tokens.RefreshToken, tokens.RefreshTokenExpiresAt)
		writeJSON(w, http.StatusOK, responses.FromTokenPair(tokens))
	}
}

func Refresh(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(refreshCookieName)
		if err != nil {
			responses.WriteError(w, http.StatusUnauthorized, "invalid_refresh_token", "sessão expirada, faça login novamente")
			return
		}

		in := usercommands.RefreshInput{PresentedToken: cookie.Value, DeviceLabel: r.UserAgent()}
		tokens, err := users.Refresh(r.Context(), in)
		if err != nil {
			clearRefreshCookie(w)
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		setRefreshCookie(w, tokens.RefreshToken, tokens.RefreshTokenExpiresAt)
		// Same response shape as Login, not just {access_token} — the
		// client's session bootstrap (a page reload has no session.user in
		// memory to fall back on, only this httpOnly cookie) also needs
		// the account info, not just a token.
		writeJSON(w, http.StatusOK, responses.FromTokenPair(tokens))
	}
}

func Logout(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(refreshCookieName)
		if err == nil {
			_ = users.Logout(r.Context(), cookie.Value)
		}
		clearRefreshCookie(w)
		w.WriteHeader(http.StatusNoContent)
	}
}

// ListDevices lists every device currently logged into the caller's own
// account.
func ListDevices(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		familyID, _ := middleware.FamilyIDFromContext(r.Context())

		devices, err := users.ListDevices(r.Context(), userID, familyID)
		if err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		views := make([]responses.Device, 0, len(devices))
		for _, d := range devices {
			views = append(views, responses.FromDevice(d))
		}
		writeJSON(w, http.StatusOK, views)
	}
}

// RevokeDevice logs out a specific device — can never be called across
// accounts (users.RevokeDevice scopes the revocation to the caller's
// own ID).
func RevokeDevice(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		familyID := session.FamilyID(r.PathValue("familyId"))

		if err := users.RevokeDevice(r.Context(), userID, familyID); err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// secureCookies marks the refresh cookie as HTTPS-only. True is the only
// safe default (held from a fresh process's very start until main.go
// says otherwise) — SetSecureCookies exists purely so local HTTP
// development can turn it off, since a browser silently never sends a
// Secure cookie back: leaving it on isn't a security hole, it's a trap
// that makes refresh (and this whole package's purpose) simply not work
// outside HTTPS. This was discovered by actually running a real browser
// against a real plain-HTTP dev server — every unit and integration
// test in this repo talks to the API directly and never noticed, since
// none of them is a cookie jar enforcing the browser's cookie-attribute
// rules.
var secureCookies = true

// SetSecureCookies overrides the default — call once at startup, before
// the server starts accepting requests (main.go, right after
// config.Load()).
func SetSecureCookies(secure bool) {
	secureCookies = secure
}

func setRefreshCookie(w http.ResponseWriter, token string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    token,
		Path:     "/api/auth",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   secureCookies,
		SameSite: http.SameSiteStrictMode,
	})
}

func clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     "/api/auth",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secureCookies,
		SameSite: http.SameSiteStrictMode,
	})
}
