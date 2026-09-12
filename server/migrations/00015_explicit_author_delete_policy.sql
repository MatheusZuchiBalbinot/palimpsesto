-- +goose Up

ALTER TABLE doc_updates
    DROP CONSTRAINT doc_updates_author_id_fkey,
    ADD CONSTRAINT doc_updates_author_id_fkey
        FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE RESTRICT;

ALTER TABLE document_comments
    DROP CONSTRAINT document_comments_author_id_fkey,
    ADD CONSTRAINT document_comments_author_id_fkey
        FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE RESTRICT;

-- +goose Down
ALTER TABLE doc_updates
    DROP CONSTRAINT doc_updates_author_id_fkey,
    ADD CONSTRAINT doc_updates_author_id_fkey
        FOREIGN KEY (author_id) REFERENCES users (id);

ALTER TABLE document_comments
    DROP CONSTRAINT document_comments_author_id_fkey,
    ADD CONSTRAINT document_comments_author_id_fkey
        FOREIGN KEY (author_id) REFERENCES users (id);
