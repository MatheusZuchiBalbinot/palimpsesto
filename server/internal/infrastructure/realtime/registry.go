package realtime

import (
	"sync"

	"palimpsesto/internal/domain/document"
)

// roomRegistry is the mutex-protected map[document.ID]*Room that every
// Hub method goes through — kept as its own type so Hub's methods read
// as pure orchestration, not lock management.
type roomRegistry struct {
	mu    sync.Mutex
	rooms map[document.ID]*Room
}

func newRoomRegistry() roomRegistry {
	return roomRegistry{rooms: make(map[document.ID]*Room)}
}

func (r *roomRegistry) getOrCreate(docID document.ID) *Room {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[docID]
	if !ok {
		room = newRoom()
		r.rooms[docID] = room
	}
	return room
}

// get returns docID's room without creating one — unlike getOrCreate,
// callers that only want to act on an existing room (e.g. evicting a
// member) shouldn't spin one up just to immediately drop it empty.
func (r *roomRegistry) get(docID document.ID) (*Room, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	room, ok := r.rooms[docID]
	return room, ok
}

func (r *roomRegistry) dropIfEmpty(docID document.ID, room *Room) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if room.size() == 0 {
		delete(r.rooms, docID)
	}
}

// roomsFor returns the *Room for each candidate that currently has one,
// indexed by document ID — a room only exists in the map while it has at
// least one client (dropIfEmpty removes it the moment the last one
// leaves), so this also serves as "which of these are active". Returns
// pointers rather than querying each room's state itself so callers can
// read from a Room's own lock without holding the registry's.
func (r *roomRegistry) roomsFor(candidates []document.ID) map[document.ID]*Room {
	r.mu.Lock()
	defer r.mu.Unlock()

	rooms := make(map[document.ID]*Room, len(candidates))
	for _, id := range candidates {
		if room, ok := r.rooms[id]; ok {
			rooms[id] = room
		}
	}
	return rooms
}
