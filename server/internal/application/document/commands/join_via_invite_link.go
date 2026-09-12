package documentcommands

import (
	"context"
	"errors"
	"fmt"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"

	"palimpsesto/internal/application/document/dto"
)

// JoinViaInviteLinkHandler grants the caller membership by presenting a
// document's share link token — the self-service counterpart to being
// invited by email.
type JoinViaInviteLinkHandler struct {
	documents   document.Repository
	membership  document.MembershipRepository
	inviteLinks document.InviteLinkRepository
}

func NewJoinViaInviteLinkHandler(documents document.Repository, membership document.MembershipRepository, inviteLinks document.InviteLinkRepository) *JoinViaInviteLinkHandler {
	return &JoinViaInviteLinkHandler{documents: documents, membership: membership, inviteLinks: inviteLinks}
}

// Handle resolves token to a document and adds the caller as a member in
// the link's role. Already being a member (owner or not) isn't an
// error — opening your own share link again simply takes you to the
// document.
func (h *JoinViaInviteLinkHandler) Handle(ctx context.Context, token document.InviteToken, caller user.ID) (documentdto.DocumentView, error) {
	link, err := h.inviteLinks.FindByToken(ctx, token)
	if errors.Is(err, document.ErrInviteLinkNotFound) {
		return documentdto.DocumentView{}, document.ErrInviteLinkNotFound
	}
	if err != nil {
		return documentdto.DocumentView{}, fmt.Errorf("document: resolving invite token: %w", err)
	}

	isAlreadyMember, err := h.membership.IsMember(ctx, link.DocumentID, caller)
	if err != nil {
		return documentdto.DocumentView{}, fmt.Errorf("document: checking membership: %w", err)
	}

	if !isAlreadyMember {
		newMember := document.NewMemberInput{DocumentID: link.DocumentID, UserID: caller, Role: link.Role}
		err := h.membership.AddMember(ctx, newMember)
		isRaceWithAnotherJoin := errors.Is(err, document.ErrAlreadyAdded)
		if err != nil && !isRaceWithAnotherJoin {
			return documentdto.DocumentView{}, fmt.Errorf("document: joining via invite link: %w", err)
		}
	}

	found, err := h.documents.Find(ctx, link.DocumentID)
	if err != nil {
		return documentdto.DocumentView{}, fmt.Errorf("document: finding joined document: %w", err)
	}
	return documentdto.FromDocument(found), nil
}
