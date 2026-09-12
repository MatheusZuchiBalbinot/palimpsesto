package realtime

import (
	"sync"

	"palimpsesto/internal/domain/user"
)

// maxConnectionsPerUser caps how many concurrent websocket connections a
// single account may hold open across the whole Hub — every document
// room plus the per-user notification channel combined. Without a cap, a
// compromised credential or a buggy client retrying without backoff
// could open unbounded connections, each with its own goroutine and
// send buffer, and exhaust the server's memory well before anything
// else (rate limiting on the handshake itself) kicks in.
const maxConnectionsPerUser = 20

// connLimiter is the mutex-protected map[user.ID]int behind Hub's
// per-user connection cap.
type connLimiter struct {
	mu     sync.Mutex
	counts map[user.ID]int
}

func newConnLimiter() connLimiter {
	return connLimiter{counts: make(map[user.ID]int)}
}

// acquire reports whether userID is under maxConnectionsPerUser, and
// reserves a slot if so — callers that get false must not proceed with
// the connection.
func (l *connLimiter) acquire(userID user.ID) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.counts[userID] >= maxConnectionsPerUser {
		return false
	}
	l.counts[userID]++
	return true
}

// release frees a slot reserved by acquire — every successful acquire
// must be paired with exactly one release, when that connection ends.
func (l *connLimiter) release(userID user.ID) {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.counts[userID]--
	if l.counts[userID] <= 0 {
		delete(l.counts, userID)
	}
}
