-- +goose Up

CREATE TABLE user_keys (
    user_id      UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    identity_pub BYTEA NOT NULL,  -- X25519, 32 bytes
    signing_pub  BYTEA NOT NULL,  -- Ed25519, 32 bytes
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE user_keys;
