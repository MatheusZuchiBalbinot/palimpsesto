-- +goose Up

ALTER TABLE doc_members ADD COLUMN wrapped_dek BYTEA;
ALTER TABLE doc_members ADD COLUMN key_epoch INT NOT NULL DEFAULT 1;

-- +goose Down
ALTER TABLE doc_members DROP COLUMN key_epoch;
ALTER TABLE doc_members DROP COLUMN wrapped_dek;
