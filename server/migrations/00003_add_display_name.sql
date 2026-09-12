-- +goose Up
ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
UPDATE users SET display_name = split_part(email, '@', 1) WHERE display_name = '';

-- +goose Down
ALTER TABLE users DROP COLUMN display_name;
