// Package config loads process configuration from environment variables and
// validates all of it at boot. A required variable is missing? The process
// doesn't start — config errors never surface silently at runtime.
package config

import (
	"fmt"
	"os"
	"time"
)

// minJWTSecretLength is the minimum byte length accepted for
// PALIMPSESTO_JWT_SECRET — it signs access tokens via HMAC, so a short
// secret is brute-forceable offline and would let an attacker forge
// tokens for any user.
const minJWTSecretLength = 32

// Load reads the environment and returns an error describing exactly what's
// missing or malformed. Call this once, at boot, before building anything
// else.
func Load() (Config, error) {
	addr := getenv("PALIMPSESTO_ADDR", Addr(":8080"))

	dbURL, err := requireEnv[DatabaseURL]("PALIMPSESTO_DATABASE_URL")
	if err != nil {
		return Config{}, fmt.Errorf("invalid config: %w", err)
	}

	jwtSecret, err := requireEnv[JWTSecret]("PALIMPSESTO_JWT_SECRET")
	if err != nil {
		return Config{}, fmt.Errorf("invalid config: %w", err)
	}
	if len(jwtSecret) < minJWTSecretLength {
		return Config{}, fmt.Errorf("invalid config: PALIMPSESTO_JWT_SECRET must be at least %d bytes, got %d", minJWTSecretLength, len(jwtSecret))
	}

	return Config{
		Addr:            addr,
		DatabaseURL:     dbURL,
		JWTSecret:       jwtSecret,
		ShutdownTimeout: 10 * time.Second,
		SecureCookies:   getenv("PALIMPSESTO_SECURE_COOKIES", "true") != "false",
	}, nil
}

// getenv reads an environment variable, or falls back to a default. T is
// constrained to string-based types so Addr, DatabaseURL, and any config
// type added later can all share this one implementation.
func getenv[T ~string](key string, fallback T) T {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	return T(v)
}

// requireEnv reads a required environment variable, failing loudly instead
// of silently falling back to a zero value.
func requireEnv[T ~string](key string) (T, error) {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return "", fmt.Errorf("required environment variable missing: %s", key)
	}
	return T(v), nil
}
