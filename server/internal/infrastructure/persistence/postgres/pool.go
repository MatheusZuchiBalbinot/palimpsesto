// Package postgres is the only package that talks to Postgres. It
// implements every domain repository interface (user.Repository,
// session.Repository, document.Repository) over a single shared
// connection pool.
package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"palimpsesto/internal/config"
)

// Pool wraps the connection pool shared by every repository in this
// package.
type Pool struct {
	pool *pgxpool.Pool
}

// NewPool opens the connection pool. Doesn't block waiting for the
// database to become reachable — connectivity failures only show up on
// the first Ping/query.
func NewPool(ctx context.Context, dsn config.DatabaseURL) (*Pool, error) {
	pool, err := pgxpool.New(ctx, string(dsn))
	if err != nil {
		return nil, fmt.Errorf("postgres: opening pool: %w", err)
	}
	return &Pool{pool: pool}, nil
}

// Ping confirms the database is actually responding. Used by /healthz.
func (p *Pool) Ping(ctx context.Context) error {
	if err := p.pool.Ping(ctx); err != nil {
		return fmt.Errorf("postgres: ping: %w", err)
	}
	return nil
}

// Close releases the pool. Called during graceful shutdown.
func (p *Pool) Close() {
	p.pool.Close()
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// isInvalidTextRepresentation reports whether err is Postgres rejecting
// a value's literal syntax for its column type (SQLSTATE 22P02) — the
// case a UUID column raises for a WHERE id = $1 lookup when id isn't
// validly UUID-shaped at all (e.g. a caller passing a URL path segment
// straight through without ever having looked anything up). Every
// repository method that resolves an ID this way treats this the same
// as pgx.ErrNoRows: a malformed ID can't possibly match a row either,
// and the alternative — letting the raw driver error bubble up — turns
// a routine "not found" into an unmapped 500.
func isInvalidTextRepresentation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "22P02"
}
