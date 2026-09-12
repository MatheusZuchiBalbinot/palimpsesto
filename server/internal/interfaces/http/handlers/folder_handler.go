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

func CreateFolder(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		var body requests.CreateFolder
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		in := documentcommands.CreateFolderInput{OwnerID: userID, Name: body.Name, Color: body.Color}
		created, err := documents.CreateFolder(r.Context(), in)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusCreated, responses.FromFolder(created))
	}
}

func ListFolders(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		folders, err := documents.ListFolders(r.Context(), userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromFolders(folders))
	}
}

func UpdateFolder(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		folderID := document.FolderID(r.PathValue("id"))

		var body requests.UpdateFolder
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		in := documentcommands.UpdateFolderInput{ID: folderID, OwnerID: userID, Name: body.Name, Color: body.Color}
		updated, err := documents.UpdateFolder(r.Context(), in)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusOK, responses.FromFolder(updated))
	}
}

func DeleteFolder(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		folderID := document.FolderID(r.PathValue("id"))

		if err := documents.DeleteFolder(r.Context(), folderID, userID); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// SetDocumentFolder files a document under a folder, or clears its
// folder if the body's folder_id is null.
func SetDocumentFolder(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		var body requests.SetDocumentFolder
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		var folderID *document.FolderID
		if body.FolderID != nil {
			fid := document.FolderID(*body.FolderID)
			folderID = &fid
		}

		in := documentcommands.SetDocumentFolderInput{DocumentID: docID, Caller: userID, FolderID: folderID}
		if err := documents.SetDocumentFolder(r.Context(), in); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
