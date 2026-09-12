package documentdto

import (
	"time"

	"palimpsesto/internal/domain/document"
)

// InviteLinkView is a document's share link, as returned to the owner
// managing it.
type InviteLinkView struct {
	Token     document.InviteToken
	Role      document.Role
	CreatedAt time.Time
}

func FromInviteLink(l document.InviteLink) InviteLinkView {
	return InviteLinkView{Token: l.Token, Role: l.Role, CreatedAt: l.CreatedAt}
}
