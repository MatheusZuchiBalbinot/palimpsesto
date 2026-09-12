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

func ListComments(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		comments, err := documents.ListComments(r.Context(), docID, userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		views := make([]responses.Comment, 0, len(comments))
		for _, comment := range comments {
			views = append(views, responses.FromComment(comment))
		}
		writeJSON(w, http.StatusOK, views)
	}
}

func CreateComment(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))

		var body requests.CreateComment
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		in := documentcommands.CreateCommentInput{DocumentID: docID, AuthorID: userID, Body: body.Body}
		created, err := documents.CreateComment(r.Context(), in)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		writeJSON(w, http.StatusCreated, responses.FromComment(created))
	}
}

func EditComment(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))
		commentID := document.CommentID(r.PathValue("commentId"))

		var body requests.CreateComment
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			responses.WriteError(w, http.StatusBadRequest, "invalid_body", "corpo da requisição inválido")
			return
		}

		in := documentcommands.EditCommentInput{DocumentID: docID, CommentID: commentID, Caller: userID, Body: body.Body}
		if err := documents.EditComment(r.Context(), in); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func ResolveComment(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))
		commentID := document.CommentID(r.PathValue("commentId"))

		if err := documents.ResolveComment(r.Context(), docID, commentID, userID); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func DeleteComment(documents *documentapp.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())
		docID := document.ID(r.PathValue("id"))
		commentID := document.CommentID(r.PathValue("commentId"))

		if err := documents.DeleteComment(r.Context(), docID, commentID, userID); err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}
