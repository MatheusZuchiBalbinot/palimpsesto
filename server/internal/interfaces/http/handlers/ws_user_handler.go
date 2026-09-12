package handlers

import (
	"context"
	"net/http"

	"github.com/coder/websocket"

	"palimpsesto/internal/application/user"
	"palimpsesto/internal/infrastructure/realtime"

	"palimpsesto/internal/interfaces/http/responses"
)

// maxUserWSMessageBytes caps incoming frames on the per-user
// notification channel — it expects nothing from the client but a
// periodic ping, so this is far smaller than the document channel's
// maxWSMessageBytes.
const maxUserWSMessageBytes = 4 * 1024

// UserWebSocket is the per-user notification channel: one connection per
// browser tab, opened once at app-shell level rather than per document,
// carrying nothing but "something changed, go refetch" signals (e.g. a
// new pending invite — see realtime.InvitesChangedMessage). It needs no
// membership check like /api/ws does, only authentication: this channel
// never carries document content.
func UserWebSocket(users *userapp.Service, hub *realtime.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		subprotocol, token, ok := extractWSToken(r)
		if !ok {
			writeWSUnauthenticated(w)
			return
		}

		userID, _, err := users.ParseAccessToken(token)
		if err != nil {
			writeWSUnauthenticated(w)
			return
		}

		if !hub.AcquireConnectionSlot(userID) {
			responses.WriteError(w, http.StatusTooManyRequests, "too_many_connections", "muitas conexões abertas para esta conta")
			return
		}
		defer hub.ReleaseConnectionSlot(userID)

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			Subprotocols: []string{subprotocol},
		})
		if err != nil {
			return // Accept already wrote the response.
		}
		defer func() { _ = conn.CloseNow() }()
		conn.SetReadLimit(maxUserWSMessageBytes)

		client := hub.JoinUser(r.Context(), userID, conn)
		defer hub.LeaveUser(client)

		runUserReadLoop(r.Context(), conn)
	}
}

// runUserReadLoop discards every incoming frame — this channel expects
// nothing from the client but a periodic ping to keep the connection (and
// any idle-timeout middlebox) alive. Reading is still necessary: it's
// what notices the connection closing and unwinds the handler so
// hub.LeaveUser runs.
func runUserReadLoop(ctx context.Context, conn *websocket.Conn) {
	for {
		readCtx, cancel := context.WithTimeout(ctx, readIdleTimeout)
		_, _, err := conn.Read(readCtx)
		cancel()
		if err != nil {
			return
		}
	}
}
