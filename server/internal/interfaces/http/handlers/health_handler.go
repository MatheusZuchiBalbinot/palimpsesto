// Package handlers implements the HTTP handlers: thin adapters that
// decode a request, call an application service, and encode the
// response. No business logic lives here.
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// Pinger is the one method the health check needs from the persistence
// layer — narrowed down so this package doesn't need to import postgres
// just to call Ping.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Health pings the real database. No database, no 200 — that's how
// "process is alive" gets distinguished from "service actually works".
func Health(db Pinger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		w.Header().Set("Content-Type", "application/json")

		if err := db.Ping(ctx); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "unavailable"})
			return
		}

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}
