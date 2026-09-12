-- +goose Up

ALTER TABLE document_comments ADD COLUMN edited_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE document_comments DROP COLUMN edited_at;
