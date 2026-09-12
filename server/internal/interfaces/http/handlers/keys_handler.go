package handlers

import (
	"encoding/base64"
	"encoding/json"
	"net/http"

	"palimpsesto/internal/application/user"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/interfaces/http/middleware"
	"palimpsesto/internal/interfaces/http/requests"
	"palimpsesto/internal/interfaces/http/responses"
)

// SetPublicKeys publishes the caller's identity keys — generated
// client-side; the server never sees a private key here.
func SetPublicKeys(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		var body requests.SetPublicKeys
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		identityPub, err := base64.StdEncoding.DecodeString(body.IdentityPub)
		if err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "identity_pub inválido")
			return
		}
		signingPub, err := base64.StdEncoding.DecodeString(body.SigningPub)
		if err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "signing_pub inválido")
			return
		}

		keys := user.PublicKeys{IdentityPub: identityPub, SigningPub: signingPub}
		if err := users.SetPublicKeys(r.Context(), userID, keys); err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// GetOwnPublicKeys returns the caller's own published keys — the
// profile page's "show my sigil".
func GetOwnPublicKeys(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		view, err := users.GetPublicKeys(r.Context(), userID)
		if err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromPublicKeys(view))
	}
}

// GetPublicKeysByID returns any user's published public keys by ID —
// what a client needs to verify an Ed25519 update signature after an
// author stops being a document member and so no longer shows up in
// ListMembers (a member can be removed at any time; their past updates
// still need to stay verifiable). Same info a document's member list,
// an update's author_id, or LookupUser's by-email form already expose
// to any authenticated caller — nothing new leaks by also indexing by
// ID.
func GetPublicKeysByID(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		targetID := user.ID(r.PathValue("id"))

		view, err := users.GetPublicKeys(r.Context(), targetID)
		if err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromPublicKeys(view))
	}
}

// LookupUser resolves an email to its public keys — what a client
// needs before it can seal a document's DEK for a new collaborator.
func LookupUser(users *userapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		email := user.Email(r.URL.Query().Get("email"))
		if email == "" {
			responses.WriteError(w, http.StatusBadRequest, "invalid_request", "parâmetro email é obrigatório")
			return
		}

		view, err := users.LookupUser(r.Context(), email)
		if err != nil {
			status, code, message := responses.UserError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromPublicKeys(view))
	}
}
