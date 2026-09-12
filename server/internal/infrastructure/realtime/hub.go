// Package realtime distributes the CRDT update bytes to every connection
// of a document, and nothing else — it never inspects the content of a
// frame. See docs/ARCHITECTURE.md: the server is a "dumb mail carrier with
// a doorman".
package realtime

import (
	"context"
	"encoding/binary"
	"encoding/json"

	"github.com/coder/websocket"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// Hub owns every Room, indexed by document ID, plus a second set of
// rooms indexed by user ID for the per-user notification channel (every
// browser tab the same user has open joins the same room). A room is
// created on first join and removed when its last client leaves.
type Hub struct {
	roomsByDoc  roomRegistry
	roomsByUser userRegistry
	conns       connLimiter
}

func NewHub() *Hub {
	return &Hub{roomsByDoc: newRoomRegistry(), roomsByUser: newUserRegistry(), conns: newConnLimiter()}
}

// AcquireConnectionSlot reports whether userID is under
// maxConnectionsPerUser, reserving a slot if so. Callers that get false
// must reject the connection (never call Join/JoinUser) instead of
// proceeding; every true result must be paired with exactly one
// ReleaseConnectionSlot call once that connection ends.
func (h *Hub) AcquireConnectionSlot(userID user.ID) bool {
	return h.conns.acquire(userID)
}

// ReleaseConnectionSlot frees a slot reserved by AcquireConnectionSlot.
func (h *Hub) ReleaseConnectionSlot(userID user.ID) {
	h.conns.release(userID)
}

// Join registers conn as a new client in docID's room, starts its write
// pump, notifies whoever is already there that a new member has arrived,
// and returns the Client handle — callers use it to read incoming frames
// and to call Leave when the connection ends.
func (h *Hub) Join(ctx context.Context, docID document.ID, userID user.ID, conn *websocket.Conn) *Client {
	client := newClient(userID, docID, conn)
	room := h.roomsByDoc.getOrCreate(docID)
	room.join(client)
	go client.runWritePump(ctx)

	notice, err := json.Marshal(NewMemberJoinedMessage(string(userID)))
	if err == nil {
		room.broadcastText(notice, client)
	}

	return client
}

// Leave removes a client from its room and notifies whoever remains that
// it left. Removes the room entirely once it becomes empty.
func (h *Hub) Leave(client *Client) {
	room := h.roomsByDoc.getOrCreate(client.DocID)
	room.leave(client)

	notice, err := json.Marshal(NewMemberLeftMessage(string(client.UserID)))
	if err == nil {
		room.broadcastText(notice, nil)
	}

	h.roomsByDoc.dropIfEmpty(client.DocID, room)
}

// JoinUser registers conn on userID's personal notification channel —
// distinct from Join/Leave's document rooms, this one carries no
// document-scoped chatter, only account-wide signals (e.g. "your pending
// invites changed"). Every tab the same user has open joins the same
// room, so a single NotifyUser reaches all of them at once.
func (h *Hub) JoinUser(ctx context.Context, userID user.ID, conn *websocket.Conn) *Client {
	client := newClient(userID, "", conn)
	room := h.roomsByUser.getOrCreate(userID)
	room.join(client)
	go client.runWritePump(ctx)
	return client
}

// LeaveUser removes client from its owner's notification channel,
// dropping the room once the user has no tab left connected.
func (h *Hub) LeaveUser(client *Client) {
	room := h.roomsByUser.getOrCreate(client.UserID)
	room.leave(client)
	h.roomsByUser.dropIfEmpty(client.UserID, room)
}

// NotifyUser pushes a text frame to every tab userID currently has open
// on their notification channel. A no-op if they have none open right
// now — same as any other "eventually consistent" push, they'll see
// the change next time they load the page anyway.
func (h *Hub) NotifyUser(userID user.ID, data []byte) {
	room, ok := h.roomsByUser.get(userID)
	if !ok {
		return
	}
	room.broadcastText(data, nil)
}

// EvictDocumentMember force-closes every connection userID currently has
// open on docID — called right after RemoveMemberAndRotate, so a removed
// member's already-open sockets are cut immediately instead of
// continuing to receive broadcasts (opaque under the new key epoch, but
// still a gap in "revocation is immediate") until they disconnect on
// their own. A no-op if the room doesn't exist or userID isn't connected
// to it.
func (h *Hub) EvictDocumentMember(docID document.ID, userID user.ID) {
	room, ok := h.roomsByDoc.get(docID)
	if !ok {
		return
	}
	room.evictUser(userID)
	h.roomsByDoc.dropIfEmpty(docID, room)
}

// MemberIDs lists who else is connected to the same document as client.
func (h *Hub) MemberIDs(client *Client) []user.ID {
	room := h.roomsByDoc.getOrCreate(client.DocID)
	return room.memberIDs(client)
}

// ActiveDocumentUsers reports, for each of the candidates that currently
// has someone connected, who — indexed by document ID, with the value
// being the user id of each connected client (a user with two tabs open
// on the same document appears twice; callers that only care about
// presence, not count, should deduplicate). Lets a caller show "so-and-so
// is editing this document" in a list without opening a socket per
// document to find out. Deliberately takes a candidate list restricted to
// the caller instead of returning every active room: this only answers
// "who is on your own documents", never "who is on the server".
func (h *Hub) ActiveDocumentUsers(candidates []document.ID) map[document.ID][]user.ID {
	rooms := h.roomsByDoc.roomsFor(candidates)
	result := make(map[document.ID][]user.ID, len(rooms))
	for docID, room := range rooms {
		// nil: an HTTP caller asking this isn't itself a client connected
		// to the room, so there's no one to exclude (unlike MemberIDs,
		// which excludes the asking peer).
		if ids := room.memberIDs(nil); len(ids) > 0 {
			result[docID] = ids
		}
	}
	return result
}

// BroadcastUpdate relays a persisted update to every other client on the
// document, wrapped as [0x01][update_id:u64][author_id:16][len:u32][payload]
// per docs/API.md.
func (h *Hub) BroadcastUpdate(sender *Client, updateID uint64, authorID [16]byte, payload []byte) {
	room := h.roomsByDoc.getOrCreate(sender.DocID)
	room.broadcastBinary(encodeUpdateFrame(updateID, authorID, payload), sender)
}

// BroadcastText relays a text control frame (e.g. presence) to every
// other client on the document.
func (h *Hub) BroadcastText(sender *Client, data []byte) {
	room := h.roomsByDoc.getOrCreate(sender.DocID)
	room.broadcastText(data, sender)
}

// SendUpdate delivers an update to a single client, in contrast to
// BroadcastUpdate's fan-out to everyone else. Drops the frame if the
// buffer is full, just like BroadcastUpdate would for that client —
// acceptable for an occasional one-off during steady-state operation,
// never for the join-time replay (see SendUpdateBlocking).
func (h *Hub) SendUpdate(client *Client, updateID uint64, authorID [16]byte, payload []byte) {
	client.enqueue(frame{binary: true, data: encodeUpdateFrame(updateID, authorID, payload)})
}

// SendText delivers a text control frame to a single client. See
// SendUpdate's comment on when dropping is (or isn't) acceptable.
func (h *Hub) SendText(client *Client, data []byte) {
	client.enqueue(frame{binary: false, data: data})
}

// SendUpdateBlocking is SendUpdate's counterpart for join time: it waits
// for buffer space (bounded by ctx) instead of dropping the frame.
// Replaying a document's history to a client that just connected is
// exactly the case where enqueue's silent-drop behavior past sendBuffer
// frames turns into data loss — a client that never received update #4
// has a corrupted view of the document, not just a briefly stale one.
func (h *Hub) SendUpdateBlocking(ctx context.Context, client *Client, updateID uint64, authorID [16]byte, payload []byte) error {
	return client.enqueueBlocking(ctx, frame{binary: true, data: encodeUpdateFrame(updateID, authorID, payload)})
}

// SendTextBlocking is SendText's counterpart for join time — see
// SendUpdateBlocking. Used for the snapshot of already-connected members,
// which a large history replay ahead of it in the same buffer could push
// out.
func (h *Hub) SendTextBlocking(ctx context.Context, client *Client, data []byte) error {
	return client.enqueueBlocking(ctx, frame{binary: false, data: data})
}

const updateFrameType = 0x01

// encodeUpdateFrame builds the binary frame that docs/API.md documents
// for server → client update delivery.
func encodeUpdateFrame(updateID uint64, authorID [16]byte, payload []byte) []byte {
	buf := make([]byte, 1+8+16+4+len(payload))
	pos := 0

	buf[pos] = updateFrameType
	pos++

	binary.BigEndian.PutUint64(buf[pos:], updateID)
	pos += 8

	copy(buf[pos:], authorID[:])
	pos += 16

	// #nosec G115 -- payload is always either a freshly decoded client
	// frame (bounded by the websocket connection's explicit read limit,
	// maxWSMessageBytes in ws_handler.go) or the ciphertext of a
	// persisted row, itself written under that same limit — nowhere near
	// uint32's range.
	binary.BigEndian.PutUint32(buf[pos:], uint32(len(payload)))
	pos += 4

	copy(buf[pos:], payload)
	return buf
}

// DecodeClientFrame parses the binary frame that docs/API.md documents
// for client → server update sending: [0x01][len:u32][payload].
func DecodeClientFrame(raw []byte) (payload []byte, ok bool) {
	const headerLen = 1 + 4
	if len(raw) < headerLen || raw[0] != updateFrameType {
		return nil, false
	}

	length := binary.BigEndian.Uint32(raw[1:5])
	payload = raw[headerLen:]
	// #nosec G115 -- raw is a single websocket message, bounded by the
	// connection's explicit read limit (maxWSMessageBytes in
	// ws_handler.go) — len(payload) never comes close to uint32's range.
	if uint32(len(payload)) != length {
		return nil, false
	}
	return payload, true
}
