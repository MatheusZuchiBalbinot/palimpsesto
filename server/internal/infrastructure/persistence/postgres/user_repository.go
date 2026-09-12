package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"palimpsesto/internal/domain/user"
)

// UserRepository implements user.Repository over Postgres.
type UserRepository struct {
	pool *Pool
}

func NewUserRepository(pool *Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

func (r *UserRepository) Create(ctx context.Context, in user.NewAccount) (user.ID, error) {
	var id string
	err := r.pool.pool.QueryRow(ctx,
		`INSERT INTO users (email, display_name, login_key_hash, argon_params, salt_mk) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		in.Email, in.DisplayName, in.LoginKeyHash, in.ArgonParams, in.SaltMK,
	).Scan(&id)
	if isUniqueViolation(err) {
		return "", user.ErrEmailTaken
	}
	if err != nil {
		return "", fmt.Errorf("postgres: creating user: %w", err)
	}
	return user.ID(id), nil
}

func (r *UserRepository) FindByEmail(ctx context.Context, email user.Email) (user.Credentials, error) {
	var (
		id, displayName, loginKeyHash, argonParams string
		saltMK                                     []byte
	)
	err := r.pool.pool.QueryRow(ctx,
		`SELECT id, display_name, login_key_hash, argon_params, salt_mk FROM users WHERE email = $1`,
		email,
	).Scan(&id, &displayName, &loginKeyHash, &argonParams, &saltMK)
	if errors.Is(err, pgx.ErrNoRows) {
		return user.Credentials{}, user.ErrNotFound
	}
	if err != nil {
		return user.Credentials{}, fmt.Errorf("postgres: finding user by email: %w", err)
	}

	return user.Credentials{
		Account: user.Account{
			ID:          user.ID(id),
			Email:       email,
			DisplayName: user.DisplayName(displayName),
		},
		LoginKeyHash: loginKeyHash,
		ArgonParams:  argonParams,
		SaltMK:       saltMK,
	}, nil
}

func (r *UserRepository) FindByID(ctx context.Context, userID user.ID) (user.Credentials, error) {
	var (
		email, displayName, loginKeyHash, argonParams string
		saltMK                                        []byte
	)
	err := r.pool.pool.QueryRow(ctx,
		`SELECT email, display_name, login_key_hash, argon_params, salt_mk FROM users WHERE id = $1`,
		userID,
	).Scan(&email, &displayName, &loginKeyHash, &argonParams, &saltMK)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return user.Credentials{}, user.ErrNotFound
	}
	if err != nil {
		return user.Credentials{}, fmt.Errorf("postgres: finding user by id: %w", err)
	}

	return user.Credentials{
		Account: user.Account{
			ID:          userID,
			Email:       user.Email(email),
			DisplayName: user.DisplayName(displayName),
		},
		LoginKeyHash: loginKeyHash,
		ArgonParams:  argonParams,
		SaltMK:       saltMK,
	}, nil
}

func (r *UserRepository) UpdateLoginKeyMaterial(ctx context.Context, userID user.ID, material user.NewLoginKeyMaterial) error {
	tag, err := r.pool.pool.Exec(ctx,
		`UPDATE users SET login_key_hash = $2, argon_params = $3, salt_mk = $4 WHERE id = $1`,
		userID, material.LoginKeyHash, material.ArgonParams, material.SaltMK,
	)
	if err != nil {
		return fmt.Errorf("postgres: updating login key material: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return user.ErrNotFound
	}
	return nil
}

func (r *UserRepository) UpdateDisplayName(ctx context.Context, userID user.ID, displayName user.DisplayName) error {
	tag, err := r.pool.pool.Exec(ctx,
		`UPDATE users SET display_name = $2 WHERE id = $1`,
		userID, displayName,
	)
	if err != nil {
		return fmt.Errorf("postgres: updating display name: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return user.ErrNotFound
	}
	return nil
}
