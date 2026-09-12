package handlers

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"

	"palimpsesto/internal/application/document"
	"palimpsesto/internal/application/user"
	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
	"palimpsesto/internal/infrastructure/realtime"

	"palimpsesto/internal/interfaces/http/responses"
)

// readIdleTimeout closes a connection that's gone quiet — clients are
// expected to ping every 30s (docs/API.md); this gives them some
// margin.
const readIdleTimeout = 60 * time.Second

// maxWSMessageBytes caps a single websocket message (a client frame or
// presence text) — generous even for a large paste, small enough to
// stop a hostile client from forcing the server to buffer something
// huge.
const maxWSMessageBytes = 4 * 1024 * 1024

// wsTokenSubprotocolPrefix is how the access token travels in the
// WebSocket handshake — browsers can't set custom headers on it, so
// Sec-WebSocket-Protocol (RFC 6455 §1.9) is the only channel available
// for out-of-band auth data. Never the query string: that leaks into
// proxy logs and browser history.
const wsTokenSubprotocolPrefix = "access_token."

// WebSocket upgrades to websocket after checking membership — never the
// other way around. "server validates membership before upgrade; no
// permission, 403 and no connection" (docs/API.md).
func WebSocket(logger *slog.Logger, users *userapp.Service, documents *documentapp.Service, hub *realtime.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, docID, subprotocol, isAuthenticated := authenticateWSRequest(w, r, users, documents)
		if !isAuthenticated {
			return
		}

		if !hub.AcquireConnectionSlot(userID) {
			responses.WriteError(w, http.StatusTooManyRequests, "too_many_connections", "muitas conexões abertas para esta conta")
			return
		}
		defer hub.ReleaseConnectionSlot(userID)

		since := parseSince(r.URL.Query().Get("since"))

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			Subprotocols: []string{subprotocol},
		})
		if err != nil {
			return // Accept already wrote the response.
		}
		defer func() { _ = conn.CloseNow() }()
		// Explicit, not the library's 32KiB default — a Yjs update can
		// legitimately be a large paste. Generous enough for that, and
		// still nowhere near uint32's range (realtime/hub.go's frame-size
		// field depends on this limit).
		conn.SetReadLimit(maxWSMessageBytes)

		client := hub.Join(r.Context(), docID, userID, conn)
		defer hub.Leave(client)

		replayHistory(r.Context(), documents, hub, client, docID, since)
		sendJoined(r.Context(), hub, client)

		runReadLoop(r.Context(), logger, documents, hub, client, conn)
	}
}

// authenticateWSRequest validates the access token and document
// membership before any websocket handshake happens. Returns exactly
// the subprotocol value the client offered, to be echoed back in
// AcceptOptions so the handshake completes per spec.
func authenticateWSRequest(w http.ResponseWriter, r *http.Request, users *userapp.Service, documents *documentapp.Service) (user.ID, document.ID, string, bool) {
	subprotocol, token, ok := extractWSToken(r)
	if !ok {
		writeWSUnauthenticated(w)
		return "", "", "", false
	}

	userID, _, err := users.ParseAccessToken(token)
	if err != nil {
		writeWSUnauthenticated(w)
		return "", "", "", false
	}

	docIDParam := r.URL.Query().Get("doc")
	if docIDParam == "" {
		responses.WriteError(w, http.StatusBadRequest, "invalid_request", "parâmetro doc ausente")
		return "", "", "", false
	}
	docID := document.ID(docIDParam)

	isMember, err := documents.IsMember(r.Context(), docID, userID)
	if err != nil {
		responses.WriteError(w, http.StatusInternalServerError, "internal_error", "erro interno")
		return "", "", "", false
	}
	if !isMember {
		responses.WriteError(w, http.StatusForbidden, "not_member", "você não é membro deste documento")
		return "", "", "", false
	}

	return userID, docID, subprotocol, true
}

// extractWSToken extracts access_token.<token> from
// Sec-WebSocket-Protocol, a comma-separated list per RFC 6455.
func extractWSToken(r *http.Request) (subprotocol, token string, ok bool) {
	for _, raw := range strings.Split(r.Header.Get("Sec-WebSocket-Protocol"), ",") {
		candidate := strings.TrimSpace(raw)
		if strings.HasPrefix(candidate, wsTokenSubprotocolPrefix) {
			return candidate, strings.TrimPrefix(candidate, wsTokenSubprotocolPrefix), true
		}
	}
	return "", "", false
}

