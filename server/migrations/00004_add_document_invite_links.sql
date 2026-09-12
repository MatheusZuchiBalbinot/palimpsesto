-- +goose Up

-- One active share link per document. `token` is the bearer credential
-- itself (like a Google Docs/Notion share link) — recoverable by the owner
-- while active, unlike a refresh token, since its blast radius is scoped to
-- one document at a grantable role, not an account.
CREATE TABLE document_invite_links (
    document_id UUID PRIMARY KEY REFERENCES documents (id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    role        TEXT NOT NULL CHECK (role IN ('editor', 'reader')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE document_invite_links;
