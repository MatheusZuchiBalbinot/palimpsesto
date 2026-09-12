package handlers

import (
	"encoding/json"
	"net/http"

	"palimpsesto/internal/application/document"
	"palimpsesto/internal/application/document/commands"
	"palimpsesto/internal/domain/document"

	"palimpsesto/internal/interfaces/http/middleware"
	"palimpsesto/internal/interfaces/http/requests"
	"palimpsesto/internal/interfaces/http/responses"
)

func GetInviteLink(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		link, err := documents.GetInviteLink(r.Context(), docID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromInviteLink(link))
	}
}

func CreateInviteLink(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		var body requests.CreateInviteLink
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		in := documentcommands.CreateInviteLinkInput{DocumentID: docID, Caller: userID, Role: document.Role(body.Role)}
		link, err := documents.CreateInviteLink(r.Context(), in)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromInviteLink(link))
	}
}

func RevokeInviteLink(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		if err := documents.RevokeInviteLink(r.Context(), docID, userID); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// JoinInviteLink is AddMember's self-service counterpart: presenting a
// valid, non-revoked share link token grants the caller membership
// without the owner needing to know their email ahead of time.
func JoinInviteLink(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		token := document.InviteToken(r.PathValue("token"))

		joined, err := documents.JoinViaInviteLink(r.Context(), token, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromDocument(joined))
	}
}
