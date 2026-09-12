package middleware

import (
	"context"
	"net/http"
	"strings"

	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/user"
)

const userIDContextKey contextKey = "user_id"
const familyIDContextKey contextKey = "family_id"

// RequireAuth validates the "Authorization: Bearer <access_token>"
// header and puts the authenticated user's ID in the request context.
// Every /api/docs* route goes through this.
func RequireAuth(users *userapp.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token, hasBearerToken := bearerToken(r)
			if !hasBearerToken {
				writeUnauthenticated(w)
				return
			}

			userID, familyID, err := users.ParseAccessToken(token)
			if err != nil {
				writeUnauthenticated(w)
				return
			}

			ctx := context.WithValue(r.Context(), userIDContextKey, userID)
			ctx = context.WithValue(ctx, familyIDContextKey, familyID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserIDFromContext reads the user ID that RequireAuth put in the
// request context. Handlers behind RequireAuth can assume ok is always
// true.
func UserIDFromContext(ctx context.Context) (user.ID, bool) {
	userID, ok := ctx.Value(userIDContextKey).(user.ID)
	return userID, ok
}

// FamilyIDFromContext reads the session family ID that RequireAuth put in
// the request context — the caller's own "which device is this" identity,
// informational only (see accessClaims.FamilyID). Handlers behind
// RequireAuth can assume ok is always true.
func FamilyIDFromContext(ctx context.Context) (session.FamilyID, bool) {
	familyID, ok := ctx.Value(familyIDContextKey).(session.FamilyID)
	return familyID, ok
}

func bearerToken(r *http.Request) (string, bool) {
	const prefix = "Bearer "
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, prefix) {
		return "", false
	}
	return strings.TrimPrefix(header, prefix), true
}

func writeUnauthenticated(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":{"code":"unauthenticated","message":"token de acesso ausente ou inválido"}}`))
}
