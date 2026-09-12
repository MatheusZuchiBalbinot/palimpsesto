package realtime

// Message type tags for the control-message (text frame) side of the
// websocket protocol — see docs/API.md. Binary frames are the separate
// CRDT update channel and never go through any of this.
const (
	MessageTypeJoined         = "joined"
	MessageTypeMemberJoined   = "member_joined"
	MessageTypeMemberLeft     = "member_left"
	MessageTypePresence       = "presence"
	MessageTypePing           = "ping"
	MessageTypeError          = "error"
	MessageTypeInvitesChanged = "invites_changed"
)

// ErrorCodeUpdateRejected is the only error code the server currently
// emits over the control channel — an update that failed to be persisted
// or broadcast.
const ErrorCodeUpdateRejected = "update_rejected"

// ControlMessage is the minimal shape every incoming text frame is first
// decoded into, just enough to dispatch on Type before decoding the rest.
type ControlMessage struct {
	Type string `json:"t"`
}

// JoinedMessage is sent once, to a client right after it connects: a
// snapshot of everyone already on the document.
type JoinedMessage struct {
	Type    string   `json:"t"`
	Members []string `json:"members"`
}

func NewJoinedMessage(members []string) JoinedMessage {
	return JoinedMessage{Type: MessageTypeJoined, Members: members}
}

// MemberJoinedMessage and MemberLeftMessage are broadcast to everyone
// already connected when a member arrives or leaves — see Join and Leave
// in hub.go.
type MemberJoinedMessage struct {
	Type   string `json:"t"`
	UserID string `json:"user_id"`
}

func NewMemberJoinedMessage(userID string) MemberJoinedMessage {
	return MemberJoinedMessage{Type: MessageTypeMemberJoined, UserID: userID}
}

type MemberLeftMessage struct {
	Type   string `json:"t"`
	UserID string `json:"user_id"`
}

func NewMemberLeftMessage(userID string) MemberLeftMessage {
	return MemberLeftMessage{Type: MessageTypeMemberLeft, UserID: userID}
}

// PresenceMessage carries an opaque update from the Yjs awareness
// protocol (base64) — who's online and where each cursor is. The server
// relays it verbatim, just as it never looks inside a CRDT update.
type PresenceMessage struct {
	Type      string `json:"t"`
	Awareness string `json:"awareness"`
}

// ErrorMessage reports something the server failed to do with a client
// frame — e.g. ErrorCodeUpdateRejected when persistence failed.
type ErrorMessage struct {
	Type string `json:"t"`
	Code string `json:"code"`
}

func NewErrorMessage(code string) ErrorMessage {
	return ErrorMessage{Type: MessageTypeError, Code: code}
}

// InvitesChangedMessage is pushed on the per-user notification channel
// whenever one of the recipient's pending invites is created, accepted,
// declined, or cancelled. Deliberately carries nothing about the invite
// itself — same "dumb mail carrier" reasoning as everywhere else in this
// package: it's a nudge to refetch (GET /api/invites or
// /api/docs/{id}/invites), not a copy of the data.
type InvitesChangedMessage struct {
	Type string `json:"t"`
}

func NewInvitesChangedMessage() InvitesChangedMessage {
	return InvitesChangedMessage{Type: MessageTypeInvitesChanged}
}
