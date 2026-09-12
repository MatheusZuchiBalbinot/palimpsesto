// Thin, typed wrapper around fetch. Every endpoint follows the error
// format documented in docs/API.md: `{"error":{"code":"...","message":"..."}}`.
//
// Also implements transparent refresh: a 401 on an authenticated call
// triggers a single silent POST /api/auth/refresh (the httpOnly cookie
// rides along automatically) before giving up.
import { clearSession, getSession, setSession, type Session } from '../auth/session';
import i18n from '../i18n/config';
import { showToast } from '../lib/toast';
import type { ApiErrorCode } from './errorCodes';

const HTTP_UNAUTHORIZED = 401;
const HTTP_NO_CONTENT = 204;

/** Shape of a backend error response. */
type ApiErrorBody = {
	error: {
		code: string;
		message: string;
	};
};

/**
 * Thrown for any non-2xx response. `code` is the stable, machine-readable
 * value the UI can switch on; `message` is human-facing and can change.
 */
export class ApiError extends Error {
	readonly code: ApiErrorCode;
	readonly status: number;

	constructor(code: ApiErrorCode, message: string, status: number) {
		super(message);
		this.name = 'ApiError';
		this.code = code;
		this.status = status;
	}
}

async function parseErrorBody(res: Response): Promise<ApiErrorBody | null> {
	try {
		return (await res.json()) as ApiErrorBody;
	} catch {
		return null;
	}
}

/** Attempts a silent refresh, updating the in-memory session on success. */
async function tryRefresh(): Promise<boolean> {
	const session = getSession();
	if (!session) {
		return false;
	}

	try {
		const res = await fetch('/api/auth/refresh', { method: 'POST' });
		if (!res.ok) {
			return false;
		}

		const body = (await res.json()) as { access_token: string };
		setSession({ accessToken: body.access_token, user: session.user });
		return true;
	} catch {
		return false;
	}
}

// The backend rotates the refresh token on every use and treats a second
// use of an already-revoked row as token reuse (server's entity.go), which
// revokes the entire session family — every device, logged out. A page
// that fires several authenticated requests in parallel (DocumentPage:
// getDocument/listMembers/listComments/fetchKeyRing) can all take a 401 at
// once from the same expired access token; without this, each one would
// call tryRefresh() independently, all presenting the same cookie, and
// only the first would actually succeed. inFlightRefresh makes every
// concurrent 401 share the same refresh attempt instead.
let inFlightRefresh: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
	inFlightRefresh ??= tryRefresh().finally(() => {
		inFlightRefresh = null;
	});
	return inFlightRefresh;
}

/** Calls a JSON endpoint and decodes the response as T, or throws ApiError. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	return doFetch<T>(path, init, true);
}

function buildHeaders(init: RequestInit | undefined, session: Session | null): Headers {
	const headers = new Headers(init?.headers);
	headers.set('Content-Type', 'application/json');
	if (session) {
		headers.set('Authorization', `Bearer ${session.accessToken}`);
	}
	return headers;
}

async function throwForErrorResponse(res: Response): Promise<never> {
	const body = await parseErrorBody(res);
	// The backend's `code` string arrives over the wire same as any DTO
	// field (api/docs.ts etc.) — trusted at this one boundary, same as
	// apiFetch<T>()'s res.json() cast, rather than re-validated against
	// ApiErrorCode's union on every read.
	const code = (body?.error.code ?? 'unknown_error') as ApiErrorCode;
	throw new ApiError(code, body?.error.message ?? `request failed with status ${res.status}`, res.status);
}

async function doFetch<T>(path: string, init: RequestInit | undefined, allowRetry: boolean): Promise<T> {
	const session = getSession();
	const res = await fetch(path, { ...init, headers: buildHeaders(init, session) });

	const isRetryableUnauthorized = res.status === HTTP_UNAUTHORIZED && !!session && allowRetry;
	if (isRetryableUnauthorized) {
		const didRefresh = await refreshOnce();
		if (didRefresh) {
			return doFetch<T>(path, init, false);
		}
		// getSession() re-checked here (not just the `session` captured above)
		// because several requests can hit this branch concurrently, sharing
		// the same refreshOnce() promise: only the first to resume still finds
		// a session to clear, so only it disconnects the user and shows the
		// toast — the rest see it already gone and skip both.
		if (getSession()) {
			clearSession();
			showToast(i18n.t('errors.invalid_refresh_token'), 'error');
		}
	}

	if (!res.ok) {
		await throwForErrorResponse(res);
	}

	// 204 (register, logout, delete, rename, and inviting a member all
	// respond this way) has no body — calling res.json() on it throws,
	// which made each of these calls fail even though the request had
	// succeeded.
	if (res.status === HTTP_NO_CONTENT) {
		return undefined as T;
	}

	return res.json() as Promise<T>;
}
