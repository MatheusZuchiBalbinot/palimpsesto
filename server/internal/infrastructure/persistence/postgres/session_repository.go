package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"palimpsesto/internal/domain/session"
	"palimpsesto/internal/domain/user"
)

// SessionRepository implements session.Repository over Postgres.
type SessionRepository struct {
	pool *Pool
}

func NewSessionRepository(pool *Pool) *SessionRepository {
	return &SessionRepository{pool: pool}
}

func (r *SessionRepository) Create(ctx context.Context, userID user.ID, refreshHash, deviceLabel string, expiresAt time.Time) (session.Session, error) {
	row, err := r.scanSession(r.pool.pool.QueryRow(ctx,
		`INSERT INTO sessions (user_id, family_id, refresh_hash, device_label, expires_at)
		 VALUES ($1, gen_random_uuid(), $2, $3, $4)
		 RETURNING id, user_id, family_id, refresh_hash, expires_at, revoked_at`,
		userID, refreshHash, deviceLabel, expiresAt,
	))
	if err != nil {
		return session.Session{}, fmt.Errorf("postgres: creating session: %w", err)
	}
	return row, nil
}

func (r *SessionRepository) Rotate(ctx context.Context, familyID session.FamilyID, userID user.ID, refreshHash, deviceLabel string, expiresAt time.Time) (session.Session, error) {
	row, err := r.scanSession(r.pool.pool.QueryRow(ctx,
		`INSERT INTO sessions (user_id, family_id, refresh_hash, device_label, expires_at)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, user_id, family_id, refresh_hash, expires_at, revoked_at`,
		userID, familyID, refreshHash, deviceLabel, expiresAt,
	))
	if err != nil {
		return session.Session{}, fmt.Errorf("postgres: rotating session: %w", err)
	}
	return row, nil
}

func (r *SessionRepository) FindByRefreshHash(ctx context.Context, refreshHash string) (session.Session, error) {
	row, err := r.scanSession(r.pool.pool.QueryRow(ctx,
		`SELECT id, user_id, family_id, refresh_hash, expires_at, revoked_at
		 FROM sessions WHERE refresh_hash = $1`,
		refreshHash,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return session.Session{}, session.ErrInvalidRefreshToken
	}
	if err != nil {
		return session.Session{}, fmt.Errorf("postgres: finding session: %w", err)
	}
	return row, nil
}

func (r *SessionRepository) Revoke(ctx context.Context, id session.ID) error {
	_, err := r.pool.pool.Exec(ctx,
		`UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, id)
	if err != nil {
		return fmt.Errorf("postgres: revoking session: %w", err)
	}
	return nil
}

func (r *SessionRepository) RevokeFamily(ctx context.Context, familyID session.FamilyID) error {
	_, err := r.pool.pool.Exec(ctx,
		`UPDATE sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`, familyID)
	if err != nil {
		return fmt.Errorf("postgres: revoking family: %w", err)
	}
	return nil
}

// ListActiveByUser returns the most recent link in each still-usable
// family — DISTINCT ON (family_id) ordered by created_at DESC within
// each family selects exactly that row, per Postgres's documented
// DISTINCT ON semantics.
func (r *SessionRepository) ListActiveByUser(ctx context.Context, userID user.ID) ([]session.Session, error) {
	rows, err := r.pool.pool.Query(ctx,
		`SELECT DISTINCT ON (family_id)
		        id, user_id, family_id, refresh_hash, device_label, expires_at, revoked_at, created_at
		 FROM sessions
		 WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
		 ORDER BY family_id, created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("postgres: listing active sessions: %w", err)
	}
	defer rows.Close()

	var sessions []session.Session
	for rows.Next() {
		s, err := r.scanSessionWithDevice(rows)
		if err != nil {
			return nil, fmt.Errorf("postgres: scanning session row: %w", err)
		}
		sessions = append(sessions, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("postgres: iterating active sessions: %w", err)
	}
	return sessions, nil
}

// RevokeFamilyForUser is RevokeFamily scoped to userID — the WHERE
// clause itself is the ownership check, so a family that exists but
// belongs to someone else looks identical to one that doesn't exist.
func (r *SessionRepository) RevokeFamilyForUser(ctx context.Context, familyID session.FamilyID, userID user.ID) error {
	tag, err := r.pool.pool.Exec(ctx,
		`UPDATE sessions SET revoked_at = now()
		 WHERE family_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
		familyID, userID,
	)
	if err != nil {
		return fmt.Errorf("postgres: revoking family for user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return session.ErrNotFound
	}
	return nil
}

// row is the query interface pgxpool.Pool.QueryRow satisfies — narrowed
// down so scanSession can be shared by every method above without
// depending directly on pgx types in its signature.
type row interface {
	Scan(dest ...any) error
}

// The column list scanSession's caller provides must match one of two
// shapes: the six-column one every pre-existing method uses in its
// RETURNING/SELECT (no device_label/created_at — device metadata was
// never needed there), or ListActiveByUser's eight-column one. Scan
// itself always errors on a column-count mismatch, so this can't
// silently read the wrong row either way.
func (r *SessionRepository) scanSession(queried row) (session.Session, error) {
	var (
		id, userID, familyID, refreshHash string
		expiresAt                         time.Time
		revokedAt                         *time.Time
	)
	if err := queried.Scan(&id, &userID, &familyID, &refreshHash, &expiresAt, &revokedAt); err != nil {
		return session.Session{}, err
	}
	return session.Session{
		ID:          session.ID(id),
		UserID:      user.ID(userID),
		FamilyID:    session.FamilyID(familyID),
		RefreshHash: refreshHash,
		ExpiresAt:   expiresAt,
		RevokedAt:   revokedAt,
	}, nil
}

func (r *SessionRepository) scanSessionWithDevice(queried row) (session.Session, error) {
	var (
		id, userID, familyID, refreshHash, deviceLabel string
		expiresAt, createdAt                           time.Time
		revokedAt                                      *time.Time
	)
	if err := queried.Scan(&id, &userID, &familyID, &refreshHash, &deviceLabel, &expiresAt, &revokedAt, &createdAt); err != nil {
		return session.Session{}, err
	}
	return session.Session{
		ID:          session.ID(id),
		UserID:      user.ID(userID),
		FamilyID:    session.FamilyID(familyID),
		RefreshHash: refreshHash,
		DeviceLabel: deviceLabel,
		ExpiresAt:   expiresAt,
		RevokedAt:   revokedAt,
		CreatedAt:   createdAt,
	}, nil
}
