// Package httpapi assembles the HTTP interface: routes, middleware chain
// and handler wiring. It is the only layer that imports net/http besides
// the handlers/middleware subpackages it composes.
package httpapi

import (
	"log/slog"
	"net/http"

	"palimpsesto/internal/application/document"
	"palimpsesto/internal/application/user"
	"palimpsesto/internal/infrastructure/realtime"

	"palimpsesto/internal/interfaces/http/handlers"
	"palimpsesto/internal/interfaces/http/middleware"
)

// authRateLimitPerMinute and authRateLimitBurst limit requests per client
// IP for login/register — a stolen or guessed credential still needs to
// survive brute force, not just the cost of Argon2id.
const (
	authRateLimitPerMinute = 10
	authRateLimitBurst     = 5
)

// wsRateLimitPerMinute and wsRateLimitBurst limit websocket handshake
// attempts per client IP — each one costs a JWT parse and (for /api/ws) a
// membership query, so it's cheaper to flood than the auth endpoints but
// still not free.
const (
	wsRateLimitPerMinute = 120
	wsRateLimitBurst     = 20
)

// NewRouter assembles the fully wired HTTP handler: routes,
// authentication, rate limiting and the request-id/logging/recover
// middleware chain.
func NewRouter(logger *slog.Logger, db handlers.Pinger, users *userapp.Service, documents *documentapp.Service, hub *realtime.Hub) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handlers.Health(db))

	authLimit := middleware.RateLimit(authRateLimitPerMinute, authRateLimitBurst)
	mux.Handle("POST /api/auth/register", authLimit(handlers.Register(users)))
	mux.Handle("POST /api/auth/login", authLimit(handlers.Login(users)))
	mux.Handle("GET /api/auth/salt", authLimit(handlers.GetSalt(users)))
	mux.Handle("POST /api/auth/refresh", authLimit(handlers.Refresh(users)))
	mux.Handle("POST /api/auth/logout", authLimit(handlers.Logout(users)))

	protected := middleware.RequireAuth(users)
	wsLimit := middleware.RateLimit(wsRateLimitPerMinute, wsRateLimitBurst)
	mux.Handle("POST /api/auth/change-password", protected(handlers.ChangePassword(users)))
	mux.Handle("PATCH /api/users/me", protected(handlers.UpdateProfile(users)))
	mux.Handle("POST /api/users/me/keys", protected(handlers.SetPublicKeys(users)))
	mux.Handle("GET /api/users/me/keys", protected(handlers.GetOwnPublicKeys(users)))
	mux.Handle("POST /api/users/me/private-keys", protected(handlers.SetWrappedPrivateKeys(users)))
	mux.Handle("GET /api/users/me/private-keys", protected(handlers.GetOwnWrappedPrivateKeys(users)))
	mux.Handle("GET /api/users/lookup", protected(authLimit(handlers.LookupUser(users))))
	mux.Handle("GET /api/users/{id}/keys", protected(handlers.GetPublicKeysByID(users)))
	mux.Handle("GET /api/users/me/devices", protected(handlers.ListDevices(users)))
	mux.Handle("DELETE /api/users/me/devices/{familyId}", protected(handlers.RevokeDevice(users)))

	mux.Handle("POST /api/docs", protected(handlers.CreateDocument(documents)))
	mux.Handle("GET /api/docs", protected(handlers.ListDocuments(documents)))
	mux.Handle("GET /api/docs/active", protected(handlers.ActiveDocuments(documents, hub)))
	mux.Handle("GET /api/docs/archived", protected(handlers.ListArchivedDocuments(documents)))
	mux.Handle("GET /api/docs/{id}", protected(handlers.GetDocument(documents)))
	mux.Handle("PATCH /api/docs/{id}", protected(handlers.UpdateDocument(documents)))
	mux.Handle("DELETE /api/docs/{id}", protected(handlers.DeleteDocument(documents)))
	mux.Handle("POST /api/docs/{id}/restore", protected(handlers.RestoreDocument(documents)))
	mux.Handle("GET /api/docs/{id}/members", protected(handlers.ListMembers(documents)))
	mux.Handle("POST /api/docs/{id}/members", protected(handlers.AddMember(documents)))
	mux.Handle("GET /api/docs/{id}/wrapped-dek", protected(handlers.GetWrappedDEK(documents)))
	mux.Handle("POST /api/docs/{id}/members/{userId}/wrapped-dek", protected(handlers.SetMemberWrappedDEK(documents)))
	mux.Handle("DELETE /api/docs/{id}/members/{userId}", protected(handlers.RemoveMember(documents, hub)))
	mux.Handle("PATCH /api/docs/{id}/members/{userId}", protected(handlers.UpdateMemberRole(documents)))
	mux.Handle("GET /api/docs/{id}/key-history", protected(handlers.GetKeyHistory(documents)))
	mux.Handle("GET /api/docs/{id}/updates", protected(handlers.ListUpdates(documents)))
	mux.Handle("POST /api/docs/{id}/snapshots", protected(handlers.CreateSnapshot(documents)))
	mux.Handle("GET /api/docs/{id}/snapshots/latest", protected(handlers.GetLatestSnapshot(documents)))
	mux.Handle("GET /api/docs/{id}/invite-link", protected(handlers.GetInviteLink(documents)))
	mux.Handle("POST /api/docs/{id}/invite-link", protected(handlers.CreateInviteLink(documents)))
	mux.Handle("DELETE /api/docs/{id}/invite-link", protected(handlers.RevokeInviteLink(documents)))
	mux.Handle("POST /api/invite-links/{token}/join", protected(handlers.JoinInviteLink(documents)))
	mux.Handle("GET /api/docs/{id}/comments", protected(handlers.ListComments(documents)))
	mux.Handle("POST /api/docs/{id}/comments", protected(handlers.CreateComment(documents)))
	mux.Handle("PATCH /api/docs/{id}/comments/{commentId}", protected(handlers.EditComment(documents)))
	mux.Handle("POST /api/docs/{id}/comments/{commentId}/resolve", protected(handlers.ResolveComment(documents)))
	mux.Handle("DELETE /api/docs/{id}/comments/{commentId}", protected(handlers.DeleteComment(documents)))
	mux.Handle("PATCH /api/docs/{id}/folder", protected(handlers.SetDocumentFolder(documents)))

	mux.Handle("POST /api/folders", protected(handlers.CreateFolder(documents)))
	mux.Handle("GET /api/folders", protected(handlers.ListFolders(documents)))
	mux.Handle("PATCH /api/folders/{id}", protected(handlers.UpdateFolder(documents)))
	mux.Handle("DELETE /api/folders/{id}", protected(handlers.DeleteFolder(documents)))

	mux.Handle("POST /api/docs/{id}/invites", protected(handlers.CreateInvite(documents, hub)))
	mux.Handle("GET /api/docs/{id}/invites", protected(handlers.ListInvitesForDocument(documents)))
	mux.Handle("DELETE /api/docs/{id}/invites/{inviteId}", protected(handlers.CancelInvite(documents, hub)))
	mux.Handle("GET /api/invites", protected(handlers.ListInvites(documents)))
	mux.Handle("POST /api/invites/{id}/accept", protected(handlers.AcceptInvite(documents, hub)))
	mux.Handle("DELETE /api/invites/{id}", protected(handlers.DeclineInvite(documents, hub)))

	// The websocket handshake authenticates itself (the token is in the
	// query string, not in a header a browser WebSocket client can set) —
	// see handlers.WebSocket. It does not sit behind the RequireAuth
	// middleware.
	mux.Handle("GET /api/ws", wsLimit(handlers.WebSocket(logger, users, documents, hub)))
	// Same self-authenticating handshake, but account-wide rather than
	// document-scoped — see handlers.UserWebSocket.
	mux.Handle("GET /api/ws/user", wsLimit(handlers.UserWebSocket(users, hub)))

	return middleware.Chain(mux,
		middleware.RequestID,
		middleware.Logging(logger),
		middleware.Recover(logger),
	)
}
