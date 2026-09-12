package handlers

import (
	"net/http"

	"palimpsesto/internal/application/document"
	"palimpsesto/internal/application/document/dto"
	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
	"palimpsesto/internal/infrastructure/realtime"

	"palimpsesto/internal/interfaces/http/middleware"
	"palimpsesto/internal/interfaces/http/responses"
)

// ActiveDocuments reports which of the caller's own documents have
// someone connected right now, and who — the document list's "so-and-so
// is editing this right now" indicator, without the client needing to
// open a websocket per document just to find out. Scoped to
// documents.List (with membership checking) so it can only answer for
// documents the caller can already see.
func ActiveDocuments(documents *documentapp.Service, hub *realtime.Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := middleware.UserIDFromContext(r.Context())

		summaries, err := documents.List(r.Context(), userID)
		if err != nil {
			status, code, message := responses.DocumentError(err)
			responses.WriteError(w, status, code, message)
			return
		}

		candidates := make([]document.ID, 0, len(summaries))
		for _, summary := range summaries {
			candidates = append(candidates, summary.ID)
		}

		activeUserIDs := hub.ActiveDocumentUsers(candidates)

		result := make([]responses.ActiveDocument, 0, len(activeUserIDs))
		for docID, connectedIDs := range activeUserIDs {
			members, err := documents.ListMembers(r.Context(), docID, userID)
			if err != nil {
				// Best-effort: skip a document whose member list we can't
				// resolve right now instead of failing the whole response
				// over one document's presence.
				continue
			}

			users := activeMembersFor(connectedIDs, members)
			if len(users) > 0 {
				result = append(result, responses.ActiveDocument{DocumentID: string(docID), Users: users})
			}
		}

		writeJSON(w, http.StatusOK, responses.ActiveDocuments{Documents: result})
	}
}

// activeMembersFor resolves connectedIDs (raw user ids from the Hub,
// which knows nothing about display names) against members (the
// document's full membership, which does) — deduplicated, since the
// same person can have the document open in two tabs.
func activeMembersFor(connectedIDs []user.ID, members []documentdto.MemberView) []responses.Member {
	seen := make(map[user.ID]struct{}, len(connectedIDs))
	users := make([]responses.Member, 0, len(connectedIDs))
	for _, id := range connectedIDs {
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}

		for _, m := range members {
			if m.UserID == id {
				users = append(users, responses.FromMember(m))
				break
			}
		}
	}
	return users
}
