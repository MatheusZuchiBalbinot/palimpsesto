package httpapi_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/coder/websocket"

	"palimpsesto/internal/config"
	"palimpsesto/internal/infrastructure/persistence/postgres"
	"palimpsesto/internal/infrastructure/realtime"

	documentapp "palimpsesto/internal/application/document"
	userapp "palimpsesto/internal/application/user"

	httpapi "palimpsesto/internal/interfaces/http"
	"palimpsesto/internal/interfaces/http/handlers"
)

// testApp wires the exact same components cmd/api/main.go wires, against
// the real database configured for the running environment
// (docker-compose's db service), and serves them through the real
// router — every test in this file drives the API the way an actual
// HTTP client would, never calling a service method directly.
type testApp struct {
	server *httptest.Server
	client *http.Client
}

func newTestApp(t *testing.T) *testApp {
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

	users := userapp.NewService(userRepo, sessionRepo, userKeysRepo, []byte("test-secret-router"))
	documents := documentapp.NewService(documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo, documentRepo)
	hub := realtime.NewHub()

	// The refresh cookie's Secure attribute would otherwise make the
	// cookie jar below silently refuse to store/resend it, since
	// httptest.NewServer serves plain HTTP — the same reason
	// docker-compose.yml's dev override sets this to false.
	handlers.SetSecureCookies(false)

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	router := httpapi.NewRouter(logger, pool, users, documents, hub)

	srv := httptest.NewServer(router)
	t.Cleanup(srv.Close)

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("creating cookie jar: %v", err)
	}

	return &testApp{server: srv, client: &http.Client{Jar: jar}}
}

func (a *testApp) url(path string) string { return a.server.URL + path }

// do sends a request with an optional JSON body and an optional bearer
// token, and decodes a JSON response body into out (if out is non-nil).
func (a *testApp) do(t *testing.T, method, path, token string, body any, out any) *http.Response {
	t.Helper()

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshaling request body: %v", err)
		}
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequest(method, a.url(path), reader)
	if err != nil {
		t.Fatalf("building request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := a.client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	t.Cleanup(func() { _ = resp.Body.Close() })

	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			t.Fatalf("%s %s: decoding response body: %v", method, path, err)
		}
	}
	return resp
}

func requireStatus(t *testing.T, resp *http.Response, want int) {
	t.Helper()
	if resp.StatusCode != want {
		t.Fatalf("%s %s: want status %d, got %d", resp.Request.Method, resp.Request.URL.Path, want, resp.StatusCode)
	}
}

func uniqueTestEmail(t *testing.T) string {
	t.Helper()
	return fmt.Sprintf("router-test-%d@example.com", time.Now().UnixNano())
}

// fixedBytes returns n arbitrary (but deterministic) bytes — good enough
// stand-ins for opaque ciphertext/key material the server never
// interprets.
func fixedBytes(n int) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = byte(i % 256)
	}
	return b
}

func b64(b []byte) string { return base64.StdEncoding.EncodeToString(b) }

// registeredUser is a fully onboarded account: registered, logged in,
// and with identity keys published — everything most flows need before
// they can start.
type registeredUser struct {
	email       string
	accessToken string
	userID      string
}

// registerAndLogin creates a fresh account and returns a usable session.
// It deliberately runs the register+login round trip through its own
// throwaway app instance (own router, own rate limiter) rather than
// through a — the auth endpoints all share one rate-limit bucket per
// client IP (router.go's authLimit), and every test in this file looks
// like the same client IP to that limiter (loopback). A test that spins
// up several users via a on one shared bucket would trip 429 well before
// it meant to test anything about rate limiting. The token/account this
// returns is still fully usable against a (or any other app instance
// backed by the same database and JWT secret — see newTestApp).
func (a *testApp) registerAndLogin(t *testing.T, displayName string) registeredUser {
	t.Helper()

	authApp := newTestApp(t)

	email := uniqueTestEmail(t)
	registerBody := map[string]any{
		"email":        email,
		"login_key":    "correct-horse-battery-staple",
		"display_name": displayName,
		"salt_mk":      b64(fixedBytes(16)),
	}
	resp := authApp.do(t, http.MethodPost, "/api/auth/register", "", registerBody, nil)
	requireStatus(t, resp, http.StatusNoContent)

	loginBody := map[string]any{"email": email, "login_key": "correct-horse-battery-staple"}
	var loginOut struct {
		AccessToken string `json:"access_token"`
		User        struct {
			UserID string `json:"user_id"`
		} `json:"user"`
	}
	resp = authApp.do(t, http.MethodPost, "/api/auth/login", "", loginBody, &loginOut)
	requireStatus(t, resp, http.StatusOK)
	if loginOut.AccessToken == "" || loginOut.User.UserID == "" {
		t.Fatalf("login did not return a usable token/user id: %+v", loginOut)
	}

	return registeredUser{email: email, accessToken: loginOut.AccessToken, userID: loginOut.User.UserID}
}

// publishKeys publishes a syntactically valid (32-byte) identity keypair
// for u — several flows (lookup, invites, sealing a DEK) need a user to
// have published keys before they can be targeted.
func (a *testApp) publishKeys(t *testing.T, u registeredUser) {
	t.Helper()
	body := map[string]any{"identity_pub": b64(fixedBytes(32)), "signing_pub": b64(fixedBytes(32))}
	resp := a.do(t, http.MethodPost, "/api/users/me/keys", u.accessToken, body, nil)
	requireStatus(t, resp, http.StatusNoContent)
}

func (a *testApp) createDocument(t *testing.T, owner registeredUser, title string) string {
	t.Helper()
	var out struct {
		ID string `json:"id"`
	}
	resp := a.do(t, http.MethodPost, "/api/docs", owner.accessToken, map[string]any{"title_ciphertext": title}, &out)
	requireStatus(t, resp, http.StatusCreated)
	return out.ID
}

// --- Auth & account lifecycle ---------------------------------------

