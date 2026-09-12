package config_test

import (
	"testing"

	"palimpsesto/internal/config"
)

func setRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("PALIMPSESTO_DATABASE_URL", "postgres://user:pass@localhost:5432/db")
	t.Setenv("PALIMPSESTO_JWT_SECRET", "test-secret-at-least-32-bytes-long")
}

func TestLoadFailsWithoutRequiredEnv(t *testing.T) {
	// Explicitly unset, in case the test process's own environment
	// happens to have these (e.g. running outside the container).
	t.Setenv("PALIMPSESTO_DATABASE_URL", "")
	t.Setenv("PALIMPSESTO_JWT_SECRET", "")

	if _, err := config.Load(); err == nil {
		t.Fatal("want an error when required env vars are missing, got nil")
	}
}

// TestLoadRejectsShortJWTSecret guards against booting with a weak HMAC
// signing secret — a short one is brute-forceable offline and would let
// an attacker forge access tokens for any user.
func TestLoadRejectsShortJWTSecret(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("PALIMPSESTO_JWT_SECRET", "too-short")

	if _, err := config.Load(); err == nil {
		t.Fatal("want an error for a JWT secret under the minimum length, got nil")
	}
}

// SecureCookies gates the refresh cookie's Secure attribute
// (auth_handler.go) — true is the only safe default for a real
// deployment. Found the hard way: hardcoded true broke refresh entirely
// against a real browser over plain HTTP dev, since a Secure cookie is
// never sent back at all outside HTTPS.
func TestLoadSecureCookiesDefaultsToTrue(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("PALIMPSESTO_SECURE_COOKIES", "")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.SecureCookies {
		t.Fatal("want SecureCookies to default to true when unset")
	}
}

func TestLoadSecureCookiesCanBeDisabled(t *testing.T) {
	setRequiredEnv(t)
	t.Setenv("PALIMPSESTO_SECURE_COOKIES", "false")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.SecureCookies {
		t.Fatal("want SecureCookies to be false when explicitly set to \"false\"")
	}
}

func TestLoadSecureCookiesStaysTrueForAnyOtherValue(t *testing.T) {
	setRequiredEnv(t)
	// Only the literal "false" opts out — a typo like "0" or "no" must
	// never silently disable a security-relevant default.
	t.Setenv("PALIMPSESTO_SECURE_COOKIES", "0")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.SecureCookies {
		t.Fatal("want SecureCookies to stay true for any value other than the literal \"false\"")
	}
}
