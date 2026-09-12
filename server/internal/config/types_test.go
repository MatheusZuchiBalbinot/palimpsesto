package config_test

import (
	"strings"
	"testing"

	"palimpsesto/internal/config"
)

// TestDatabaseURLStringRedactsPassword guards against a DatabaseURL ever
// leaking a credential through a log line, %v, or a structured logger —
// its whole reason for having a custom String method.
func TestDatabaseURLStringRedactsPassword(t *testing.T) {
	dsn := config.DatabaseURL("postgres://myuser:supersecret@localhost:5432/mydb?sslmode=disable")
	got := dsn.String()

	if strings.Contains(got, "supersecret") {
		t.Fatalf("want the password redacted, got %q", got)
	}
	if !strings.Contains(got, "REDACTED") {
		t.Fatalf("want the literal marker REDACTED in the output, got %q", got)
	}
	if !strings.Contains(got, "myuser") {
		t.Fatalf("want the username preserved (only the password is sensitive), got %q", got)
	}
}

func TestDatabaseURLStringHandlesMalformedInput(t *testing.T) {
	dsn := config.DatabaseURL("not a valid url at all://???")
	got := dsn.String()
	if !strings.Contains(got, "redacted") {
		t.Fatalf("want a safe fallback for an unparseable DSN, got %q", got)
	}
}

func TestDatabaseURLStringWithNoCredentials(t *testing.T) {
	dsn := config.DatabaseURL("postgres://localhost:5432/mydb")
	got := dsn.String()
	if strings.Contains(got, "REDACTED") {
		t.Fatalf("want no redaction marker when there were no credentials to begin with, got %q", got)
	}
}

// TestJWTSecretStringNeverRevealsTheValue guards the same property for
// JWTSecret — regardless of its actual value, String must always return
// the same fixed redacted marker.
func TestJWTSecretStringNeverRevealsTheValue(t *testing.T) {
	secret := config.JWTSecret("super-secret-signing-key-do-not-log-me")
	got := secret.String()

	if strings.Contains(got, "super-secret") {
		t.Fatalf("want the secret never to appear in String(), got %q", got)
	}
	if got != "<redacted>" {
		t.Fatalf("want the fixed marker <redacted>, got %q", got)
	}
}
