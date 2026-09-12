package middleware

import (
	"bufio"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStatusWriterCapturesWrittenStatus(t *testing.T) {
	rec := httptest.NewRecorder()
	sw := &statusWriter{ResponseWriter: rec, status: http.StatusOK}

	sw.WriteHeader(http.StatusAccepted)

	if sw.status != http.StatusAccepted {
		t.Fatalf("want captured status %d, got %d", http.StatusAccepted, sw.status)
	}
	if rec.Code != http.StatusAccepted {
		t.Fatalf("want the underlying ResponseWriter to also receive it, got %d", rec.Code)
	}
}

// TestStatusWriterHijackRejectsWhenUnsupported guards the fallback path:
// httptest.NewRecorder doesn't implement http.Hijacker, which is exactly
// the case a non-HTTP/1.1 or otherwise hijack-incapable ResponseWriter
// would hit in production — statusWriter must report that cleanly
// instead of panicking on a failed type assertion.
func TestStatusWriterHijackRejectsWhenUnsupported(t *testing.T) {
	sw := &statusWriter{ResponseWriter: httptest.NewRecorder(), status: http.StatusOK}

	if _, _, err := sw.Hijack(); err == nil {
		t.Fatal("want an error when the underlying ResponseWriter doesn't support hijacking")
	}
}

// fakeHijacker adds a working http.Hijacker to httptest.NewRecorder,
// which doesn't implement one itself — needed to exercise statusWriter's
// success path (delegating to a real Hijacker), not just its
// "unsupported" fallback tested above.
type fakeHijacker struct {
	*httptest.ResponseRecorder
	hijacked bool
}

func (h *fakeHijacker) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h.hijacked = true
	return nil, nil, nil
}

func TestStatusWriterHijackDelegatesWhenSupported(t *testing.T) {
	fh := &fakeHijacker{ResponseRecorder: httptest.NewRecorder()}
	sw := &statusWriter{ResponseWriter: fh, status: http.StatusOK}

	if _, _, err := sw.Hijack(); err != nil {
		t.Fatalf("want Hijack to delegate successfully, got %v", err)
	}
	if !fh.hijacked {
		t.Fatal("want the underlying Hijacker.Hijack to have been called")
	}
}
