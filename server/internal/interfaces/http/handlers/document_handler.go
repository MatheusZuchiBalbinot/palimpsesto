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

const defaultInviteRole = document.RoleEditor

func CreateDocument(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		var body requests.CreateDocument
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		created, err := documents.Create(r.Context(), userID, body.Title)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusCreated, responses.FromDocument(created))
	}
}

func ListDocuments(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		summaries, err := documents.List(r.Context(), userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		views := make([]responses.DocumentSummary, 0, len(summaries))
		for _, summary := range summaries {
			views = append(views, responses.FromSummary(summary))
		}
		writeJSON(w, http.StatusOK, views)
	}
}

// ListArchivedDocuments lists the caller's own deleted documents — the
// vault's "Arquivados" view.
func ListArchivedDocuments(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		summaries, err := documents.ListArchived(r.Context(), userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		views := make([]responses.DocumentSummary, 0, len(summaries))
		for _, summary := range summaries {
			views = append(views, responses.FromSummary(summary))
		}
		writeJSON(w, http.StatusOK, views)
	}
}

func GetDocument(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		found, err := documents.Get(r.Context(), docID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromDocument(found))
	}
}

func UpdateDocument(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		var body requests.UpdateDocument
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		if err := documents.UpdateTitle(r.Context(), docID, userID, body.Title); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func DeleteDocument(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		if err := documents.Delete(r.Context(), docID, userID); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func RestoreDocument(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		if err := documents.Restore(r.Context(), docID, userID); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func ListMembers(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		members, err := documents.ListMembers(r.Context(), docID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		views := make([]responses.Member, 0, len(members))
		for _, member := range members {
			views = append(views, responses.FromMember(member))
		}
		writeJSON(w, http.StatusOK, views)
	}
}

func AddMember(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		var body requests.AddMember
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		role := document.Role(body.Role)
		hasExplicitRole := body.Role != ""
		if !hasExplicitRole {
			role = defaultInviteRole
		}

		wrappedDEK, err := base64.StdEncoding.DecodeString(body.WrappedDEK)
		if err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "wrapped_dek inválido")
			return
		}

		in := documentcommands.AddMemberInput{
			DocumentID: docID,
			Caller:     userID,
			Email:      body.Email,
			Role:       role,
			WrappedDEK: wrappedDEK,
		}
		if err := documents.AddMemberByEmail(r.Context(), in); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// SetMemberWrappedDEK seals the document's DEK for one of its members —
// the owner's own row right after creating the document, or completing
// a pending member's seal.
func SetMemberWrappedDEK(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))
		targetUserID := user.ID(r.PathValue("userId"))

		var body requests.SetWrappedDEK
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		wrappedDEK, err := base64.StdEncoding.DecodeString(body.WrappedDEK)
		if err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "wrapped_dek inválido")
			return
		}

		in := documentcommands.SetMemberWrappedDEKInput{
			DocumentID: docID,
			Caller:     userID,
			TargetUser: targetUserID,
			WrappedDEK: wrappedDEK,
		}
		if err := documents.SetMemberWrappedDEK(r.Context(), in); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// GetWrappedDEK returns the caller's own sealed DEK for a document.
func GetWrappedDEK(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		view, err := documents.GetWrappedDEK(r.Context(), docID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromWrappedDEK(view))
	}
}

// RemoveMember removes a member — either the owner removing someone else,
// which rotates the document's key (docs/CRYPTO.md: "real revocation
// requires rotation"), or a member removing themselves, which doesn't:
// they already had the DEK, so leaving voluntarily has nothing to revoke.
func RemoveMember(documents *documentapp.Service, hub *realtime.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))
		targetUserID := user.ID(r.PathValue("userId"))

		if targetUserID == userID {
			in := documentcommands.LeaveDocumentInput{DocumentID: docID, Caller: userID}
			if err := documents.LeaveDocument(r.Context(), in); err != nil {
				status, code, message := responses.DocumentError(err)
				responses.WriteError(w, status, code, message)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		var body requests.RemoveMember
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		newWraps := make(map[user.ID][]byte, len(body.NewWraps))
		for uid, wrapped := range body.NewWraps {
			decoded, err := base64.StdEncoding.DecodeString(wrapped)
			if err != nil {
				responses.WriteError(w, http.StatusBadRequest, "invalid_body", "new_wraps inválido")
				return
			}
			newWraps[user.ID(uid)] = decoded
		}

		in := documentcommands.RemoveMemberInput{
			DocumentID: docID,
			Caller:     userID,
			TargetUser: targetUserID,
			NewWraps:   newWraps,
		}
		newEpoch, err := documents.RemoveMember(r.Context(), in)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		hub.EvictDocumentMember(docID, targetUserID)
		writeJSON(w, http.StatusOK, responses.RemoveMemberResult{KeyEpoch: newEpoch})
	}
}

// UpdateMemberRole changes a member's role between editor and reader —
// only the owner can call this, and never on themselves. No key material
// changes: a role is pure authorization, not something the DEK's
// encryption depends on.
func UpdateMemberRole(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))
		targetUserID := user.ID(r.PathValue("userId"))

		var body requests.UpdateMemberRole
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		in := documentcommands.UpdateMemberRoleInput{
			DocumentID: docID,
			Caller:     userID,
			TargetUser: targetUserID,
			Role:       document.Role(body.Role),
		}
		if err := documents.UpdateMemberRole(r.Context(), in); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// GetKeyHistory returns the caller's own archived sealed DEKs, from
// before any key rotation they lived through.
func GetKeyHistory(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		history, err := documents.GetKeyHistory(r.Context(), docID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromEpochKeys(history))
	}
}

func ListUpdates(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		updates, err := documents.ListUpdates(r.Context(), docID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		views := make([]responses.Update, 0, len(updates))
		for _, update := range updates {
			views = append(views, responses.FromUpdate(update))
		}
		writeJSON(w, http.StatusOK, views)
	}
}

// CreateSnapshot compacts a document's update log — only an editor
// can (same criterion as writing an update).
func CreateSnapshot(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		var body requests.CreateSnapshot
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		ciphertext, err := base64.StdEncoding.DecodeString(body.Ciphertext)
		if err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "ciphertext inválido")
			return
		}

		in := documentcommands.CreateSnapshotInput{
			DocumentID:   docID,
			Caller:       userID,
			KeyEpoch:     body.KeyEpoch,
			UpToUpdateID: body.UpToUpdateID,
			Ciphertext:   ciphertext,
		}
		created, err := documents.CreateSnapshot(r.Context(), in)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusCreated, responses.FromSnapshot(created))
	}
}

// GetLatestSnapshot returns a document's most recent snapshot.
func GetLatestSnapshot(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		found, err := documents.GetLatestSnapshot(r.Context(), docID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromSnapshot(found))
	}
}
