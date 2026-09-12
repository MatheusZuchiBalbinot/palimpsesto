package main

import (
	"io"
	"log/slog"
	"testing"
)

// TestRunFailsFastOnInvalidConfig guards the boot-time contract: run
// must fail before doing anything else (no listener, no DB connection
// attempt) when required configuration is missing — never panic, never
// silently start on defaults. This runs without a database on purpose:
// config.Load's own validation is the thing under test here, and it
// must reject before run ever reaches postgres.NewPool.
func TestRunFailsFastOnInvalidConfig(t *testing.T) {
	t.Setenv("PALIMPSESTO_DATABASE_URL", "")
	t.Setenv("PALIMPSESTO_JWT_SECRET", "")

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	if err := run(logger); err == nil {
		t.Fatal("want an error when required config is missing, got nil")
	}
}
