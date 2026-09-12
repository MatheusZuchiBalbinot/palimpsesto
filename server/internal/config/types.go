package config

import (
	"net/url"
	"time"
)

// Addr is the TCP address the HTTP server listens on, e.g. ":8080". It's a
// distinct type — not a bare string — so a config value can't accidentally
// be swapped with some other string parameter at a call site.
type Addr string

// DatabaseURL is a Postgres connection string (DSN). Its String method
// redacts the password, so accidentally logging a DatabaseURL (via %v, %s,
// or a structured logger) never leaks credentials.
type DatabaseURL string

func (d DatabaseURL) String() string {
	u, err := url.Parse(string(d))
	if err != nil {
		return "postgres://<redacted>"
	}
	if u.User != nil {
		u.User = url.UserPassword(u.User.Username(), "REDACTED")
	}
	return u.String()
}

// JWTSecret signs and verifies access tokens. Its String method never
// reveals the value — a leaked log line should never be how this gets out.
type JWTSecret string

func (JWTSecret) String() string {
	return "<redacted>"
}

// Config is the fully validated, boot-time configuration for the process.
type Config struct {
	Addr            Addr
	DatabaseURL     DatabaseURL
	JWTSecret       JWTSecret
	ShutdownTimeout time.Duration
	// SecureCookies marks the refresh cookie HTTPS-only (the Secure
	// attribute). True is the only safe default for a real deployment —
	// disable only for local HTTP-only development, where a browser
	// silently never sends a Secure cookie back at all, breaking refresh
	// entirely (not a security hole to leave on, just a footgun for
	// anyone testing against plain http://localhost).
	SecureCookies bool
}
