import type { TFunction } from 'i18next';

import { API_ERROR_CODES, type KnownApiErrorCode } from '../api/errorCodes';
import { ApiError } from '../api/http';

// Kept exhaustive on purpose: the backend's own `message` field is only
// ever in Portuguese (translating it there would mean duplicating an
// entire Go i18n setup for no benefit, since the client already has
// one) — so anything missing from this set falls back to that raw
// Portuguese string even in an English session.
const KNOWN_ERROR_CODES = new Set<KnownApiErrorCode>(API_ERROR_CODES);

/**
 * Turns a caught error into a message to show the user, in the current
 * language. Never renders a raw backend message when a translation
 * exists — that's what keeps the UI from mixing languages after a failed
 * request.
 */
export function translateError(t: TFunction, error: unknown): string {
	if (error instanceof ApiError && KNOWN_ERROR_CODES.has(error.code as KnownApiErrorCode)) {
		return t(`errors.${error.code}`);
	}
	if (error instanceof ApiError) {
		return error.message;
	}
	return t('errors.unexpected');
}
