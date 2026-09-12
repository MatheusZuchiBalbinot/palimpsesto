package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// evictionInterval is how often the background loop below sweeps for
// stale entries; staleAfter is how long an IP can go without a request
// before its entry is removed. Coarse on purpose — this only exists to
// keep the map from growing without bound over a long process lifetime,
// not to reclaim memory the instant an IP goes idle.
const (
	evictionInterval = 10 * time.Minute
	staleAfter       = 1 * time.Hour
)

// limiterEntry pairs a client IP's token bucket with when it was last
// used, so evictStaleBefore knows which entries are safe to drop.
type limiterEntry struct {
	limiter  *rate.Limiter
	lastUsed time.Time
}

// ipLimiter hands out a token-bucket limiter per client IP, evicting
// entries idle for more than staleAfter (see startEvictionLoop) — without
// that, a long-running process seeing many distinct IPs would make this
// map grow without bound for the life of the process.
type ipLimiter struct {
	mu       sync.Mutex
	limiters map[string]*limiterEntry
	rate     rate.Limit
	burst    int
	// now is a seam for tests to control time without sleeping for real;
	// production code always leaves this as the zero value and falls
	// back to time.Now (see the now() method below).
	now func() time.Time
}

func newIPLimiter(perMinute, burst int) *ipLimiter {
	return &ipLimiter{
		limiters: make(map[string]*limiterEntry),
		rate:     rate.Limit(float64(perMinute) / 60),
		burst:    burst,
	}
}

func (l *ipLimiter) clock() time.Time {
	if l.now != nil {
		return l.now()
	}
	return time.Now()
}

func (l *ipLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry, ok := l.limiters[ip]
	if !ok {
		entry = &limiterEntry{limiter: rate.NewLimiter(l.rate, l.burst)}
		l.limiters[ip] = entry
	}
	entry.lastUsed = l.clock()
	return entry.limiter.Allow()
}

// evictStaleBefore removes every entry last used before cutoff. Called
// periodically by startEvictionLoop in production, and directly by tests
// (with a fake cutoff) instead of waiting staleAfter for real.
func (l *ipLimiter) evictStaleBefore(cutoff time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()

	for ip, entry := range l.limiters {
		if entry.lastUsed.Before(cutoff) {
			delete(l.limiters, ip)
		}
	}
}

// size reports how many IPs currently have an entry — tests only, to
// assert eviction actually shrank the map rather than just not erroring.
func (l *ipLimiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.limiters)
}

// startEvictionLoop runs for the lifetime of the process (same as the
// http.Server this limiter guards — there's exactly one of these per
// RateLimit() call, made once at startup per rate-limited route group,
// so this never accumulates goroutines beyond that fixed, small count).
func (l *ipLimiter) startEvictionLoop() {
	ticker := time.NewTicker(evictionInterval)
	go func() {
		for range ticker.C {
			l.evictStaleBefore(time.Now().Add(-staleAfter))
		}
	}()
}

// RateLimit limits requests per client IP using a token bucket. Meant
// for sensitive, low-volume endpoints (login, register) — not a general
// substitute for a reverse-proxy or gateway rate limiter.
func RateLimit(perMinute, burst int) func(http.Handler) http.Handler {
	limiter := newIPLimiter(perMinute, burst)
	limiter.startEvictionLoop()

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !limiter.allow(clientIP(r)) {
				http.Error(w, `{"error":{"code":"rate_limited","message":"muitas tentativas, tente novamente mais tarde"}}`, http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
