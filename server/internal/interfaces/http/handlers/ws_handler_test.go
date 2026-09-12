package handlers

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/coder/websocket"

	"palimpsesto/internal/config"
	"palimpsesto/internal/domain/user"
	"palimpsesto/internal/infrastructure/persistence/postgres"
	"palimpsesto/internal/infrastructure/realtime"

	"palimpsesto/internal/application/document"
	"palimpsesto/internal/application/user"
	"palimpsesto/internal/application/user/commands"
)

func TestExtractWSToken(t *testing.T) {
	tests := []struct {
		name      string
		header    string
		wantOK    bool
		wantToken string
		wantProto string
	}{
		{name: "no header", header: "", wantOK: false},
		{name: "unrelated subprotocol only", header: "graphql-ws", wantOK: false},
		{
			name:      "access token subprotocol",
			header:    "access_token.abc123",
			wantOK:    true,
			wantToken: "abc123",
			wantProto: "access_token.abc123",
		},
		{
			name:      "access token among other subprotocols",
			header:    "graphql-ws, access_token.abc123",
			wantOK:    true,
			wantToken: "abc123",
			wantProto: "access_token.abc123",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/api/ws", nil)
			if tt.header != "" {
				r.Header.Set("Sec-WebSocket-Protocol", tt.header)
			}

			subprotocol, token, ok := extractWSToken(r)
			if ok != tt.wantOK {
				t.Fatalf("want ok=%v, got %v", tt.wantOK, ok)
			}
			if !ok {
				return
			}
			if token != tt.wantToken {
				t.Fatalf("want token %q, got %q", tt.wantToken, token)
			}
			if subprotocol != tt.wantProto {
				t.Fatalf("want subprotocol %q, got %q", tt.wantProto, subprotocol)
			}
		})
	}
}

func TestAuthenticateWSRequest_MissingSubprotocolIsUnauthenticated(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/ws?doc=some-doc", nil)
	w := httptest.NewRecorder()

	// users/documents are never touched when the subprotocol is missing —
	// extraction fails before any service gets queried.
	_, _, _, isAuthenticated := authenticateWSRequest(w, r, nil, nil)
	if isAuthenticated {
		t.Fatal("want unauthenticated")
	}
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", w.Code)
	}
}

// wsTestEnv wires up the same services cmd/api/main.go wires, against
// the real database configured for the running environment
// (docker-compose's db service) — follows
// application/document/service_test.go's convention.
type wsTestEnv struct {
	users     *userapp.Service
	documents *documentapp.Service
	hub       *realtime.Hub
}

func newWSTestEnv(t *testing.T) wsTestEnv {
	t.Helper()

	dsn, ok := os.LookupEnv("PALIMPSESTO_DATABASE_URL")
	if !ok {
		t.Skip("PALIMPSESTO_DATABASE_URL not set; skipping integration test")
	}

	pool, err := postgres.NewPool(context.Background(), config.DatabaseURL(dsn))
	if err != nil {
		t.Fatalf("connecting to test database: %v", err)
	}
	t.Cleanup(pool.Close)

	userRepo := postgres.NewUserRepository(pool)
	userKeysRepo := postgres.NewUserKeysRepository(pool)
	sessionRepo := postgres.NewSessionRepository(pool)
	documentRepo := postgres.NewDocumentRepository(pool)

	return wsTestEnv{
		users:     userapp.NewService(userRepo, sessionRepo, userKeysRepo, []byte("test-secret")),
		documents: documentapp.NewService(documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo),
		hub:       realtime.NewHub(),
	}
}

// TestWebSocket_SubprotocolEcho is the regression test for the
// Sec-WebSocket-Protocol auth handshake: if the server ever echoes the
// wrong subprotocol (or none), a real browser silently refuses the
// connection — httptest.NewRecorder can't detect that, only a real
// handshake via coder/websocket's client can.
func TestWebSocket_SubprotocolEcho(t *testing.T) {
	env := newWSTestEnv(t)
	ctx := context.Background()

	email := user.Email(fmt.Sprintf("ws-test-%d@example.com", time.Now().UnixNano()))
	if err := env.users.Register(ctx, usercommands.RegisterInput{Email: email, LoginKey: "correct-horse-battery", SaltMK: []byte("0123456789abcdef")}); err != nil {
		t.Fatalf("registering test user: %v", err)
	}
	tokens, err := env.users.Login(ctx, usercommands.LoginInput{Email: email, LoginKey: "correct-horse-battery", DeviceLabel: "test"})
	if err != nil {
		t.Fatalf("logging in test user: %v", err)
	}

	doc, err := env.documents.Create(ctx, tokens.Account.ID, "ws test doc")
	if err != nil {
		t.Fatalf("creating test document: %v", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := httptest.NewServer(WebSocket(logger, env.users, env.documents, env.hub))
	t.Cleanup(srv.Close)

	wsURL, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatalf("parsing server URL: %v", err)
	}
	wsURL.Scheme = "ws"
	wsURL.RawQuery = url.Values{"doc": {string(doc.ID)}}.Encode()

	subprotocol := "access_token." + tokens.AccessToken

	dialCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(dialCtx, wsURL.String(), &websocket.DialOptions{
		Subprotocols: []string{subprotocol},
	})
	if err != nil {
		t.Fatalf("dialing websocket: %v", err)
	}
	defer func() { _ = conn.CloseNow() }()

	if got := conn.Subprotocol(); got != subprotocol {
		t.Fatalf("want server to echo subprotocol %q, got %q", subprotocol, got)
	}
}
