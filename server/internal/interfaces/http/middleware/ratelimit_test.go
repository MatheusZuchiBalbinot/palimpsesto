package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClientIP(t *testing.T) {
	t.Run("splits host from a well-formed host:port address", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = "203.0.113.5:54321"
		if got := clientIP(r); got != "203.0.113.5" {
			t.Fatalf("want %q, got %q", "203.0.113.5", got)
		}
	})

	t.Run("falls back to the raw value when there's no port to split", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = "not-a-host-port-pair"
		if got := clientIP(r); got != "not-a-host-port-pair" {
			t.Fatalf("want the raw RemoteAddr as a fallback, got %q", got)
		}
	})
}

func TestIPLimiterAllowsUpToBurstThenBlocks(t *testing.T) {
	limiter := newIPLimiter(60, 3)

	for i := 0; i < 3; i++ {
		if !limiter.allow("1.2.3.4") {
			t.Fatalf("request %d: want allowed within burst", i)
		}
	}
	if limiter.allow("1.2.3.4") {
		t.Fatal("want the 4th request over burst to be denied")
	}

	// A different IP has its own independent bucket.
	if !limiter.allow("5.6.7.8") {
		t.Fatal("want a different client IP to have its own budget")
	}
}

func TestRateLimitMiddlewareRespondsWithTooManyRequests(t *testing.T) {
	handler := RateLimit(60, 1)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := func() *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = "9.9.9.9:1"
		return r
	}

	w1 := httptest.NewRecorder()
	handler.ServeHTTP(w1, req())
	if w1.Code != http.StatusOK {
		t.Fatalf("want the first request (within burst) to succeed, got %d", w1.Code)
	}

	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req())
	if w2.Code != http.StatusTooManyRequests {
		t.Fatalf("want the second request (over burst 1) to be rate-limited, got %d", w2.Code)
	}
}

func TestIPLimiterEvictsOnlyEntriesStaleBeforeCutoff(t *testing.T) {
	// burst=1 so a single allow() call below exhausts "5.6.7.8"'s bucket
	// completely — makes "still exhausted after eviction" a one-call
	// check instead of needing to know exactly how many calls burst
	// allows.
	limiter := newIPLimiter(60, 1)
	current := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	limiter.now = func() time.Time { return current }

	// "1.2.3.4" is used once, then goes idle — every later allow() call
	// below only touches "5.6.7.8", so "1.2.3.4"'s lastUsed never
	// advances past this point.
	limiter.allow("1.2.3.4")

	current = current.Add(30 * time.Minute)
	limiter.allow("5.6.7.8")

	if got := limiter.size(); got != 2 {
		t.Fatalf("want 2 entries before eviction, got %d", got)
	}

	// current is t+30min here. A cutoff of t+15min lands after
	// "1.2.3.4"'s last use (t+0, stale relative to this cutoff) but
	// before "5.6.7.8"'s (t+30min, not stale) — only the stale one
	// should go.
	limiter.evictStaleBefore(current.Add(-15 * time.Minute))

	if got := limiter.size(); got != 1 {
		t.Fatalf("want 1 entry after evicting the stale one, got %d", got)
	}

	// The survivor's bucket state (burst already spent by the allow()
	// call above) is untouched by eviction — it isn't silently reset.
	if limiter.allow("5.6.7.8") || limiter.allow("5.6.7.8") {
		t.Fatal("want the surviving entry's burst to still be exhausted, not reset by eviction")
	}

	// Evicting "1.2.3.4" freed its slot: a fresh bucket, full burst
	// available again — this is what actually proves the entry, not
	// just some unrelated field, was removed. "1.2.3.4" had already used
	// its one-request burst before eviction (the very first allow() call
	// in this test); a bucket that had merely been left alone would
	// still be exhausted here too.
	if !limiter.allow("1.2.3.4") {
		t.Fatal("want a fresh bucket for the evicted-then-returning IP")
	}
}
