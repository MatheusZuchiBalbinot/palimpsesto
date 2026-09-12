-- +goose Up

CREATE TABLE folders (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX folders_owner_id_idx ON folders (owner_id);

ALTER TABLE documents ADD COLUMN folder_id UUID REFERENCES folders (id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE documents DROP COLUMN folder_id;
DROP TABLE folders;
