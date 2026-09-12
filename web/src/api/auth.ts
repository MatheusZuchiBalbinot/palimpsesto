import type { ChangePasswordRequest, DeviceDTO, LoginRequest, LoginResponse, RegisterRequest, SaltResponse, UpdateProfileRequest } from './authTypes';
import { apiFetch } from './http';
import type { FamilyId } from './ids';

export function register(body: RegisterRequest): Promise<void> {
	return apiFetch<void>('/api/auth/register', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function login(body: LoginRequest): Promise<LoginResponse> {
	return apiFetch<LoginResponse>('/api/auth/login', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function logout(): Promise<void> {
	return apiFetch<void>('/api/auth/logout', { method: 'POST' });
}

/** Trades the httpOnly refresh cookie for a new access token and account
 * info — same response shape as login. Used two ways: api/http.ts's
 * transparent 401 retry (an access token simply expiring mid-session),
 * and auth/actions.ts's bootstrapSession (a fresh page load has no
 * session.user in memory, only this cookie — see that function's comment
 * for why this needs to return account info instead of just
 * `{access_token}`). Throws ApiError (401 invalid_refresh_token) if the
 * cookie is missing, expired, or already revoked. */
export function refresh(): Promise<LoginResponse> {
	return apiFetch<LoginResponse>('/api/auth/refresh', { method: 'POST' });
}

/** Fetches an account's salt_mk by email — deliberately callable before
 * login (the master-key hierarchy needs it to derive anything, including
 * what login authenticates with). */
export function getSalt(email: string): Promise<SaltResponse> {
	return apiFetch<SaltResponse>(`/api/auth/salt?email=${encodeURIComponent(email)}`);
}

export function changePassword(body: ChangePasswordRequest): Promise<void> {
	return apiFetch<void>('/api/auth/change-password', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

/** Changes the caller's own display name — the only account field a user
 * can edit after registration. */
export function updateProfile(body: UpdateProfileRequest): Promise<void> {
	return apiFetch<void>('/api/users/me', {
		method: 'PATCH',
		body: JSON.stringify(body),
	});
}

/** Every device currently logged into the caller's own account. */
export function listDevices(): Promise<DeviceDTO[]> {
	return apiFetch<DeviceDTO[]>('/api/users/me/devices');
}

/** Logs out a specific device by its family_id (from listDevices) —
 * never specifically the caller's current session, only whichever device
 * is chosen. */
export function revokeDevice(familyId: FamilyId): Promise<void> {
	return apiFetch<void>(`/api/users/me/devices/${familyId}`, { method: 'DELETE' });
}
