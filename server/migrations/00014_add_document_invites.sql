-- +goose Up

CREATE TABLE document_invites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    inviter_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    invitee_id  UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    wrapped_dek BYTEA NOT NULL,
    key_epoch   INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, invitee_id)
);

CREATE INDEX document_invites_invitee_id_idx ON document_invites (invitee_id);

-- +goose Down
DROP TABLE document_invites;
