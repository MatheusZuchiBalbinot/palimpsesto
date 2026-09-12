package handlers

import (
	"encoding/base64"
	"encoding/json"
	"net/http"

	"palimpsesto/internal/application/document"
	"palimpsesto/internal/application/document/commands"
	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
	"palimpsesto/internal/infrastructure/realtime"

	"palimpsesto/internal/interfaces/http/middleware"
	"palimpsesto/internal/interfaces/http/requests"
	"palimpsesto/internal/interfaces/http/responses"
)

// notifyInvitesChanged pushes a nudge on userID's per-user notification
// channel — see realtime.InvitesChangedMessage. A best-effort send: if
// json.Marshal somehow fails (it never does for this fixed shape) there's
// simply nothing to push, not an error worth surfacing to the HTTP
// caller whose own request already succeeded.
func notifyInvitesChanged(hub *realtime.Hub, userID user.ID) {
	msg, err := json.Marshal(realtime.NewInvitesChangedMessage())
	if err != nil {
		return
	}
	hub.NotifyUser(userID, msg)
}

// CreateInvite invites a user by email — pending until they accept
// (the vault's "Convites" view), unlike AddMember's immediate access.
func CreateInvite(documents *documentapp.Service, hub *realtime.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		var body requests.CreateInvite
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		role := document.Role(body.Role)
		if body.Role == "" {
			role = defaultInviteRole
		}

		wrappedDEK, err := base64.StdEncoding.DecodeString(body.WrappedDEK)
		if err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "wrapped_dek inválido")
			return
		}

		in := documentcommands.CreateInviteInput{DocumentID: docID, Caller: userID, Email: body.Email, Role: role, WrappedDEK: wrappedDEK}
		created, err := documents.CreateInvite(r.Context(), in)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		notifyInvitesChanged(hub, created.InviteeID)
		writeJSON(w, http.StatusCreated, responses.FromInvite(created))
	}
}

// ListInvites lists the caller's own pending invites — the vault's
// "Convites" view.
func ListInvites(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		invites, err := documents.ListInvites(r.Context(), userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromInvites(invites))
	}
}

// ListInvitesForDocument lists the pending invites sent out for a
// document — the Share modal's "convites enviados" list.
func ListInvitesForDocument(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		invites, err := documents.ListInvitesForDocument(r.Context(), docID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromInvites(invites))
	}
}

// CancelInvite removes a pending invite from the sender's side — any
// member of the document can cancel one, unlike DeclineInvite which only
// the invitee can call.
func CancelInvite(documents *documentapp.Service, hub *realtime.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		inviteID := document.InviteID(r.PathValue("inviteId"))

		cancelled, err := documents.CancelInvite(r.Context(), inviteID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		notifyInvitesChanged(hub, cancelled.InviteeID)
		w.WriteHeader(http.StatusNoContent)
	}
}

// AcceptInvite converts a pending invite into real membership.
func AcceptInvite(documents *documentapp.Service, hub *realtime.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		inviteID := document.InviteID(r.PathValue("id"))

		accepted, err := documents.AcceptInvite(r.Context(), inviteID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		notifyInvitesChanged(hub, accepted.InviterID)
		w.WriteHeader(http.StatusNoContent)
	}
}

// DeclineInvite removes a pending invite the invitee doesn't want.
func DeclineInvite(documents *documentapp.Service, hub *realtime.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		inviteID := document.InviteID(r.PathValue("id"))

		declined, err := documents.DeclineInvite(r.Context(), inviteID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		notifyInvitesChanged(hub, declined.InviterID)
		w.WriteHeader(http.StatusNoContent)
	}
}
