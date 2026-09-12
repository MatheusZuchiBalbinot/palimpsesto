package userapp_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"palimpsesto/internal/config"
	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"
	"palimpsesto/internal/infrastructure/persistence/postgres"

	"palimpsesto/internal/application/user"
	"palimpsesto/internal/application/user/commands"
)

// testSaltMK is a fixed 16-byte salt_mk stand-in — RegisterHandler
// validates the length, so every test that registers an account needs
// one, even tests that don't care about its actual value.
var testSaltMK = []byte("0123456789abcdef")

// newTestService connects to the real database configured for the
// running environment (docker-compose's db service) — the postgres
// package doesn't sit behind an interface at the wiring level, so an
// integration test against a real Postgres is the direct way to
// exercise it.
func newTestService(t *testing.T) *userapp.Service {
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

	users := postgres.NewUserRepository(pool)
	sessions := postgres.NewSessionRepository(pool)
	keys := postgres.NewUserKeysRepository(pool)
	return userapp.NewService(users, sessions, keys, []byte("test-secret"))
}

func uniqueEmail(t *testing.T) user.Email {
	t.Helper()
	return user.Email(fmt.Sprintf("test-%d@example.com", time.Now().UnixNano()))
}

func TestRegisterAndLogin(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	email := uniqueEmail(t)
	const loginKey = "correct-horse-battery-staple"

	if err := svc.Register(ctx, usercommands.RegisterInput{Email: email, LoginKey: loginKey, SaltMK: testSaltMK}); err != nil {
		t.Fatalf("register: %v", err)
	}

	cases := []struct {
		name     string
		email    user.Email
		loginKey user.LoginKey
		wantErr  error
	}{
		{"duplicate email", email, loginKey, user.ErrEmailTaken},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := svc.Register(ctx, usercommands.RegisterInput{Email: tc.email, LoginKey: tc.loginKey, SaltMK: testSaltMK})
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("want %v, got %v", tc.wantErr, err)
			}
		})
	}

	loginCases := []struct {
		name     string
		email    user.Email
		loginKey user.LoginKey
		wantErr  error
	}{
		{"wrong login key", email, "wrong-password", user.ErrInvalidCredentials},
		{"unknown email", uniqueEmail(t), loginKey, user.ErrInvalidCredentials},
	}
	for _, tc := range loginCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.Login(ctx, usercommands.LoginInput{Email: tc.email, LoginKey: tc.loginKey, DeviceLabel: "test-device"})
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("want %v, got %v", tc.wantErr, err)
			}
		})
	}

	tokens, err := svc.Login(ctx, usercommands.LoginInput{Email: email, LoginKey: loginKey, DeviceLabel: "test-device"})
	if err != nil {
		t.Fatalf("login with correct credentials: %v", err)
	}
	if tokens.AccessToken == "" || tokens.RefreshToken == "" {
		t.Fatal("expected non-empty access and refresh tokens")
	}
	if !tokens.RefreshTokenExpiresAt.After(tokens.AccessTokenExpiresAt) {
		t.Fatal("refresh cookie must outlive the access token, not expire alongside it")
	}
}

// TestRegisterRejectsShortLoginKey guards the minimum login-key length:
// LoginKey is, today, the raw password (see the type's own comment), so
// without a server-side floor an account could be created with a
// one-character password.
func TestRegisterRejectsShortLoginKey(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	err := svc.Register(ctx, usercommands.RegisterInput{Email: uniqueEmail(t), LoginKey: "short", SaltMK: testSaltMK})
	if !errors.Is(err, user.ErrLoginKeyTooShort) {
		t.Fatalf("want %v, got %v", user.ErrLoginKeyTooShort, err)
	}
}