func writeWSUnauthenticated(w http.ResponseWriter) {
	responses.WriteError(w, http.StatusUnauthorized, "unauthenticated", "token de acesso ausente ou inválido")
}

func parseSince(raw string) uint64 {
	since, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0
	}
	return since
}

// replayHistory sends every update since the client's last known ID —
// what makes reconnecting after 30s offline converge instead of
// dropping updates. Uses the blocking send: a document with more
// history than the per-client send buffer used to mean the replay
// silently dropped whatever didn't fit, corrupting a freshly-joined
// client's view of the document instead of just briefly delaying its
// update.
func replayHistory(ctx context.Context, documents *documentapp.Service, hub *realtime.Hub, client *realtime.Client, docID document.ID, since uint64) {
	history, err := documents.UpdatesSince(ctx, docID, since)
	if err != nil {
		return
	}

	for _, update := range history {
		authorBytes, err := realtime.ParseUUID(string(update.AuthorID))
		if err != nil {
			continue
		}
		if err := hub.SendUpdateBlocking(ctx, client, update.ID, authorBytes, update.Payload); err != nil {
			return
		}
	}
}

// sendJoined sends the snapshot of who's already on the document.
// Blocking the same way replayHistory is: it's queued right after a
// potentially large history replay on the same buffer, and was exactly
// the frame a full buffer used to silently drop — a client that never
// finds out anyone else is there, even though everyone else correctly
// finds out about them.
func sendJoined(ctx context.Context, hub *realtime.Hub, client *realtime.Client) {
	memberIDs := hub.MemberIDs(client)
	members := make([]string, 0, len(memberIDs))
	for _, id := range memberIDs {
		members = append(members, string(id))
	}

	msg, err := json.Marshal(realtime.NewJoinedMessage(members))
	if err != nil {
		return
	}
	_ = hub.SendTextBlocking(ctx, client, msg)
}

// runReadLoop is the connection's main loop: read a frame, act on it,
// repeat until the connection errors or goes idle.
func runReadLoop(ctx context.Context, logger *slog.Logger, documents *documentapp.Service, hub *realtime.Hub, client *realtime.Client, conn *websocket.Conn) {
	for {
		readCtx, cancel := context.WithTimeout(ctx, readIdleTimeout)
		typ, data, err := conn.Read(readCtx)
		cancel()
		if err != nil {
			return
		}

		switch typ {
		case websocket.MessageBinary:
			handleBinaryFrame(ctx, logger, documents, hub, client, data)
		case websocket.MessageText:
			handleTextFrame(hub, client, data)
		}
	}
}

func handleBinaryFrame(ctx context.Context, logger *slog.Logger, documents *documentapp.Service, hub *realtime.Hub, client *realtime.Client, data []byte) {
	payload, isValidFrame := realtime.DecodeClientFrame(data)
	if !isValidFrame {
		return
	}

	updateID, err := documents.AppendUpdate(ctx, client.DocID, client.UserID, payload)
	if err != nil {
		logger.Error("persisting update failed", "doc_id", client.DocID, "err", err)
		sendUpdateRejected(hub, client)
		return
	}

	authorBytes, err := realtime.ParseUUID(string(client.UserID))
	if err != nil {
		return
	}
	hub.BroadcastUpdate(client, updateID, authorBytes, payload)
}

// sendUpdateRejected tells the sender their update wasn't persisted or
// broadcast — without this the client believes an update was applied
// when it actually wasn't, and diverges from the rest of the document
// without anyone noticing.
func sendUpdateRejected(hub *realtime.Hub, client *realtime.Client) {
	msg, err := json.Marshal(realtime.NewErrorMessage(realtime.ErrorCodeUpdateRejected))
	if err != nil {
		return
	}
	hub.SendText(client, msg)
}

// handleTextFrame relays control messages (presence) as-is — the server
// doesn't need to understand a cursor position any more than it needs
// to understand a CRDT update.
func handleTextFrame(hub *realtime.Hub, client *realtime.Client, data []byte) {
	var msg realtime.ControlMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	isPresenceMessage := msg.Type == realtime.MessageTypePresence
	if isPresenceMessage {
		hub.BroadcastText(client, data)
	}
}
