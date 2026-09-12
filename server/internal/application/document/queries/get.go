package documentqueries

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/authz"
	"palimpsesto/internal/application/document/dto"
)

// GetHandler fetches a single document.
type GetHandler struct {
	documents  document.Repository
	membership document.MembershipRepository
}

func NewGetHandler(documents document.Repository, membership document.MembershipRepository) *GetHandler {
	return &GetHandler{documents: documents, membership: membership}
}

// Handle returns a document, but only if the caller is a member — a
// document that exists but the caller can't see comes back as
// ErrNotFound, indistinguishable from one that truly doesn't exist. This
// is deliberate: mere existence isn't public information.
func (h *GetHandler) Handle(ctx context.Context, docID document.ID, caller user.ID) (documentdto.DocumentView, error) {
	if err := authz.RequireMembership(ctx, h.membership, docID, caller); err != nil {
		return documentdto.DocumentView{}, err
	}

	found, err := h.documents.Find(ctx, docID)
	if errors.Is(err, document.ErrNotFound) {
		return documentdto.DocumentView{}, document.ErrNotFound
	}
	if err != nil {
		return documentdto.DocumentView{}, fmt.Errorf("document: finding: %w", err)
	}
	return documentdto.FromDocument(found), nil
}