// TestRefreshRotationAndReuseDetection is the acceptance criterion:
// stealing a refresh token and using it after the legitimate owner has
// already rotated theirs must revoke both sessions.
func TestRefreshRotationAndReuseDetection(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	email := uniqueEmail(t)
	const loginKey = "correct-horse-battery-staple"

	if err := svc.Register(ctx, usercommands.RegisterInput{Email: email, LoginKey: loginKey, SaltMK: testSaltMK}); err != nil {
		t.Fatalf("register: %v", err)
	}
	initial, err := svc.Login(ctx, usercommands.LoginInput{Email: email, LoginKey: loginKey, DeviceLabel: "victim-device"})
	if err != nil {
		t.Fatalf("login: %v", err)
	}

	stolenToken := initial.RefreshToken

	rotated, err := svc.Refresh(ctx, usercommands.RefreshInput{PresentedToken: stolenToken, DeviceLabel: "victim-device"})
	if err != nil {
		t.Fatalf("legitimate refresh: %v", err)
	}
	if rotated.RefreshToken == stolenToken {
		t.Fatal("refresh must issue a new token, not reuse the old one")
	}
	// A page reload has no session.user in memory to fall back on — only
	// this httpOnly-cookie-backed refresh — so the client's session
	// bootstrap depends on a refresh response carrying full account info,
	// not just a bare access token.
	if rotated.Account.ID != initial.Account.ID {
		t.Fatalf("refresh must return the same account ID, want %v got %v", initial.Account.ID, rotated.Account.ID)
	}
	if rotated.Account.Email != email {
		t.Fatalf("refresh must return the account's email, want %v got %v", email, rotated.Account.Email)
	}

	_, err = svc.Refresh(ctx, usercommands.RefreshInput{PresentedToken: stolenToken, DeviceLabel: "attacker-device"})
	if !errors.Is(err, session.ErrInvalidRefreshToken) {
		t.Fatalf("replaying a retired token: want invalid refresh token, got %v", err)
	}

	// Reuse must have also killed the victim's own rotated session —
	// otherwise the attacker would have only lost a race, not the whole
	// family.
	_, err = svc.Refresh(ctx, usercommands.RefreshInput{PresentedToken: rotated.RefreshToken, DeviceLabel: "victim-device"})
	if !errors.Is(err, session.ErrInvalidRefreshToken) {
		t.Fatalf("victim's rotated session should be revoked too: want invalid refresh token, got %v", err)
	}
}

func TestRefreshWithGarbageToken(t *testing.T) {
	svc := newTestService(t)

	_, err := svc.Refresh(context.Background(), usercommands.RefreshInput{PresentedToken: "not-a-real-token", DeviceLabel: "test-device"})
	if !errors.Is(err, session.ErrInvalidRefreshToken) {
		t.Fatalf("want invalid refresh token, got %v", err)
	}
}

func fixedTestKeys(fill byte) user.PublicKeys {
	identity := make([]byte, 32)
	signing := make([]byte, 32)
	for i := range identity {
		identity[i] = fill
	}
	for i := range signing {
		signing[i] = fill + 1
	}
	return user.PublicKeys{IdentityPub: identity, SigningPub: signing}
}

// TestPublicKeysFlow is the acceptance flow: a user publishes their
// keys, can read them back, and a stranger can look them up by email
// (what sharing a document with them needs) — with the fingerprint
// matching on both sides, since it's derived from the same bytes.
func TestPublicKeysFlow(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	email := uniqueEmail(t)
	const loginKey = "correct-horse-battery-staple"

	if err := svc.Register(ctx, usercommands.RegisterInput{Email: email, LoginKey: loginKey, SaltMK: testSaltMK}); err != nil {
		t.Fatalf("register: %v", err)
	}
	tokens, err := svc.Login(ctx, usercommands.LoginInput{Email: email, LoginKey: loginKey, DeviceLabel: "test-device"})
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	userID := tokens.Account.ID

	t.Run("looking up keys before they're published", func(t *testing.T) {
		if _, err := svc.GetPublicKeys(ctx, userID); !errors.Is(err, user.ErrKeysNotFound) {
			t.Fatalf("want %v, got %v", user.ErrKeysNotFound, err)
		}
	})

	t.Run("rejects malformed keys", func(t *testing.T) {
		bad := user.PublicKeys{IdentityPub: []byte{1, 2, 3}, SigningPub: []byte{4, 5, 6}}
		if err := svc.SetPublicKeys(ctx, userID, bad); !errors.Is(err, user.ErrInvalidPublicKeys) {
			t.Fatalf("want %v, got %v", user.ErrInvalidPublicKeys, err)
		}
	})

	keys := fixedTestKeys(7)
	if err := svc.SetPublicKeys(ctx, userID, keys); err != nil {
		t.Fatalf("publishing keys: %v", err)
	}

	t.Run("the owner can read their own keys back", func(t *testing.T) {
		got, err := svc.GetPublicKeys(ctx, userID)
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if got.UserID != userID {
			t.Fatalf("want user id %v, got %v", userID, got.UserID)
		}
		if string(got.Fingerprint) != string(user.ComputeFingerprint(keys)) {
			t.Fatalf("fingerprint mismatch: want %v, got %v", user.ComputeFingerprint(keys), got.Fingerprint)
		}
	})

	t.Run("a stranger can look them up by email", func(t *testing.T) {
		got, err := svc.LookupUser(ctx, email)
		if err != nil {
			t.Fatalf("lookup: %v", err)
		}
		if got.UserID != userID {
			t.Fatalf("want user id %v, got %v", userID, got.UserID)
		}
		if got.Fingerprint != user.ComputeFingerprint(keys) {
			t.Fatalf("fingerprint mismatch: want %v, got %v", user.ComputeFingerprint(keys), got.Fingerprint)
		}
	})

	t.Run("looking up an email nobody registered", func(t *testing.T) {
		if _, err := svc.LookupUser(ctx, uniqueEmail(t)); !errors.Is(err, user.ErrNotFound) {
			t.Fatalf("want %v, got %v", user.ErrNotFound, err)
		}
	})

	t.Run("publishing again replaces the old keys, not appends", func(t *testing.T) {
		newKeys := fixedTestKeys(42)
		if err := svc.SetPublicKeys(ctx, userID, newKeys); err != nil {
			t.Fatalf("republishing: %v", err)
		}
		got, err := svc.GetPublicKeys(ctx, userID)
		if err != nil {
			t.Fatalf("get after republish: %v", err)
		}
		if got.Fingerprint != user.ComputeFingerprint(newKeys) {
			t.Fatal("want the new fingerprint after republishing, got the old one")
		}
	})
}

