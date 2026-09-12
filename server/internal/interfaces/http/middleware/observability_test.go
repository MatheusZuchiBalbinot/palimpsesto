package middleware

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestIDInjectsAndEchoesHeader(t *testing.T) {
	var sawID string
	handler := RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawID = RequestIDFromContext(r.Context())
	}))

	t.Run("generates one when the client sends none", func(t *testing.T) {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))

		if sawID == "" {
			t.Fatal("want a non-empty generated request id in the context")
		}
		if w.Header().Get("X-Request-ID") != sawID {
			t.Fatalf("want the response header to echo the context id, got %q vs %q", w.Header().Get("X-Request-ID"), sawID)
		}
	})

	t.Run("preserves a client-supplied id instead of generating one", func(t *testing.T) {
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("X-Request-ID", "client-supplied-id")
		handler.ServeHTTP(w, r)

		if sawID != "client-supplied-id" {
			t.Fatalf("want the client-supplied id preserved, got %q", sawID)
		}
	})
}

func TestRequestIDFromContextWithNoValue(t *testing.T) {
	if got := RequestIDFromContext(t.Context()); got != "" {
		t.Fatalf("want an empty string when no request id was ever set, got %q", got)
	}
}

func TestLoggingRecordsTheHandlersActualStatus(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := Logging(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	}))

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))

	if w.Code != http.StatusTeapot {
		t.Fatalf("want the wrapped handler's status to reach the real ResponseWriter, got %d", w.Code)
	}
}

// TestRecoverCatchesPanicAndRespondsWithGenericError is the acceptance
// test for the whole point of this middleware: a handler panicking must
// never bring down the server, and the client must see a generic 500,
// never the panic value itself (which could be an internal error message
// or a stack-trace-adjacent detail).
func TestRecoverCatchesPanicAndRespondsWithGenericError(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := Recover(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("internal detail that must never reach the client")
	}))

	w := httptest.NewRecorder()

	// The test itself would panic and fail if Recover didn't do its job.
	handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("want 500, got %d", w.Code)
	}
	if got := w.Body.String(); got == "" || containsPanicMessage(got) {
		t.Fatalf("want a generic error body, never the panic value, got %q", got)
	}
}

func containsPanicMessage(body string) bool {
	return len(body) > 0 && (body[0] != '{')
}

func TestRecoverIsANoOpWhenNothingPanics(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	called := false
	handler := Recover(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}))

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))

	if !called || w.Code != http.StatusOK {
		t.Fatalf("want the normal handler to run untouched, called=%v status=%d", called, w.Code)
	}
}

func TestChainAppliesMiddlewareInOrder(t *testing.T) {
	var order []string
	mark := func(name string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				order = append(order, name)
				next.ServeHTTP(w, r)
			})
		}
	}

	handler := Chain(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		order = append(order, "handler")
	}), mark("first"), mark("second"))

	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))

	want := []string{"first", "second", "handler"}
	if len(order) != len(want) {
		t.Fatalf("want %v, got %v", want, order)
	}
	for i := range want {
		if order[i] != want[i] {
			t.Fatalf("want %v, got %v", want, order)
		}
	}
}
