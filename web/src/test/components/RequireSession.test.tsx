import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { refresh } from '../../api/auth';
import { toUserId } from '../../api/ids';
import { clearSession } from '../../auth/session';
import { RequireSession } from '../../components/RequireSession';

vi.mock('../../api/auth', () => ({
	refresh: vi.fn(),
}));

const mockedRefresh = vi.mocked(refresh);

// RequireSession is where the bootstrapSession fix actually lands: a fresh
// page load starts with no session in memory (auth/session.ts never
// persists one), and before this fix that meant an instant redirect to
// /login on every reload, even with a perfectly valid, unused refresh
// cookie. These tests pin down the fixed behavior end-to-end, through the
// real route guard that an actual reload hits.
function renderGuarded() {
	return render(
		<MemoryRouter initialEntries={['/docs']}>
			<Routes>
				<Route path="/login" element={<div>Login page</div>} />
				<Route element={<RequireSession />}>
					<Route path="/docs" element={<div>Vault contents</div>} />
				</Route>
			</Routes>
		</MemoryRouter>,
	);
}

describe('RequireSession', () => {
	beforeEach(() => {
		mockedRefresh.mockReset();
	});

	afterEach(() => {
		clearSession();
	});

	it('renders the protected route once a silent refresh restores the session', async () => {
		mockedRefresh.mockResolvedValue({
			access_token: 'fresh-token',
			user: { user_id: toUserId('u1'), email: 'alice@example.com', display_name: 'Alice' },
		});

		renderGuarded();

		await waitFor(() => expect(screen.getByText('Vault contents')).toBeInTheDocument());
		expect(screen.queryByText('Login page')).not.toBeInTheDocument();
	});

	it('redirects to /login once the silent refresh genuinely fails (no valid cookie)', async () => {
		mockedRefresh.mockRejectedValue(new Error('401 invalid_refresh_token'));

		renderGuarded();

		await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
		expect(screen.queryByText('Vault contents')).not.toBeInTheDocument();
	});

	it('never redirects before the bootstrap attempt has even settled', () => {
		// A refresh that never resolves during this test — simulates the
		// moment right after mount, before the bootstrapSession promise has
		// settled either way. The bug this guards against: redirecting based
		// purely on the first render, before bootstrap (session is also null
		// at that point, but that's not the same as "checked and is null").
		mockedRefresh.mockImplementation(() => new Promise(() => {}));

		renderGuarded();

		expect(screen.queryByText('Login page')).not.toBeInTheDocument();
		expect(screen.queryByText('Vault contents')).not.toBeInTheDocument();
	});
});