func fixedWrappedKeys(fill byte) user.WrappedPrivateKeys {
	ciphertext := make([]byte, 96) // 64-byte plaintext + 16-byte Poly1305 tag, padded for realism
	nonce := make([]byte, 24)
	for i := range ciphertext {
		ciphertext[i] = fill
	}
	for i := range nonce {
		nonce[i] = fill + 1
	}
	return user.WrappedPrivateKeys{Ciphertext: ciphertext, Nonce: nonce}
}

// TestMasterKeyMaterialFlow is the acceptance flow ("where the private
// key lives"): salt_mk is fetchable by email before login (so a
// returning device can derive the MK before having anything to
// authenticate with), and wrapped private keys round-trip
// publish/fetch exactly like public ones do.
func TestMasterKeyMaterialFlow(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	email := uniqueEmail(t)
	const loginKey = "derived-login-key-not-a-real-password"

	if err := svc.Register(ctx, usercommands.RegisterInput{Email: email, LoginKey: loginKey, SaltMK: testSaltMK}); err != nil {
		t.Fatalf("register: %v", err)
	}
	tokens, err := svc.Login(ctx, usercommands.LoginInput{Email: email, LoginKey: loginKey, DeviceLabel: "test-device"})
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	userID := tokens.Account.ID

	t.Run("rejects a malformed salt_mk at registration", func(t *testing.T) {
		err := svc.Register(ctx, usercommands.RegisterInput{
			Email: uniqueEmail(t), LoginKey: "whatever", SaltMK: []byte{1, 2, 3},
		})
		if !errors.Is(err, user.ErrInvalidSalt) {
			t.Fatalf("want %v, got %v", user.ErrInvalidSalt, err)
		}
	})

	t.Run("salt_mk is fetchable by email before login", func(t *testing.T) {
		got, err := svc.GetSalt(ctx, email)
		if err != nil {
			t.Fatalf("get salt: %v", err)
		}
		if string(got) != string(testSaltMK) {
			t.Fatalf("want %v, got %v", testSaltMK, got)
		}
	})

	t.Run("fetching salt for an email nobody registered", func(t *testing.T) {
		if _, err := svc.GetSalt(ctx, uniqueEmail(t)); !errors.Is(err, user.ErrNotFound) {
			t.Fatalf("want %v, got %v", user.ErrNotFound, err)
		}
	})

	t.Run("no wrapped private keys published yet", func(t *testing.T) {
		if _, err := svc.GetWrappedPrivateKeys(ctx, userID); !errors.Is(err, user.ErrPrivateKeysNotFound) {
			t.Fatalf("want %v, got %v", user.ErrPrivateKeysNotFound, err)
		}
	})

	t.Run("publishing wrapped private keys requires a public-keys row first", func(t *testing.T) {
		// SetWrappedPrivateKeys is an UPDATE, not an upsert — a row
		// already needs to exist in user_keys (SetPublicKeys creates it)
		// to affect. Publishing private keys before any public key
		// exists is a client-side ordering bug, not a case to paper
		// over.
		wrapped := fixedWrappedKeys(1)
		if err := svc.SetWrappedPrivateKeys(ctx, userID, wrapped); !errors.Is(err, user.ErrKeysNotFound) {
			t.Fatalf("want %v, got %v", user.ErrKeysNotFound, err)
		}
	})

	if err := svc.SetPublicKeys(ctx, userID, fixedTestKeys(7)); err != nil {
		t.Fatalf("publishing public keys: %v", err)
	}

	wrapped := fixedWrappedKeys(1)
	if err := svc.SetWrappedPrivateKeys(ctx, userID, wrapped); err != nil {
		t.Fatalf("publishing wrapped private keys: %v", err)
	}

	t.Run("the owner can read the wrapped private keys back", func(t *testing.T) {
		got, err := svc.GetWrappedPrivateKeys(ctx, userID)
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if string(got.Ciphertext) != string(wrapped.Ciphertext) || string(got.Nonce) != string(wrapped.Nonce) {
			t.Fatal("want the same ciphertext/nonce back, got something else")
		}
	})

	t.Run("republishing (password change) replaces the old blob", func(t *testing.T) {
		newWrapped := fixedWrappedKeys(50)
		if err := svc.SetWrappedPrivateKeys(ctx, userID, newWrapped); err != nil {
			t.Fatalf("republishing: %v", err)
		}
		got, err := svc.GetWrappedPrivateKeys(ctx, userID)
		if err != nil {
			t.Fatalf("get after republish: %v", err)
		}
		if string(got.Ciphertext) != string(newWrapped.Ciphertext) {
			t.Fatal("want the new ciphertext after republishing, got the old one")
		}
	})
}

