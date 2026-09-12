-- +goose Up

ALTER TABLE documents ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX documents_deleted_at_idx ON documents (deleted_at) WHERE deleted_at IS NOT NULL;

-- +goose Down
DROP INDEX documents_deleted_at_idx;
ALTER TABLE documents DROP COLUMN deleted_at;