// TestRouter_RegisterLoginRefreshLogout deliberately gives each subtest
// (and, within "full cycle", each logical phase) its own app instance —
// register/login/salt/refresh/logout all share one rate-limit bucket per
// client IP (router.go's authLimit, burst 5), and every request in this
// file looks like the same client IP to it (loopback). A single shared
// app across this many auth calls would trip 429 before exercising what
// each subtest actually means to test.
func TestRouter_RegisterLoginRefreshLogout(t *testing.T) {
	t.Run("register requires a valid body", func(t *testing.T) {
		app := newTestApp(t)
		req, err := http.NewRequest(http.MethodPost, app.url("/api/auth/register"), bytes.NewReader([]byte("{not valid json")))
		if err != nil {
			t.Fatalf("building request: %v", err)
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := app.client.Do(req)
		if err != nil {
			t.Fatalf("POST /api/auth/register: %v", err)
		}
		defer func() { _ = resp.Body.Close() }()
		requireStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("register rejects a malformed salt_mk", func(t *testing.T) {
		app := newTestApp(t)
		body := map[string]any{"email": uniqueTestEmail(t), "login_key": "correct-horse-battery-staple", "salt_mk": "not-base64!!"}
		resp := app.do(t, http.MethodPost, "/api/auth/register", "", body, nil)
		requireStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("register rejects a too-short login key", func(t *testing.T) {
		app := newTestApp(t)
		body := map[string]any{"email": uniqueTestEmail(t), "login_key": "short", "salt_mk": b64(fixedBytes(16))}
		var errOut map[string]any
		resp := app.do(t, http.MethodPost, "/api/auth/register", "", body, &errOut)
		requireStatus(t, resp, http.StatusBadRequest)
	})

	email := uniqueTestEmail(t)
	saltMK := b64(fixedBytes(16))

	t.Run("register, then reject a duplicate", func(t *testing.T) {
		app := newTestApp(t)
		body := map[string]any{"email": email, "login_key": "correct-horse-battery-staple", "display_name": "Ada", "salt_mk": saltMK}
		resp := app.do(t, http.MethodPost, "/api/auth/register", "", body, nil)
		requireStatus(t, resp, http.StatusNoContent)

		resp = app.do(t, http.MethodPost, "/api/auth/register", "", body, nil)
		requireStatus(t, resp, http.StatusConflict)
	})

	t.Run("salt is fetchable by email before login, and requires the param", func(t *testing.T) {
		app := newTestApp(t)
		var saltOut struct {
			SaltMK string `json:"salt_mk"`
		}
		resp := app.do(t, http.MethodGet, "/api/auth/salt?email="+email, "", nil, &saltOut)
		requireStatus(t, resp, http.StatusOK)
		if saltOut.SaltMK != saltMK {
			t.Fatalf("want the salt registered, got %q", saltOut.SaltMK)
		}

		resp = app.do(t, http.MethodGet, "/api/auth/salt", "", nil, nil)
		requireStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("login, refresh, logout cycle", func(t *testing.T) {
		app := newTestApp(t)

		var loginOut struct {
			AccessToken string `json:"access_token"`
			User        struct {
				UserID      string `json:"user_id"`
				DisplayName string `json:"display_name"`
			} `json:"user"`
		}
		resp := app.do(t, http.MethodPost, "/api/auth/login", "", map[string]any{"email": email, "login_key": "wrong-password"}, nil)
		requireStatus(t, resp, http.StatusUnauthorized)

		resp = app.do(t, http.MethodPost, "/api/auth/login", "", map[string]any{"email": email, "login_key": "correct-horse-battery-staple"}, &loginOut)
		requireStatus(t, resp, http.StatusOK)
		if loginOut.User.DisplayName != "Ada" {
			t.Fatalf("want display name Ada, got %q", loginOut.User.DisplayName)
		}

		// The refresh cookie the client jar just captured from Login lets
		// Refresh mint a new access token without resending credentials.
		var refreshOut struct {
			AccessToken string `json:"access_token"`
		}
		resp = app.do(t, http.MethodPost, "/api/auth/refresh", "", nil, &refreshOut)
		requireStatus(t, resp, http.StatusOK)
		if refreshOut.AccessToken == "" {
			t.Fatal("want a non-empty access token from refresh")
		}

		// The refreshed access token must itself be usable — not just
		// present in the response body. (Not asserting it differs from
		// the login token: access token claims are second-granularity,
		// so two calls within the same wall-clock second legitimately
		// produce byte-identical JWTs; the refresh *token*, not the
		// access token, is what actually rotates on every call.)
		resp = app.do(t, http.MethodGet, "/api/docs", refreshOut.AccessToken, nil, nil)
		requireStatus(t, resp, http.StatusOK)

		resp = app.do(t, http.MethodPost, "/api/auth/logout", "", nil, nil)
		requireStatus(t, resp, http.StatusNoContent)

		// The refresh cookie was cleared by logout — refreshing again
		// with nothing left in the jar must fail.
		resp = app.do(t, http.MethodPost, "/api/auth/refresh", "", nil, nil)
		requireStatus(t, resp, http.StatusUnauthorized)
	})
}

func TestRouter_ProtectedRoutesRequireAuth(t *testing.T) {
	app := newTestApp(t)

	resp := app.do(t, http.MethodGet, "/api/docs", "", nil, nil)
	requireStatus(t, resp, http.StatusUnauthorized)

	resp = app.do(t, http.MethodGet, "/api/docs", "not-a-real-token", nil, nil)
	requireStatus(t, resp, http.StatusUnauthorized)
}

func TestRouter_ProfileAndPasswordAndKeys(t *testing.T) {
	app := newTestApp(t)
	u := app.registerAndLogin(t, "Original Name")

	t.Run("update profile", func(t *testing.T) {
		resp := app.do(t, http.MethodPatch, "/api/users/me", u.accessToken, map[string]any{"display_name": "New Name"}, nil)
		requireStatus(t, resp, http.StatusNoContent)
	})

	t.Run("publish and fetch own public keys", func(t *testing.T) {
		app.publishKeys(t, u)

		var out struct {
			Fingerprint string `json:"fingerprint"`
			DisplayName string `json:"display_name"`
		}
		resp := app.do(t, http.MethodGet, "/api/users/me/keys", u.accessToken, nil, &out)
		requireStatus(t, resp, http.StatusOK)
		if out.Fingerprint == "" {
			t.Fatal("want a non-empty fingerprint")
		}
	})

	t.Run("fetch another user's public keys by id and by email lookup", func(t *testing.T) {
		var byID struct {
			UserID string `json:"user_id"`
		}
		resp := app.do(t, http.MethodGet, "/api/users/"+u.userID+"/keys", u.accessToken, nil, &byID)
		requireStatus(t, resp, http.StatusOK)
		if byID.UserID != u.userID {
			t.Fatalf("want %q, got %q", u.userID, byID.UserID)
		}

		var byEmail struct {
			DisplayName string `json:"display_name"`
		}
		resp = app.do(t, http.MethodGet, "/api/users/lookup?email="+u.email, u.accessToken, nil, &byEmail)
		requireStatus(t, resp, http.StatusOK)

		resp = app.do(t, http.MethodGet, "/api/users/lookup?email=nobody-"+u.email, u.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})

	t.Run("set and fetch wrapped private keys", func(t *testing.T) {
		body := map[string]any{"ciphertext": b64(fixedBytes(48)), "nonce": b64(fixedBytes(24))}
		resp := app.do(t, http.MethodPost, "/api/users/me/private-keys", u.accessToken, body, nil)
		requireStatus(t, resp, http.StatusNoContent)

		var out struct {
			Ciphertext string `json:"ciphertext"`
			Nonce      string `json:"nonce"`
		}
		resp = app.do(t, http.MethodGet, "/api/users/me/private-keys", u.accessToken, nil, &out)
		requireStatus(t, resp, http.StatusOK)
		if out.Nonce != b64(fixedBytes(24)) {
			t.Fatalf("want the nonce just stored, got %q", out.Nonce)
		}
	})

	t.Run("change password requires the current one", func(t *testing.T) {
		body := map[string]any{
			"current_login_key": "wrong-current-password",
			"new_login_key":     "brand-new-password-value",
			"new_salt_mk":       b64(fixedBytes(16)),
		}
		resp := app.do(t, http.MethodPost, "/api/auth/change-password", u.accessToken, body, nil)
		requireStatus(t, resp, http.StatusUnauthorized)

		body["current_login_key"] = "correct-horse-battery-staple"
		resp = app.do(t, http.MethodPost, "/api/auth/change-password", u.accessToken, body, nil)
		requireStatus(t, resp, http.StatusNoContent)

		// The old login key must stop working, and the new one must log
		// in — proves the change actually took effect end to end.
		resp = app.do(t, http.MethodPost, "/api/auth/login", "", map[string]any{"email": u.email, "login_key": "correct-horse-battery-staple"}, nil)
		requireStatus(t, resp, http.StatusUnauthorized)

		resp = app.do(t, http.MethodPost, "/api/auth/login", "", map[string]any{"email": u.email, "login_key": "brand-new-password-value"}, nil)
		requireStatus(t, resp, http.StatusOK)
	})
}

func TestRouter_Devices(t *testing.T) {
	app := newTestApp(t)
	u := app.registerAndLogin(t, "Device Tester")

	var devices []struct {
		FamilyID  string `json:"family_id"`
		IsCurrent bool   `json:"is_current"`
	}
	resp := app.do(t, http.MethodGet, "/api/users/me/devices", u.accessToken, nil, &devices)
	requireStatus(t, resp, http.StatusOK)
	if len(devices) != 1 || !devices[0].IsCurrent {
		t.Fatalf("want exactly one device, marked current, got %+v", devices)
	}

	t.Run("a stranger cannot revoke someone else's device", func(t *testing.T) {
		stranger := app.registerAndLogin(t, "Stranger")
		resp := app.do(t, http.MethodDelete, "/api/users/me/devices/"+devices[0].FamilyID, stranger.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})

	resp = app.do(t, http.MethodDelete, "/api/users/me/devices/"+devices[0].FamilyID, u.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNoContent)
}

// --- Documents, folders, archive -------------------------------------

func TestRouter_DocumentLifecycle(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")

	docID := app.createDocument(t, owner, "hello")

	var got struct {
		Title string `json:"title_ciphertext"`
	}
	resp := app.do(t, http.MethodGet, "/api/docs/"+docID, owner.accessToken, nil, &got)
	requireStatus(t, resp, http.StatusOK)
	if got.Title != "hello" {
		t.Fatalf("want title %q, got %q", "hello", got.Title)
	}

	var list []map[string]any
	resp = app.do(t, http.MethodGet, "/api/docs", owner.accessToken, nil, &list)
	requireStatus(t, resp, http.StatusOK)
	if len(list) == 0 {
		t.Fatal("want at least the document just created")
	}

	resp = app.do(t, http.MethodPatch, "/api/docs/"+docID, owner.accessToken, map[string]any{"title_ciphertext": "renamed"}, nil)
	requireStatus(t, resp, http.StatusNoContent)

	t.Run("a stranger cannot read the document", func(t *testing.T) {
		stranger := app.registerAndLogin(t, "Stranger")
		resp := app.do(t, http.MethodGet, "/api/docs/"+docID, stranger.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})

	resp = app.do(t, http.MethodDelete, "/api/docs/"+docID, owner.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNoContent)

	var archived []map[string]any
	resp = app.do(t, http.MethodGet, "/api/docs/archived", owner.accessToken, nil, &archived)
	requireStatus(t, resp, http.StatusOK)
	if len(archived) == 0 {
		t.Fatal("want the deleted document to show up as archived")
	}

	resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/restore", owner.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNoContent)

	resp = app.do(t, http.MethodGet, "/api/docs/"+docID, owner.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusOK)
}

func TestRouter_ActiveDocumentsAndHealth(t *testing.T) {
	app := newTestApp(t)

	resp := app.do(t, http.MethodGet, "/healthz", "", nil, nil)
	requireStatus(t, resp, http.StatusOK)

	u := app.registerAndLogin(t, "Presence Tester")
	app.createDocument(t, u, "doc")

	var active struct {
		Documents []map[string]any `json:"documents"`
	}
	resp = app.do(t, http.MethodGet, "/api/docs/active", u.accessToken, nil, &active)
	requireStatus(t, resp, http.StatusOK)
	if len(active.Documents) != 0 {
		t.Fatalf("want no active documents with nobody connected over websocket, got %+v", active.Documents)
	}
}

func TestRouter_Folders(t *testing.T) {
	app := newTestApp(t)
	u := app.registerAndLogin(t, "Folder Tester")

	var folder struct {
		ID string `json:"id"`
	}
	resp := app.do(t, http.MethodPost, "/api/folders", u.accessToken, map[string]any{"name": "Work", "color": "blue"}, &folder)
	requireStatus(t, resp, http.StatusCreated)

	var folders []map[string]any
	resp = app.do(t, http.MethodGet, "/api/folders", u.accessToken, nil, &folders)
	requireStatus(t, resp, http.StatusOK)
	if len(folders) != 1 {
		t.Fatalf("want exactly one folder, got %d", len(folders))
	}

	resp = app.do(t, http.MethodPatch, "/api/folders/"+folder.ID, u.accessToken, map[string]any{"name": "Renamed", "color": "green"}, nil)
	requireStatus(t, resp, http.StatusOK)

	docID := app.createDocument(t, u, "filed doc")
	resp = app.do(t, http.MethodPatch, "/api/docs/"+docID+"/folder", u.accessToken, map[string]any{"folder_id": folder.ID}, nil)
	requireStatus(t, resp, http.StatusNoContent)

	resp = app.do(t, http.MethodPatch, "/api/docs/"+docID+"/folder", u.accessToken, map[string]any{"folder_id": nil}, nil)
	requireStatus(t, resp, http.StatusNoContent)

	resp = app.do(t, http.MethodDelete, "/api/folders/"+folder.ID, u.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNoContent)
}

// --- Membership, sharing, invite links --------------------------------

func TestRouter_MembershipAndInviteLinkFlow(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")
	member := app.registerAndLogin(t, "Member")
	app.publishKeys(t, member)

	docID := app.createDocument(t, owner, "shared doc")

	t.Run("owner seals their own DEK", func(t *testing.T) {
		body := map[string]any{"wrapped_dek": b64(fixedBytes(40))}
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members/"+owner.userID+"/wrapped-dek", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusNoContent)

		var out struct {
			WrappedDEK string `json:"wrapped_dek"`
			KeyEpoch   int    `json:"key_epoch"`
		}
		resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/wrapped-dek", owner.accessToken, nil, &out)
		requireStatus(t, resp, http.StatusOK)
		if out.KeyEpoch != 1 {
			t.Fatalf("want epoch 1 on a freshly created document, got %d", out.KeyEpoch)
		}
	})

	t.Run("adding a member with role owner is rejected", func(t *testing.T) {
		body := map[string]any{"email": member.email, "role": "owner", "wrapped_dek": b64(fixedBytes(40))}
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("owner adds member as editor", func(t *testing.T) {
		body := map[string]any{"email": member.email, "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusNoContent)

		var members []map[string]any
		resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/members", owner.accessToken, nil, &members)
		requireStatus(t, resp, http.StatusOK)
		if len(members) != 2 {
			t.Fatalf("want owner + member, got %d", len(members))
		}
	})

	t.Run("owner changes the member's role, but cannot change their own", func(t *testing.T) {
		resp := app.do(t, http.MethodPatch, "/api/docs/"+docID+"/members/"+member.userID, owner.accessToken, map[string]any{"role": "reader"}, nil)
		requireStatus(t, resp, http.StatusNoContent)

		resp = app.do(t, http.MethodPatch, "/api/docs/"+docID+"/members/"+owner.userID, owner.accessToken, map[string]any{"role": "reader"}, nil)
		requireStatus(t, resp, http.StatusForbidden)
	})

	t.Run("invite link cannot be created with role owner, but can with editor", func(t *testing.T) {
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/invite-link", owner.accessToken, map[string]any{"role": "owner"}, nil)
		requireStatus(t, resp, http.StatusBadRequest)

		var link struct {
			Token string `json:"token"`
		}
		resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/invite-link", owner.accessToken, map[string]any{"role": "editor"}, &link)
		requireStatus(t, resp, http.StatusOK)
		if link.Token == "" {
			t.Fatal("want a non-empty invite link token")
		}

		var fetched struct {
			Token string `json:"token"`
		}
		resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/invite-link", owner.accessToken, nil, &fetched)
		requireStatus(t, resp, http.StatusOK)
		if fetched.Token != link.Token {
			t.Fatalf("want the same link back, got %q vs %q", fetched.Token, link.Token)
		}

		stranger := app.registerAndLogin(t, "Link Joiner")
		var joined struct {
			ID string `json:"id"`
		}
		resp = app.do(t, http.MethodPost, "/api/invite-links/"+link.Token+"/join", stranger.accessToken, nil, &joined)
		requireStatus(t, resp, http.StatusOK)
		if joined.ID != docID {
			t.Fatalf("want to join %q, got %q", docID, joined.ID)
		}

		resp = app.do(t, http.MethodDelete, "/api/docs/"+docID+"/invite-link", owner.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNoContent)

		resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/invite-link", owner.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})

	t.Run("key history is reachable after a rotation", func(t *testing.T) {
		var members []struct {
			UserID string `json:"user_id"`
		}
		resp := app.do(t, http.MethodGet, "/api/docs/"+docID+"/members", owner.accessToken, nil, &members)
		requireStatus(t, resp, http.StatusOK)

		newWraps := map[string]string{}
		for _, m := range members {
			if m.UserID != member.userID {
				newWraps[m.UserID] = b64(fixedBytes(40))
			}
		}

		var removeOut struct {
			KeyEpoch int `json:"key_epoch"`
		}
		resp = app.do(t, http.MethodDelete, "/api/docs/"+docID+"/members/"+member.userID, owner.accessToken, map[string]any{"new_wraps": newWraps}, &removeOut)
		requireStatus(t, resp, http.StatusOK)
		if removeOut.KeyEpoch <= 1 {
			t.Fatalf("want the epoch to have advanced past 1, got %d", removeOut.KeyEpoch)
		}

		var history []map[string]any
		resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/key-history", owner.accessToken, nil, &history)
		requireStatus(t, resp, http.StatusOK)
		if len(history) == 0 {
			t.Fatal("want at least one archived epoch key for the owner after a rotation")
		}

		resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/wrapped-dek", member.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})

	t.Run("a member can leave voluntarily, but the owner cannot", func(t *testing.T) {
		leaver := app.registerAndLogin(t, "Leaver")
		app.publishKeys(t, leaver)
		body := map[string]any{"email": leaver.email, "role": "reader", "wrapped_dek": b64(fixedBytes(40))}
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusNoContent)

		resp = app.do(t, http.MethodDelete, "/api/docs/"+docID+"/members/"+leaver.userID, leaver.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNoContent)

		resp = app.do(t, http.MethodDelete, "/api/docs/"+docID+"/members/"+owner.userID, owner.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusForbidden)
	})
}

func TestRouter_SetMemberWrappedDEKCannotOverwriteAlreadySet(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")
	other := app.registerAndLogin(t, "Other")
	app.publishKeys(t, other)

	docID := app.createDocument(t, owner, "doc")
	body := map[string]any{"wrapped_dek": b64(fixedBytes(40))}
	resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members/"+owner.userID+"/wrapped-dek", owner.accessToken, body, nil)
	requireStatus(t, resp, http.StatusNoContent)

	addBody := map[string]any{"email": other.email, "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
	resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, addBody, nil)
	requireStatus(t, resp, http.StatusNoContent)

	// Other, despite now being a member, cannot clobber the owner's
	// already-set wrapped DEK — only completing a pending wrap is
	// allowed.
	resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/members/"+owner.userID+"/wrapped-dek", other.accessToken, map[string]any{"wrapped_dek": b64(fixedBytes(99))}, nil)
	requireStatus(t, resp, http.StatusConflict)
}

// --- Invites by email --------------------------------------------------

func TestRouter_InviteByEmailFlow(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")
	invitee := app.registerAndLogin(t, "Invitee")
	app.publishKeys(t, invitee)

	docID := app.createDocument(t, owner, "invite doc")

	var created struct {
		ID string `json:"id"`
	}
	body := map[string]any{"email": invitee.email, "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
	resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/invites", owner.accessToken, body, &created)
	requireStatus(t, resp, http.StatusCreated)

	var forDoc []map[string]any
	resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/invites", owner.accessToken, nil, &forDoc)
	requireStatus(t, resp, http.StatusOK)
	if len(forDoc) != 1 {
		t.Fatalf("want one pending invite for the document, got %d", len(forDoc))
	}

	var forInvitee []map[string]any
	resp = app.do(t, http.MethodGet, "/api/invites", invitee.accessToken, nil, &forInvitee)
	requireStatus(t, resp, http.StatusOK)
	if len(forInvitee) != 1 {
		t.Fatalf("want one pending invite for the invitee, got %d", len(forInvitee))
	}

	resp = app.do(t, http.MethodPost, "/api/invites/"+created.ID+"/accept", invitee.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNoContent)

	resp = app.do(t, http.MethodGet, "/api/docs/"+docID, invitee.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusOK)

	t.Run("declining and cancelling", func(t *testing.T) {
		second := app.registerAndLogin(t, "Second Invitee")
		app.publishKeys(t, second)

		var invite2 struct {
			ID string `json:"id"`
		}
		body := map[string]any{"email": second.email, "role": "reader", "wrapped_dek": b64(fixedBytes(40))}
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/invites", owner.accessToken, body, &invite2)
		requireStatus(t, resp, http.StatusCreated)

		resp = app.do(t, http.MethodDelete, "/api/invites/"+invite2.ID, second.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNoContent)

		var invite3 struct {
			ID string `json:"id"`
		}
		body = map[string]any{"email": second.email, "role": "reader", "wrapped_dek": b64(fixedBytes(40))}
		resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/invites", owner.accessToken, body, &invite3)
		requireStatus(t, resp, http.StatusCreated)

		resp = app.do(t, http.MethodDelete, "/api/docs/"+docID+"/invites/"+invite3.ID, owner.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNoContent)
	})
}

// --- Comments and snapshots ---------------------------------------------

func TestRouter_CommentsFlow(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")
	stranger := app.registerAndLogin(t, "Stranger")

	docID := app.createDocument(t, owner, "commented doc")

	var comment struct {
		ID string `json:"id"`
	}
	resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/comments", owner.accessToken, map[string]any{"body_ciphertext": "first!"}, &comment)
	requireStatus(t, resp, http.StatusCreated)

	var list []map[string]any
	resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/comments", owner.accessToken, nil, &list)
	requireStatus(t, resp, http.StatusOK)
	if len(list) != 1 {
		t.Fatalf("want one comment, got %d", len(list))
	}

	resp = app.do(t, http.MethodPatch, "/api/docs/"+docID+"/comments/"+comment.ID, owner.accessToken, map[string]any{"body_ciphertext": "edited"}, nil)
	requireStatus(t, resp, http.StatusNoContent)

	resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/comments", stranger.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNotFound)

	resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/comments/"+comment.ID+"/resolve", owner.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNoContent)

	resp = app.do(t, http.MethodDelete, "/api/docs/"+docID+"/comments/"+comment.ID, owner.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNoContent)
}

func TestRouter_SnapshotsAndUpdates(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")
	docID := app.createDocument(t, owner, "snapshot doc")

	var updates []map[string]any
	resp := app.do(t, http.MethodGet, "/api/docs/"+docID+"/updates", owner.accessToken, nil, &updates)
	requireStatus(t, resp, http.StatusOK)
	if len(updates) != 0 {
		t.Fatalf("want no updates on a brand new document, got %d", len(updates))
	}

	resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/snapshots/latest", owner.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNotFound)

	var snapshot struct {
		KeyEpoch     int    `json:"key_epoch"`
		UpToUpdateID uint64 `json:"up_to_update_id"`
	}
	body := map[string]any{"key_epoch": 1, "up_to_update_id": 0, "ciphertext": b64(fixedBytes(64))}
	resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/snapshots", owner.accessToken, body, &snapshot)
	requireStatus(t, resp, http.StatusCreated)
	if snapshot.KeyEpoch != 1 {
		t.Fatalf("want epoch 1, got %d", snapshot.KeyEpoch)
	}

	resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/snapshots/latest", owner.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusOK)
}

// --- Rate limiting -------------------------------------------------------

func TestRouter_LoginIsRateLimited(t *testing.T) {
	app := newTestApp(t)

	// authRateLimitPerMinute/Burst in router.go is 10/min, burst 5 — a
	// tight loop of bad logins from the same client must eventually see
	// 429, proving the limiter is actually wired to this route and not
	// just unit-tested in isolation.
	var sawTooManyRequests bool
	for i := 0; i < 20; i++ {
		resp := app.do(t, http.MethodPost, "/api/auth/login", "", map[string]any{"email": "nobody@example.com", "login_key": "whatever-wrong"}, nil)
		if resp.StatusCode == http.StatusTooManyRequests {
			sawTooManyRequests = true
			break
		}
	}
	if !sawTooManyRequests {
		t.Fatal("want to eventually see 429 too_many_requests from the login rate limiter")
	}
}

// --- WebSocket: binary CRDT frames, presence, rejection, replay --------

// dialDocWS opens a real websocket connection to docID through the full
// router (so RequestID/Logging/Recover/statusWriter's Hijacker forwarding
// all sit in front of it, exactly like production) — never a bare call to
// the handler function directly.
func dialDocWS(t *testing.T, app *testApp, token, docID, since string) *websocket.Conn {
	t.Helper()

	wsURL, err := url.Parse(app.server.URL)
	if err != nil {
		t.Fatalf("parsing server URL: %v", err)
	}
	wsURL.Scheme = "ws"
	wsURL.Path = "/api/ws"
	query := url.Values{"doc": {docID}}
	if since != "" {
		query.Set("since", since)
	}
	wsURL.RawQuery = query.Encode()

	dialCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(dialCtx, wsURL.String(), &websocket.DialOptions{
		Subprotocols: []string{"access_token." + token},
	})
	if err != nil {
		t.Fatalf("dialing document websocket: %v", err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	return conn
}

func dialUserWS(t *testing.T, app *testApp, token string) *websocket.Conn {
	t.Helper()

	wsURL, err := url.Parse(app.server.URL)
	if err != nil {
		t.Fatalf("parsing server URL: %v", err)
	}
	wsURL.Scheme = "ws"
	wsURL.Path = "/api/ws/user"

	dialCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(dialCtx, wsURL.String(), &websocket.DialOptions{
		Subprotocols: []string{"access_token." + token},
	})
	if err != nil {
		t.Fatalf("dialing user websocket: %v", err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	return conn
}

// clientUpdateFrame builds the frame a client sends for a new CRDT
// update — [0x01][len:4][payload] per docs/API.md; the server assigns
// the update id and author before broadcasting it back out.
func clientUpdateFrame(payload []byte) []byte {
	buf := make([]byte, 1+4+len(payload))
	buf[0] = 0x01
	binary.BigEndian.PutUint32(buf[1:5], uint32(len(payload)))
	copy(buf[5:], payload)
	return buf
}

// readBinaryFrame reads one binary frame within a short deadline and
// splits it into the server's outbound envelope —
// [0x01][update_id:8][author_id:16][len:4][payload] per docs/API.md.
func readBinaryFrame(t *testing.T, conn *websocket.Conn) (updateID uint64, payload []byte) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	typ, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("reading binary frame: %v", err)
	}
	if typ != websocket.MessageBinary {
		t.Fatalf("want a binary frame, got message type %v", typ)
	}
	const headerLen = 1 + 8 + 16 + 4
	if len(data) < headerLen {
		t.Fatalf("frame too short: %d bytes", len(data))
	}
	updateID = binary.BigEndian.Uint64(data[1:9])
	return updateID, data[headerLen:]
}

// drainUntilType reads frames off conn, skipping any binary frame
// (history replay can interleave real update frames with the control
// messages below — e.g. a reader who just joined a document with
// existing history) until a text control message matches want (by "t"
// field), or the deadline expires.
func drainUntilType(t *testing.T, conn *websocket.Conn, want string) map[string]any {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		typ, data, err := conn.Read(ctx)
		cancel()
		if err != nil {
			t.Fatalf("reading frame while waiting for %q: %v", want, err)
		}
		if typ == websocket.MessageBinary {
			continue
		}

		var msg map[string]any
		if err := json.Unmarshal(data, &msg); err != nil {
			t.Fatalf("decoding text frame %q: %v", data, err)
		}
		if msg["t"] == want {
			return msg
		}
	}
	t.Fatalf("never saw a %q control message before the deadline", want)
	return nil
}

func TestRouter_WebSocketDocumentFlow(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "WS Owner")
	editor := app.registerAndLogin(t, "WS Editor")
	reader := app.registerAndLogin(t, "WS Reader")
	app.publishKeys(t, editor)
	app.publishKeys(t, reader)

	docID := app.createDocument(t, owner, "ws doc")
	addMember := func(u registeredUser, role string) {
		body := map[string]any{"email": u.email, "role": role, "wrapped_dek": b64(fixedBytes(40))}
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusNoContent)
	}
	addMember(editor, "editor")
	addMember(reader, "reader")

	ownerConn := dialDocWS(t, app, owner.accessToken, docID, "")
	// The owner's own join must not be echoed back to itself as
	// member_joined — drain the initial "joined" snapshot instead.
	drainUntilType(t, ownerConn, "joined")

	editorConn := dialDocWS(t, app, editor.accessToken, docID, "")
	drainUntilType(t, editorConn, "joined")
	// The owner should be told a new member joined.
	drainUntilType(t, ownerConn, "member_joined")

	t.Run("editor's update is broadcast and persisted", func(t *testing.T) {
		payload := []byte("hello from editor")
		if err := editorConn.Write(context.Background(), websocket.MessageBinary, clientUpdateFrame(payload)); err != nil {
			t.Fatalf("writing update frame: %v", err)
		}

		_, got := readBinaryFrame(t, ownerConn)
		if !bytes.Equal(got, payload) {
			t.Fatalf("want payload %q relayed to the owner, got %q", payload, got)
		}

		var updates []map[string]any
		var resp *http.Response
		// The update is applied asynchronously relative to the socket
		// write, so poll briefly instead of asserting on the first try.
		for i := 0; i < 20; i++ {
			resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/updates", owner.accessToken, nil, &updates)
			requireStatus(t, resp, http.StatusOK)
			if len(updates) > 0 {
				break
			}
			time.Sleep(50 * time.Millisecond)
		}
		if len(updates) != 1 {
			t.Fatalf("want the update to show up via REST, got %d", len(updates))
		}
	})

	t.Run("presence frame is relayed verbatim", func(t *testing.T) {
		presence := map[string]any{"t": "presence", "awareness": "opaque-awareness-blob"}
		raw, err := json.Marshal(presence)
		if err != nil {
			t.Fatalf("marshaling presence: %v", err)
		}
		if err := editorConn.Write(context.Background(), websocket.MessageText, raw); err != nil {
			t.Fatalf("writing presence frame: %v", err)
		}

		got := drainUntilType(t, ownerConn, "presence")
		if got["awareness"] != "opaque-awareness-blob" {
			t.Fatalf("want the awareness blob relayed verbatim, got %v", got)
		}
	})

	t.Run("a reader's update is rejected, not broadcast", func(t *testing.T) {
		readerConn := dialDocWS(t, app, reader.accessToken, docID, "")
		drainUntilType(t, readerConn, "joined")
		drainUntilType(t, ownerConn, "member_joined")

		if err := readerConn.Write(context.Background(), websocket.MessageBinary, clientUpdateFrame([]byte("i should not be able to write"))); err != nil {
			t.Fatalf("writing update frame: %v", err)
		}

		got := drainUntilType(t, readerConn, "error")
		if got["code"] != "update_rejected" {
			t.Fatalf("want error code update_rejected, got %v", got)
		}
	})

	t.Run("who's active is visible over REST without opening a socket per document", func(t *testing.T) {
		var active struct {
			Documents []struct {
				DocumentID string           `json:"document_id"`
				Users      []map[string]any `json:"users"`
			} `json:"documents"`
		}
		resp := app.do(t, http.MethodGet, "/api/docs/active", owner.accessToken, nil, &active)
		requireStatus(t, resp, http.StatusOK)

		var found bool
		for _, d := range active.Documents {
			if d.DocumentID == docID {
				found = true
				if len(d.Users) == 0 {
					t.Fatal("want at least one connected user listed")
				}
			}
		}
		if !found {
			t.Fatal("want the document with open connections to show up as active")
		}
	})

	t.Run("reconnecting replays history from the beginning", func(t *testing.T) {
		lateConn := dialDocWS(t, app, owner.accessToken, docID, "0")
		id, payload := readBinaryFrame(t, lateConn)
		if id == 0 {
			t.Fatal("want a non-zero update id replayed from history")
		}
		if string(payload) != "hello from editor" {
			t.Fatalf("want the earlier update replayed, got %q", payload)
		}
	})
}

func TestRouter_UserWebSocketNotifiesOnInvite(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Notify Owner")
	invitee := app.registerAndLogin(t, "Notify Invitee")
	app.publishKeys(t, invitee)

	docID := app.createDocument(t, owner, "notify doc")

	conn := dialUserWS(t, app, invitee.accessToken)

	body := map[string]any{"email": invitee.email, "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
	resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/invites", owner.accessToken, body, nil)
	requireStatus(t, resp, http.StatusCreated)

	got := drainUntilType(t, conn, "invites_changed")
	if got["t"] != "invites_changed" {
		t.Fatalf("want an invites_changed notification, got %v", got)
	}
}

// --- Negative paths and validation ------------------------------------
//
// Each of these hits one specific domain sentinel error through the
// full HTTP stack — the point is exercising the branch, not just the
// happy path every other test in this file already covers.

func TestRouter_AddMemberAndInviteNegativePaths(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")
	member := app.registerAndLogin(t, "Member")
	app.publishKeys(t, member)

	docID := app.createDocument(t, owner, "doc")

	t.Run("inviting an unknown email is rejected", func(t *testing.T) {
		body := map[string]any{"email": "nobody-such-user@example.com", "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})

	t.Run("adding the same member twice is rejected", func(t *testing.T) {
		body := map[string]any{"email": member.email, "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusNoContent)

		resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusConflict)
	})

	t.Run("a duplicate pending invite to the same person is rejected", func(t *testing.T) {
		second := app.registerAndLogin(t, "Second")
		app.publishKeys(t, second)

		body := map[string]any{"email": second.email, "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/invites", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusCreated)

		resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/invites", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusConflict)
	})

	t.Run("inviting an already-existing member is rejected", func(t *testing.T) {
		body := map[string]any{"email": member.email, "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/invites", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusConflict)
	})

	t.Run("a stranger cannot cancel or list invites they don't own", func(t *testing.T) {
		stranger := app.registerAndLogin(t, "Stranger")
		resp := app.do(t, http.MethodGet, "/api/docs/"+docID+"/invites", stranger.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
		resp = app.do(t, http.MethodDelete, "/api/docs/"+docID+"/invites/does-not-exist", stranger.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})

	t.Run("accepting or declining someone else's invite is rejected", func(t *testing.T) {
		invitee := app.registerAndLogin(t, "Invitee")
		app.publishKeys(t, invitee)
		var created struct {
			ID string `json:"id"`
		}
		body := map[string]any{"email": invitee.email, "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/invites", owner.accessToken, body, &created)
		requireStatus(t, resp, http.StatusCreated)

		stranger := app.registerAndLogin(t, "Stranger2")
		resp = app.do(t, http.MethodPost, "/api/invites/"+created.ID+"/accept", stranger.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
		resp = app.do(t, http.MethodDelete, "/api/invites/"+created.ID, stranger.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})
}

func TestRouter_WrappedDEKPendingUntilSealed(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")
	joiner := app.registerAndLogin(t, "Link Joiner")

	docID := app.createDocument(t, owner, "doc")
	var link struct {
		Token string `json:"token"`
	}
	resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/invite-link", owner.accessToken, map[string]any{"role": "editor"}, &link)
	requireStatus(t, resp, http.StatusOK)

	resp = app.do(t, http.MethodPost, "/api/invite-links/"+link.Token+"/join", joiner.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusOK)

	// Nobody has sealed the DEK for the link-joiner yet — GetWrappedDEK
	// must report it as pending, not silently return an empty blob.
	resp = app.do(t, http.MethodGet, "/api/docs/"+docID+"/wrapped-dek", joiner.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNotFound)
}

func TestRouter_RemoveMemberIncompleteRotationIsRejected(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")
	member := app.registerAndLogin(t, "Member")
	app.publishKeys(t, member)

	docID := app.createDocument(t, owner, "doc")
	body := map[string]any{"email": member.email, "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
	resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, body, nil)
	requireStatus(t, resp, http.StatusNoContent)

	// Removing member must reseal for every OTHER remaining member (just
	// the owner here) — an empty new_wraps leaves the owner's own wrap
	// missing, which the rotation must refuse rather than silently lock
	// the owner out of their own document.
	resp = app.do(t, http.MethodDelete, "/api/docs/"+docID+"/members/"+member.userID, owner.accessToken, map[string]any{"new_wraps": map[string]string{}}, nil)
	requireStatus(t, resp, http.StatusBadRequest)
}

func TestRouter_FolderValidationAndOwnership(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")

	t.Run("an empty folder name is rejected", func(t *testing.T) {
		resp := app.do(t, http.MethodPost, "/api/folders", owner.accessToken, map[string]any{"name": "   ", "color": "blue"}, nil)
		requireStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("an overly long folder name is rejected", func(t *testing.T) {
		body := map[string]any{"name": string(make([]byte, 61)), "color": "blue"}
		resp := app.do(t, http.MethodPost, "/api/folders", owner.accessToken, body, nil)
		requireStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("deleting a nonexistent folder is a not-found", func(t *testing.T) {
		resp := app.do(t, http.MethodDelete, "/api/folders/does-not-exist", owner.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})

	t.Run("a stranger cannot update or delete someone else's folder", func(t *testing.T) {
		var folder struct {
			ID string `json:"id"`
		}
		resp := app.do(t, http.MethodPost, "/api/folders", owner.accessToken, map[string]any{"name": "Mine", "color": "red"}, &folder)
		requireStatus(t, resp, http.StatusCreated)

		stranger := app.registerAndLogin(t, "Stranger")
		resp = app.do(t, http.MethodPatch, "/api/folders/"+folder.ID, stranger.accessToken, map[string]any{"name": "Hijacked", "color": "red"}, nil)
		requireStatus(t, resp, http.StatusNotFound)
		resp = app.do(t, http.MethodDelete, "/api/folders/"+folder.ID, stranger.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})
}

func TestRouter_CommentAuthorizationNegativePaths(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")
	author := app.registerAndLogin(t, "Author")
	app.publishKeys(t, author)
	stranger := app.registerAndLogin(t, "Stranger")

	docID := app.createDocument(t, owner, "doc")
	body := map[string]any{"email": author.email, "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
	resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, body, nil)
	requireStatus(t, resp, http.StatusNoContent)

	var comment struct {
		ID string `json:"id"`
	}
	resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/comments", author.accessToken, map[string]any{"body_ciphertext": "hi"}, &comment)
	requireStatus(t, resp, http.StatusCreated)

	t.Run("only the author can edit their own comment, not even the owner", func(t *testing.T) {
		resp := app.do(t, http.MethodPatch, "/api/docs/"+docID+"/comments/"+comment.ID, owner.accessToken, map[string]any{"body_ciphertext": "hijacked"}, nil)
		requireStatus(t, resp, http.StatusForbidden)
	})

	t.Run("a stranger cannot resolve or delete the comment, but the owner can", func(t *testing.T) {
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/comments/"+comment.ID+"/resolve", stranger.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
		resp = app.do(t, http.MethodDelete, "/api/docs/"+docID+"/comments/"+comment.ID, stranger.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)

		resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/comments/"+comment.ID+"/resolve", owner.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNoContent)

		resp = app.do(t, http.MethodDelete, "/api/docs/"+docID+"/comments/"+comment.ID, owner.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNoContent)
	})

	t.Run("resolving a nonexistent comment 404s", func(t *testing.T) {
		resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/comments/does-not-exist/resolve", owner.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})
}

func TestRouter_SnapshotRequiresEditorRole(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")
	reader := app.registerAndLogin(t, "Reader")
	app.publishKeys(t, reader)

	docID := app.createDocument(t, owner, "doc")
	body := map[string]any{"email": reader.email, "role": "reader", "wrapped_dek": b64(fixedBytes(40))}
	resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, body, nil)
	requireStatus(t, resp, http.StatusNoContent)

	snapshotBody := map[string]any{"key_epoch": 1, "up_to_update_id": 0, "ciphertext": b64(fixedBytes(16))}
	resp = app.do(t, http.MethodPost, "/api/docs/"+docID+"/snapshots", reader.accessToken, snapshotBody, nil)
	requireStatus(t, resp, http.StatusForbidden)

	t.Run("a stranger gets not-found instead of forbidden, existence stays hidden", func(t *testing.T) {
		stranger := app.registerAndLogin(t, "Stranger")
		resp := app.do(t, http.MethodGet, "/api/docs/"+docID+"/updates", stranger.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})
}

func TestRouter_InviteLinkJoinRejectsUnknownToken(t *testing.T) {
	app := newTestApp(t)
	u := app.registerAndLogin(t, "Joiner")
	resp := app.do(t, http.MethodPost, "/api/invite-links/this-token-was-never-issued/join", u.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNotFound)
}

func TestRouter_RevokeInviteLinkRequiresOwnership(t *testing.T) {
	app := newTestApp(t)
	owner := app.registerAndLogin(t, "Owner")
	member := app.registerAndLogin(t, "Member")
	app.publishKeys(t, member)

	docID := app.createDocument(t, owner, "doc")
	body := map[string]any{"email": member.email, "role": "editor", "wrapped_dek": b64(fixedBytes(40))}
	resp := app.do(t, http.MethodPost, "/api/docs/"+docID+"/members", owner.accessToken, body, nil)
	requireStatus(t, resp, http.StatusNoContent)

	resp = app.do(t, http.MethodDelete, "/api/docs/"+docID+"/invite-link", member.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusForbidden)
}

func TestRouter_KeysAndPrivateKeysNegativePaths(t *testing.T) {
	app := newTestApp(t)
	u := app.registerAndLogin(t, "No Keys Yet")

	t.Run("wrong-length public keys are rejected", func(t *testing.T) {
		body := map[string]any{"identity_pub": b64(fixedBytes(31)), "signing_pub": b64(fixedBytes(32))}
		resp := app.do(t, http.MethodPost, "/api/users/me/keys", u.accessToken, body, nil)
		requireStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("malformed base64 in public keys is rejected", func(t *testing.T) {
		resp := app.do(t, http.MethodPost, "/api/users/me/keys", u.accessToken, map[string]any{"identity_pub": "not base64!!", "signing_pub": b64(fixedBytes(32))}, nil)
		requireStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("fetching public keys before publishing any is not-found", func(t *testing.T) {
		resp := app.do(t, http.MethodGet, "/api/users/me/keys", u.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})

	t.Run("fetching wrapped private keys before publishing any is not-found", func(t *testing.T) {
		resp := app.do(t, http.MethodGet, "/api/users/me/private-keys", u.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})

	t.Run("wrong-length nonce on wrapped private keys is rejected", func(t *testing.T) {
		body := map[string]any{"ciphertext": b64(fixedBytes(48)), "nonce": b64(fixedBytes(12))}
		resp := app.do(t, http.MethodPost, "/api/users/me/private-keys", u.accessToken, body, nil)
		requireStatus(t, resp, http.StatusBadRequest)
	})

	t.Run("looking up an email with no published keys is not-found", func(t *testing.T) {
		stranger := app.registerAndLogin(t, "Stranger")
		resp := app.do(t, http.MethodGet, "/api/users/lookup?email="+stranger.email, u.accessToken, nil, nil)
		requireStatus(t, resp, http.StatusNotFound)
	})
}

func TestRouter_UpdateProfileValidation(t *testing.T) {
	app := newTestApp(t)
	u := app.registerAndLogin(t, "Original")

	resp := app.do(t, http.MethodPatch, "/api/users/me", u.accessToken, map[string]any{"display_name": "   "}, nil)
	requireStatus(t, resp, http.StatusBadRequest)

	resp = app.do(t, http.MethodPatch, "/api/users/me", u.accessToken, map[string]any{"display_name": string(make([]byte, 81))}, nil)
	requireStatus(t, resp, http.StatusBadRequest)
}

func TestRouter_ChangePasswordValidation(t *testing.T) {
	app := newTestApp(t)
	u := app.registerAndLogin(t, "PW Test")

	body := map[string]any{
		"current_login_key": "correct-horse-battery-staple",
		"new_login_key":     "brand-new-password-value",
		"new_salt_mk":       "not-valid-base64!!",
	}
	resp := app.do(t, http.MethodPost, "/api/auth/change-password", u.accessToken, body, nil)
	requireStatus(t, resp, http.StatusBadRequest)

	body["new_salt_mk"] = b64(fixedBytes(3))
	resp = app.do(t, http.MethodPost, "/api/auth/change-password", u.accessToken, body, nil)
	requireStatus(t, resp, http.StatusBadRequest)
}

func TestRouter_DocumentAndFolderNotFoundPaths(t *testing.T) {
	app := newTestApp(t)
	u := app.registerAndLogin(t, "Solo")

	resp := app.do(t, http.MethodGet, "/api/docs/does-not-exist", u.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNotFound)

	resp = app.do(t, http.MethodPatch, "/api/docs/does-not-exist", u.accessToken, map[string]any{"title_ciphertext": "x"}, nil)
	requireStatus(t, resp, http.StatusNotFound)

	resp = app.do(t, http.MethodDelete, "/api/docs/does-not-exist", u.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNotFound)

	resp = app.do(t, http.MethodPost, "/api/docs/does-not-exist/restore", u.accessToken, nil, nil)
	requireStatus(t, resp, http.StatusNotFound)

	docID := app.createDocument(t, u, "doc")
	resp = app.do(t, http.MethodPatch, "/api/docs/"+docID+"/folder", u.accessToken, map[string]any{"folder_id": "does-not-exist"}, nil)
	requireStatus(t, resp, http.StatusNotFound)
}
