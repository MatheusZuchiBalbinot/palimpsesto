-- +goose Up

ALTER TABLE documents ADD COLUMN current_key_epoch INT NOT NULL DEFAULT 1;

CREATE TABLE doc_member_key_history (
    doc_id      UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    key_epoch   INT NOT NULL,
    wrapped_dek BYTEA NOT NULL,
    PRIMARY KEY (doc_id, user_id, key_epoch)
);

-- +goose Down
DROP TABLE doc_member_key_history;
ALTER TABLE documents DROP COLUMN current_key_epoch;
