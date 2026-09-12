import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from '../../api/http';
import { toUserId } from '../../api/ids';
import { clearSession, getSession, setSession } from '../../auth/session';
import { showToast } from '../../lib/toast';

vi.mock('../../lib/toast', () => ({
	showToast: vi.fn(),
}));

const mockedShowToast = vi.mocked(showToast);

const HTTP_UNAUTHORIZED = 401;
const HTTP_OK = 200;
const EXPECTED_FETCH_CALLS = 3;
const UNAUTHENTICATED_BODY = { error: { code: 'unauthenticated', message: 'missing or invalid access token' } };
const INVALID_REFRESH_TOKEN_BODY = { error: { code: 'invalid_refresh_token', message: 'session expired' } };

function jsonResponse(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// api/http.ts's transparent-refresh-on-401: a request made with a stale
// access token gets one silent POST /api/auth/refresh before giving up.
// This only covers the mid-session case (a session already exists) — the
// fresh-page-load case is auth/actions.ts's bootstrapSession, tested
// separately in auth/actions.test.ts.
describe('apiFetch transparent refresh', () => {
	beforeEach(() => {
		setSession({ accessToken: 'stale-token', user: { user_id: toUserId('u1'), email: 'alice@example.com', display_name: 'Alice' } });
		mockedShowToast.mockReset();
	});

	afterEach(() => {
		clearSession();
		vi.restoreAllMocks();
	});

	it('retries once with the new token when refresh succeeds, and keeps the session', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(jsonResponse(UNAUTHENTICATED_BODY, HTTP_UNAUTHORIZED))
			.mockResolvedValueOnce(jsonResponse({ access_token: 'fresh-token' }, HTTP_OK))
			.mockResolvedValueOnce(jsonResponse({ ok: true }, HTTP_OK));

		const result = await apiFetch<{ ok: boolean }>('/api/docs');

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(EXPECTED_FETCH_CALLS);
		expect(getSession()).toEqual({ accessToken: 'fresh-token', user: { user_id: 'u1', email: 'alice@example.com', display_name: 'Alice' } });
		expect(mockedShowToast).not.toHaveBeenCalled();
	});

	it('disconnects the user and shows a toast when the refresh cookie is also invalid', async () => {
		vi.spyOn(globalThis, 'fetch')
			.mockResolvedValueOnce(jsonResponse(UNAUTHENTICATED_BODY, HTTP_UNAUTHORIZED))
			.mockResolvedValueOnce(jsonResponse(INVALID_REFRESH_TOKEN_BODY, HTTP_UNAUTHORIZED));

		await expect(apiFetch('/api/docs')).rejects.toMatchObject(new ApiError('unauthenticated', 'missing or invalid access token', HTTP_UNAUTHORIZED));

		expect(getSession()).toBeNull();
		expect(mockedShowToast).toHaveBeenCalledTimes(1);
		expect(mockedShowToast).toHaveBeenCalledWith(expect.stringContaining('sessão expirada'), 'error');
	});

	it('shows the toast only once for several requests failing at the same time', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : input.toString();
			if (url.includes('/api/auth/refresh')) {
				return Promise.resolve(jsonResponse(INVALID_REFRESH_TOKEN_BODY, HTTP_UNAUTHORIZED));
			}
			return Promise.resolve(jsonResponse(UNAUTHENTICATED_BODY, HTTP_UNAUTHORIZED));
		});

		await Promise.all([apiFetch('/api/docs').catch(() => null), apiFetch('/api/docs/other').catch(() => null)]);

		expect(getSession()).toBeNull();
		expect(mockedShowToast).toHaveBeenCalledTimes(1);
	});
});
