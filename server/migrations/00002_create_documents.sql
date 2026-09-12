-- +goose Up

CREATE TABLE documents (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title_ciphertext TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE doc_members (
    doc_id   UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    user_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role     TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'reader')),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (doc_id, user_id)
);

CREATE TABLE doc_updates (
    id         BIGSERIAL PRIMARY KEY,
    doc_id     UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES users (id),
    ciphertext BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX doc_members_user_id_idx ON doc_members (user_id);
CREATE INDEX doc_updates_doc_id_id_idx ON doc_updates (doc_id, id);

-- +goose Down
DROP TABLE doc_updates;
DROP TABLE doc_members;
DROP TABLE documents;
