// DTOs for /api/auth/*.
//
// login_key is derived with Argon2id/HKDF from the password on the client
// side — see crypto/masterKey.ts. The server never sees the raw password.

import type { FamilyId, UserId } from './ids';

export type RegisterRequest = {
	email: string;
	login_key: string;
	display_name: string;
	/** Standard base64 — see generateSaltMK in crypto/masterKey.ts. */
	salt_mk: string;
};

export type LoginRequest = {
	email: string;
	login_key: string;
};

export type SaltResponse = {
	salt_mk: string;
};

export type ChangePasswordRequest = {
	current_login_key: string;
	new_login_key: string;
	new_salt_mk: string;
};

export type UpdateProfileRequest = {
	display_name: string;
};

export type AuthUser = {
	user_id: UserId;
	email: string;
	display_name: string;
};

export type LoginResponse = {
	access_token: string;
	user: AuthUser;
};

/** A device currently logged in. family_id identifies the rotation family
 * to revoke, not a single token. */
export type DeviceDTO = {
	family_id: FamilyId;
	device_label: string;
	last_active_at: string;
	/** True for the device making the request that returned this list —
	 * computed fresh from the caller's own access token, never persisted. */
	is_current: boolean;
};
