# Migrations

Managed with [goose](https://github.com/pressly/goose), run via `go run`
(not a module dependency — that avoids pulling goose's entire tree of
database drivers into the server's `go.mod`).

```sh
make migrate-create name=create_something
make migrate-up
make migrate-down
```

- `00001_create_users_and_sessions.sql` — Fase 1: `users` and `sessions`,
  with the `family_id` column that makes refresh-token rotation and reuse
  detection possible (see `internal/auth`).
- `00006_add_document_soft_delete.sql` — `documents.deleted_at`, so
  deleting a document can be undone (a toast's "undo" button) instead of
  losing it immediately.
