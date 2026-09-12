package realtime

import (
	"sync"

	"palimpsesto/internal/domain/user"
)

// Room distributes frames to every client connected to a document.
type Room struct {
	mu      sync.Mutex
	clients map[*Client]struct{}
}

func newRoom() *Room {
	return &Room{clients: make(map[*Client]struct{})}
}

func (r *Room) join(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.clients[c] = struct{}{}
}

func (r *Room) leave(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.clients, c)
}

func (r *Room) size() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.clients)
}

// evictUser force-closes every connection userID currently has open in
// this room — used when a member is removed from the document, so a
// revoked member's already-open sockets stop receiving broadcasts and
// stop being able to call UpdatesSince instead of lingering until they
// disconnect on their own. The frames they'd still receive are opaque
// ciphertext under a key epoch they no longer have, so this closes a gap
// in the "revocation is immediate" model, not a plaintext leak.
func (r *Room) evictUser(userID user.ID) {
	r.mu.Lock()
	var evicted []*Client
	for c := range r.clients {
		if c.UserID != userID {
			continue
		}
		delete(r.clients, c)
		evicted = append(evicted, c)
	}
	r.mu.Unlock()

	for _, c := range evicted {
		c.evict()
	}
}

// memberIDs lists who's currently connected, excluding one client
// (usually the one asking, so they don't see themselves in "who else is
// here").
func (r *Room) memberIDs(exclude *Client) []user.ID {
	r.mu.Lock()
	defer r.mu.Unlock()

	ids := make([]user.ID, 0, len(r.clients))
	for c := range r.clients {
		if c == exclude {
			continue
		}
		ids = append(ids, c.UserID)
	}
	return ids
}

// broadcast distributes a frame to every client except skip. A client
// whose send buffer is already full gets evicted instead of blocking
// the rest of the room.
func (r *Room) broadcast(f frame, skip *Client) {
	r.mu.Lock()
	var evicted []*Client
	for c := range r.clients {
		if c == skip {
			continue
		}
		if !c.enqueue(f) {
			delete(r.clients, c)
			evicted = append(evicted, c)
		}
	}
	r.mu.Unlock()

	for _, c := range evicted {
		c.evict()
	}
}

func (r *Room) broadcastBinary(data []byte, skip *Client) {
	r.broadcast(frame{binary: true, data: data}, skip)
}

func (r *Room) broadcastText(data []byte, skip *Client) {
	r.broadcast(frame{binary: false, data: data}, skip)
}
