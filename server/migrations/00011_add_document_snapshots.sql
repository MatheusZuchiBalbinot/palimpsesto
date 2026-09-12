-- +goose Up

CREATE TABLE doc_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    doc_id          UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    key_epoch       INT NOT NULL,
    up_to_update_id BIGINT NOT NULL,
    ciphertext      BYTEA NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX doc_snapshots_doc_id_id_idx ON doc_snapshots (doc_id, id DESC);

-- +goose Down
DROP TABLE doc_snapshots;
