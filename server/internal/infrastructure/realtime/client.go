package realtime

import (
	"context"

	"github.com/coder/websocket"

	"palimpsesto/internal/domain/document"
	"palimpsesto/internal/domain/user"
)

// sendBuffer is how many outgoing frames a client may accumulate behind
// before it's considered a slow consumer and evicted — never blocking the
// room for everyone.
const sendBuffer = 16

type frame struct {
	binary bool
	data   []byte
}

// Client is a connected websocket session.
type Client struct {
	UserID user.ID
	DocID  document.ID

	conn *websocket.Conn
	send chan frame
}

func newClient(userID user.ID, docID document.ID, conn *websocket.Conn) *Client {
	return &Client{
		UserID: userID,
		DocID:  docID,
		conn:   conn,
		send:   make(chan frame, sendBuffer),
	}
}

// enqueue queues a frame for delivery. Returns false without blocking if
// the client's buffer is already full — callers are expected to evict a
// client that returns false.
func (c *Client) enqueue(f frame) bool {
	select {
	case c.send <- f:
		return true
	default:
		return false
	}
}

// enqueueBlocking queues a frame, waiting for buffer space (bounded by
// ctx) instead of dropping it when the buffer is full like enqueue does.
// Used for the one-off join-time delivery — history replay, the snapshot
// of already-connected members — where a document with more history than
// sendBuffer's slots silently dropping frames past the 16th is a
// correctness bug (lost CRDT updates, a client never learning who's
// already online), not the "genuinely stuck peer" case enqueue's eviction
// path exists for.
func (c *Client) enqueueBlocking(ctx context.Context, f frame) error {
	select {
	case c.send <- f:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// runWritePump drains queued frames to the connection until ctx is
// canceled or the client is evicted (its connection closed elsewhere).
func (c *Client) runWritePump(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case f := <-c.send:
			typ := websocket.MessageText
			if f.binary {
				typ = websocket.MessageBinary
			}
			if err := c.conn.Write(ctx, typ, f.data); err != nil {
				return
			}
		}
	}
}

// evict forcibly closes the connection — used for a slow consumer. Uses
// CloseNow, not Close: a slow/unresponsive peer is exactly the case where
// waiting up to 5s for the close handshake's ack (what Close does) would
// block the caller for no benefit. The read loop on the other end of this
// connection will see the error and unwind, which actually removes the
// client from its room.
func (c *Client) evict() {
	_ = c.conn.CloseNow()
}
