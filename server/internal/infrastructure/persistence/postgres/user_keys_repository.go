package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"palimpsesto/internal/domain/user"
)

// UserKeysRepository implements user.KeyRepository over Postgres. Kept
// as a separate struct (rather than embedded in UserRepository) because
// it's genuinely a distinct responsibility — an account and its
// published keys have different lifecycles (an account can exist
// without keys yet).
type UserKeysRepository struct {
	pool *Pool
}

func NewUserKeysRepository(pool *Pool) *UserKeysRepository {
	return &UserKeysRepository{pool: pool}
}

// SetPublicKeys stores or replaces userID's public keys.
func (r *UserKeysRepository) SetPublicKeys(ctx context.Context, userID user.ID, keys user.PublicKeys) error {
	_, err := r.pool.pool.Exec(ctx,
		`INSERT INTO user_keys (user_id, identity_pub, signing_pub)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id) DO UPDATE
		     SET identity_pub = EXCLUDED.identity_pub,
		         signing_pub  = EXCLUDED.signing_pub,
		         updated_at   = now()`,
		userID, keys.IdentityPub, keys.SigningPub,
	)
	if err != nil {
		return fmt.Errorf("postgres: setting public keys: %w", err)
	}
	return nil
}

// FindPublicKeys fetches userID's public keys. Returns
// user.ErrKeysNotFound if they haven't published any yet.
func (r *UserKeysRepository) FindPublicKeys(ctx context.Context, userID user.ID) (user.PublicKeys, error) {
	var identityPub, signingPub []byte
	err := r.pool.pool.QueryRow(ctx,
		`SELECT identity_pub, signing_pub FROM user_keys WHERE user_id = $1`,
		userID,
	).Scan(&identityPub, &signingPub)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return user.PublicKeys{}, user.ErrKeysNotFound
	}
	if err != nil {
		return user.PublicKeys{}, fmt.Errorf("postgres: finding public keys: %w", err)
	}
	return user.PublicKeys{IdentityPub: identityPub, SigningPub: signingPub}, nil
}

// SetWrappedPrivateKeys stores or replaces userID's sealed private
// keys. Requires that a row already exist (SetPublicKeys runs first in
// every real flow — registration publishes both together) rather than
// upserting a row with null public keys, which nothing else expects to
// see.
func (r *UserKeysRepository) SetWrappedPrivateKeys(ctx context.Context, userID user.ID, keys user.WrappedPrivateKeys) error {
	tag, err := r.pool.pool.Exec(ctx,
		`UPDATE user_keys
		     SET wrapped_private_keys = $2, private_keys_nonce = $3, updated_at = now()
		 WHERE user_id = $1`,
		userID, keys.Ciphertext, keys.Nonce,
	)
	if err != nil {
		return fmt.Errorf("postgres: setting wrapped private keys: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return user.ErrKeysNotFound
	}
	return nil
}

// FindWrappedPrivateKeys fetches userID's sealed private keys. Returns
// user.ErrPrivateKeysNotFound if none has been published yet.
func (r *UserKeysRepository) FindWrappedPrivateKeys(ctx context.Context, userID user.ID) (user.WrappedPrivateKeys, error) {
	var ciphertext, nonce []byte
	err := r.pool.pool.QueryRow(ctx,
		`SELECT wrapped_private_keys, private_keys_nonce FROM user_keys WHERE user_id = $1`,
		userID,
	).Scan(&ciphertext, &nonce)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidTextRepresentation(err) {
		return user.WrappedPrivateKeys{}, user.ErrPrivateKeysNotFound
	}
	if err != nil {
		return user.WrappedPrivateKeys{}, fmt.Errorf("postgres: finding wrapped private keys: %w", err)
	}
	if ciphertext == nil {
		return user.WrappedPrivateKeys{}, user.ErrPrivateKeysNotFound
	}
	return user.WrappedPrivateKeys{Ciphertext: ciphertext, Nonce: nonce}, nil
}