// TestChangePasswordFlow: changing the password replaces the login-key
// material (so the old password stops working and the new one takes
// effect), requires knowing the CURRENT password (holding a valid
// session isn't enough), and never touches the identity private keys
// themselves — those are re-wrapped and republished by the client
// separately (exercised in TestMasterKeyMaterialFlow's republish case).
func TestChangePasswordFlow(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()
	email := uniqueEmail(t)
	const oldLoginKey = "old-derived-login-key"
	const newLoginKey = "new-derived-login-key"
	newSaltMK := []byte("fedcba9876543210")

	if err := svc.Register(ctx, usercommands.RegisterInput{Email: email, LoginKey: oldLoginKey, SaltMK: testSaltMK}); err != nil {
		t.Fatalf("register: %v", err)
	}
	tokens, err := svc.Login(ctx, usercommands.LoginInput{Email: email, LoginKey: oldLoginKey, DeviceLabel: "test-device"})
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	userID := tokens.Account.ID

	t.Run("rejects the wrong current password", func(t *testing.T) {
		err := svc.ChangePassword(ctx, usercommands.ChangePasswordInput{
			UserID: userID, CurrentLoginKey: "not-the-real-current-key", NewLoginKey: newLoginKey, NewSaltMK: newSaltMK,
		})
		if !errors.Is(err, user.ErrInvalidCredentials) {
			t.Fatalf("want %v, got %v", user.ErrInvalidCredentials, err)
		}
	})

	t.Run("rejects a malformed new salt", func(t *testing.T) {
		err := svc.ChangePassword(ctx, usercommands.ChangePasswordInput{
			UserID: userID, CurrentLoginKey: oldLoginKey, NewLoginKey: newLoginKey, NewSaltMK: []byte{1, 2, 3},
		})
		if !errors.Is(err, user.ErrInvalidSalt) {
			t.Fatalf("want %v, got %v", user.ErrInvalidSalt, err)
		}
	})

	if err := svc.ChangePassword(ctx, usercommands.ChangePasswordInput{
		UserID: userID, CurrentLoginKey: oldLoginKey, NewLoginKey: newLoginKey, NewSaltMK: newSaltMK,
	}); err != nil {
		t.Fatalf("changing password: %v", err)
	}

	t.Run("the old password no longer works", func(t *testing.T) {
		_, err := svc.Login(ctx, usercommands.LoginInput{Email: email, LoginKey: oldLoginKey, DeviceLabel: "test-device"})
		if !errors.Is(err, user.ErrInvalidCredentials) {
			t.Fatalf("want %v, got %v", user.ErrInvalidCredentials, err)
		}
	})

	t.Run("the new password works", func(t *testing.T) {
		_, err := svc.Login(ctx, usercommands.LoginInput{Email: email, LoginKey: newLoginKey, DeviceLabel: "test-device"})
		if err != nil {
			t.Fatalf("logging in with the new password: %v", err)
		}
	})

	t.Run("the salt_mk actually changed", func(t *testing.T) {
		got, err := svc.GetSalt(ctx, email)
		if err != nil {
			t.Fatalf("get salt: %v", err)
		}
		if string(got) != string(newSaltMK) {
			t.Fatalf("want the new salt %v, got %v", newSaltMK, got)
		}
	})
}
