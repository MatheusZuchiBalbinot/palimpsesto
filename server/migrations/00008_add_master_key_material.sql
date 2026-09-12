-- +goose Up

ALTER TABLE users ADD COLUMN salt_mk BYTEA NOT NULL DEFAULT gen_random_bytes(16);
ALTER TABLE users ALTER COLUMN salt_mk DROP DEFAULT;

ALTER TABLE user_keys ADD COLUMN wrapped_private_keys BYTEA;
ALTER TABLE user_keys ADD COLUMN private_keys_nonce BYTEA;

-- +goose Down
ALTER TABLE user_keys DROP COLUMN private_keys_nonce;
ALTER TABLE user_keys DROP COLUMN wrapped_private_keys;
ALTER TABLE users DROP COLUMN salt_mk;
