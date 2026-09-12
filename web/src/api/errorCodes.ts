// Every error `code` the backend actually emits, per
// server/internal/interfaces/http/responses/errors.go and its
// middlewares/handlers — see that file's WriteError call sites for the
// full, current list. The single source of truth for both ApiError.code's
// type (api/http.ts) and i18n/errors.ts's translation lookup — previously
// redeclared independently in each, so a typo on either side (e.g.
// 'invitelink_not_found' vs. 'invite_link_not_found') compiled fine and
// only surfaced as a silently-generic error message.
export const API_ERROR_CODES = [
	'email_taken',
	'invalid_credentials',
	'invalid_refresh_token',
	'rate_limited',
	'invalid_body',
	'invalid_request',
	'unauthenticated',
	'internal_error',
	'not_found',
	'not_owner',
	'not_member',
	'not_comment_author',
	'already_member',
	'user_not_found',
	'invite_link_not_found',
	'comment_not_found',
	'keys_not_found',
	'invalid_public_keys',
	'invalid_salt',
	'private_keys_not_found',
	'invalid_private_keys',
	'pending_wrapped_dek',
	'cannot_remove_owner',
	'incomplete_rotation',
	'not_editor',
	'device_not_found',
	'snapshot_not_found',
	'invite_not_found',
	'already_invited',
	'invite_stale',
] as const;

/** A code the backend is documented to emit. */
export type KnownApiErrorCode = (typeof API_ERROR_CODES)[number];

/** `KnownApiErrorCode`, plus the client-side fallback assigned when a
 * response's body is missing or malformed (api/http.ts's
 * throwForErrorResponse) — not a code the backend itself ever sends, so it
 * deliberately isn't in API_ERROR_CODES / KNOWN_ERROR_CODES and has no
 * `errors.unknown_error` translation key; translateError falls back to the
 * raw message for it instead. */
export type ApiErrorCode = KnownApiErrorCode | 'unknown_error';
