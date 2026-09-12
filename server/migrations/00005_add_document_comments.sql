-- +goose Up

CREATE TABLE document_comments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id      UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    author_id        UUID NOT NULL REFERENCES users (id),
    body_ciphertext  TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at      TIMESTAMPTZ
);

CREATE INDEX document_comments_document_id_created_at_idx
    ON document_comments (document_id, created_at);

-- +goose Down
DROP TABLE document_comments;
