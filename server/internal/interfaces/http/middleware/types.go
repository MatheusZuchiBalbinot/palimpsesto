// Package middleware holds the shared HTTP middlewares: request ID,
// logging, panic recovery, authentication, and rate limiting. Domain
// and application packages never import net/http — only this package
// and the handlers in interfaces/http do.
package middleware

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
)

// contextKey is an unexported type for context values defined by this
// package, so they never collide with a key defined by another
// package. See https://pkg.go.dev/context#WithValue.
type contextKey string

const requestIDKey contextKey = "request_id"

// statusWriter wraps http.ResponseWriter to capture the status code a
// handler wrote, so middlewares like Logging can report it after the
// request finishes (the standard http.ResponseWriter has no way to
// read it back).
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(status int) {
	sw.status = status
	sw.ResponseWriter.WriteHeader(status)
}

// Hijack forwards to the underlying ResponseWriter's http.Hijacker, if
// it has one. Without this, wrapping a ResponseWriter would silently
// break any handler that needs to hijack the connection — a websocket
// upgrade being exactly that case.
func (sw *statusWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := sw.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("middleware: underlying ResponseWriter does not support hijacking")
	}
	return hijacker.Hijack()
}
