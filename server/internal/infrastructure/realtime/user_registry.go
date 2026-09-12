package realtime

import (
	"sync"

	"palimpsesto/internal/domain/user"
)

// userRegistry is the mutex-protected map[user.ID]*Room behind Hub's
// per-user notification channel — reuses Room's client-set and
// broadcast/eviction machinery (a "room" of every browser tab the same
// user has open right now), just keyed by user instead of document.
type userRegistry struct {
	mu    sync.Mutex
	rooms map[user.ID]*Room
}

func newUserRegistry() userRegistry {
	return userRegistry{rooms: make(map[user.ID]*Room)}
}

func (r *userRegistry) getOrCreate(userID user.ID) *Room {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[userID]
	if !ok {
		room = newRoom()
		r.rooms[userID] = room
	}
	return room
}

// get looks up userID's room without creating one — unlike getOrCreate,
// used by NotifyUser, which must stay a no-op (not leak an empty room
// into the map forever) when that user has no connection open right now.
func (r *userRegistry) get(userID user.ID) (*Room, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[userID]
	return room, ok
}

func (r *userRegistry) dropIfEmpty(userID user.ID, room *Room) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if room.size() == 0 {
		delete(r.rooms, userID)
	}
}
