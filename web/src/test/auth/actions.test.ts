import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { refresh } from '../../api/auth';
import { toUserId } from '../../api/ids';
import { bootstrapSession } from '../../auth/actions';
import { clearSession, getSession } from '../../auth/session';

vi.mock('../../api/auth', () => ({
	refresh: vi.fn(),
}));

const mockedRefresh = vi.mocked(refresh);

// bootstrapSession is what lets a fresh page load (a reload, a link
// opened in a new tab) restore `session` from just the httpOnly refresh
// cookie — session.ts deliberately never persists to localStorage, so
// without this, every reload would look exactly like being logged out
// even with a perfectly valid, unused cookie. See RequireSession.tsx, the
// only caller.
describe('bootstrapSession', () => {
	beforeEach(() => {
		mockedRefresh.mockReset();
	});

	afterEach(() => {
		clearSession();
	});

	it('restores the session from a successful refresh', async () => {
		mockedRefresh.mockResolvedValue({
			access_token: 'fresh-access-token',
			user: { user_id: toUserId('u1'), email: 'alice@example.com', display_name: 'Alice' },
		});

		const didBootstrap = await bootstrapSession();

		expect(didBootstrap).toBe(true);
		expect(getSession()).toEqual({
			accessToken: 'fresh-access-token',
			user: { user_id: toUserId('u1'), email: 'alice@example.com', display_name: 'Alice' },
		});
	});

	it('leaves the session empty when the refresh cookie is invalid or missing', async () => {
		mockedRefresh.mockRejectedValue(new Error('401 invalid_refresh_token'));

		const didBootstrap = await bootstrapSession();

		expect(didBootstrap).toBe(false);
		expect(getSession()).toBeNull();
	});
});
