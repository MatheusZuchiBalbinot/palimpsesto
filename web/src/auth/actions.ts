// Orchestrates an API call together with the session store update — and
// the master key derivation and identity recovery/setup that need to
// happen around it — so pages call these functions, not api/auth.ts or
// crypto/* directly, and the session never gets out of sync with a
// successful login/register.
import {
	changePassword as apiChangePassword,
	login as apiLogin,
	logout as apiLogout,
	refresh as apiRefresh,
	register as apiRegister,
	getSalt,
} from '../api/auth';
import type { ChangePasswordRequest, LoginRequest, RegisterRequest } from '../api/authTypes';
import { getOwnWrappedPrivateKeys, setWrappedPrivateKeys } from '../api/keys';
import type { SetWrappedPrivateKeysRequest } from '../api/keysTypes';
import { base64ToBytes, bytesToBase64 } from '../crypto/identity';
import { recoverIdentityOnLogin, setupIdentityForNewAccount } from '../crypto/identityFlow';
import { saveIdentityKeyPair } from '../crypto/identityStore';
import { deriveLoginKey, deriveMasterKey, deriveWrapKey, generateSaltMK } from '../crypto/masterKey';
import { unwrapPrivateKeys, wrapPrivateKeys } from '../crypto/wrapPrivateKeys';
import { clearSession, getSession, setSession } from './session';

export type Credentials = {
	email: string;
	password: string;
};

export type RegisterCredentials = {
	displayName: string;
} & Credentials;

/** Fired during the ~1s Argon2id derivation — intentionally slow, so the
 * UI should say so rather than appear frozen. */
export type DerivationProgress = (fraction: number) => void;

export async function login(credentials: Credentials, onProgress?: DerivationProgress): Promise<void> {
	const { salt_mk } = await getSalt(credentials.email);
	const masterKey = await deriveMasterKey(credentials.password, base64ToBytes(salt_mk), onProgress);
	const loginKey = deriveLoginKey(masterKey);

	const loginInput: LoginRequest = { email: credentials.email, login_key: bytesToBase64(loginKey) };
	const response = await apiLogin(loginInput);
	setSession({ accessToken: response.access_token, user: response.user });

	// Fire-and-forget: recovering the identity isn't on the critical path
	// to reaching the vault, and a failure here shouldn't block that — see
	// recoverIdentityOnLogin's own comment for what it does and doesn't
	// tolerate silently.
	void recoverIdentityOnLogin(response.user.user_id, deriveWrapKey(masterKey));
}

export async function register(credentials: RegisterCredentials, onProgress?: DerivationProgress): Promise<void> {
	const saltMK = generateSaltMK();
	const masterKey = await deriveMasterKey(credentials.password, saltMK, onProgress);
	const loginKey = deriveLoginKey(masterKey);

	const registerInput: RegisterRequest = {
		email: credentials.email,
		login_key: bytesToBase64(loginKey),
		display_name: credentials.displayName,
		salt_mk: bytesToBase64(saltMK),
	};
	await apiRegister(registerInput);

	// The flow drops straight into the vault after registering, with no
	// separate login screen — so we log in with the same already-derived
	// credentials right after creating the account (without needing to run
	// Argon2id again over the same password).
	const loginInput: LoginRequest = { email: credentials.email, login_key: bytesToBase64(loginKey) };
	const response = await apiLogin(loginInput);
	setSession({ accessToken: response.access_token, user: response.user });

	await setupIdentityForNewAccount(response.user.user_id, deriveWrapKey(masterKey));
}

export type ChangePasswordCredentials = {
	email: string;
	currentPassword: string;
	newPassword: string;
};

/** Changes the account password: re-verifies the current one server-side
 * (ChangePasswordHandler, not trusting the active session alone), then
 * re-wraps the SAME identity private keys with a wrapKey derived from the
 * new password — never regenerating or touching the keys themselves
 * ("never touching the private key itself"). Runs Argon2id twice (current
 * password, then new password), so onProgress fires across both halves of
 * the ~2s total, not all at once. */
// onProgress should look like a continuous bar across both halves,
// not jump back to 0% partway through, so each derivation's fraction is
// scaled to its half of the total.
const PROGRESS_HALF_WEIGHT = 0.5;

export async function changePassword(credentials: ChangePasswordCredentials, onProgress?: DerivationProgress): Promise<void> {
	const session = getSession();
	if (!session) {
		throw new Error('changePassword called with no active session');
	}

	const { salt_mk } = await getSalt(credentials.email);
	const scaleProgressForCurrentPassword: DerivationProgress | undefined = onProgress && ((f) => onProgress(f * PROGRESS_HALF_WEIGHT));
	const currentMasterKey = await deriveMasterKey(credentials.currentPassword, base64ToBytes(salt_mk), scaleProgressForCurrentPassword);
	const currentLoginKey = deriveLoginKey(currentMasterKey);
	const currentWrapKey = deriveWrapKey(currentMasterKey);

	// Recovers (or confirms) the identity under the CURRENT wrapKey before
	// anything changes server-side — if this fails (e.g. the current
	// password was actually wrong), nothing below will have run yet.
	const identity = await recoverIdentityOnLogin(session.user.user_id, currentWrapKey);

	const newSaltMK = generateSaltMK();
	const scaleProgressForNewPassword: DerivationProgress | undefined =
		onProgress && ((f) => onProgress(PROGRESS_HALF_WEIGHT + f * PROGRESS_HALF_WEIGHT));
	const newMasterKey = await deriveMasterKey(credentials.newPassword, newSaltMK, scaleProgressForNewPassword);
	const newLoginKey = deriveLoginKey(newMasterKey);
	const newWrapKey = deriveWrapKey(newMasterKey);

	const changePasswordInput: ChangePasswordRequest = {
		current_login_key: bytesToBase64(currentLoginKey),
		new_login_key: bytesToBase64(newLoginKey),
		new_salt_mk: bytesToBase64(newSaltMK),
	};
	await apiChangePassword(changePasswordInput);

	const wrapped = wrapPrivateKeys(newWrapKey, identity);
	const wrappedPrivateKeysInput: SetWrappedPrivateKeysRequest = {
		ciphertext: bytesToBase64(wrapped.ciphertext),
		nonce: bytesToBase64(wrapped.nonce),
	};
	await setWrappedPrivateKeys(wrappedPrivateKeysInput);
	await saveIdentityKeyPair(session.user.user_id, identity, true);
}

/** Confirms a password against the account's real, server-side wrapped
 * private keys — for LockScreen's unlock check, where a wrong guess must
 * actually fail, not just "look locked". Deliberately does NOT go through
 * recoverIdentityOnLogin: that function returns the local cache the
 * instant one exists (crypto/identityFlow.ts's own doc comment — "from
 * this device's local cache if it's already there"), which would make
 * *any* password unlock a session whose identity was already cached. This
 * always re-derives wrapKey and re-fetches+unwraps the server's copy,
 * so a wrong password genuinely fails to decrypt it. */
export async function verifyPassword(email: string, password: string, onProgress?: DerivationProgress): Promise<boolean> {
	const { salt_mk } = await getSalt(email);
	const masterKey = await deriveMasterKey(password, base64ToBytes(salt_mk), onProgress);
	const wrapKey = deriveWrapKey(masterKey);

	try {
		const dto = await getOwnWrappedPrivateKeys();
		const wrapped = { ciphertext: base64ToBytes(dto.ciphertext), nonce: base64ToBytes(dto.nonce) };
		unwrapPrivateKeys(wrapKey, wrapped);
		return true;
	} catch {
		return false;
	}
}

export async function logout(): Promise<void> {
	try {
		await apiLogout();
	} finally {
		clearSession();
	}
}

/** Restores `session` only from the httpOnly refresh cookie, for the one
 * moment nothing else can: right after a fresh full page load. `session`
 * lives only in memory (session.ts's own comment explains why: an access
 * token surviving a reload isn't worth the extra XSS exposure) — so
 * without this, reloading the page, opening a link in a new tab, or the
 * browser restoring a tab after restarting all looked exactly like being
 * logged out, even with a perfectly valid refresh cookie sitting there
 * unused. api/http.ts's own transparent-refresh-on-401 doesn't cover this
 * case: it only fires from a request that already had a session to retry
 * (`if (!session) return false` in tryRefresh) — there's nothing to retry
 * on the very first request of a fresh load.
 *
 * Doesn't touch identity keys: crypto/identityStore.ts's cache is its own,
 * independent, already-persistent (IndexedDB) thing, indexed by
 * user_id — nothing here needs to run Argon2id or recoverIdentityOnLogin
 * again, since key recovery at login time only mattered to populate that
 * cache the first time. If the cache is genuinely gone (a different
 * browser, or someone cleared storage), every page that calls
 * loadIdentityKeyPair already handles a null result without breaking —
 * this function's only job is `session`, not identity.
 *
 * Returns whether it worked — RequireSession is the only caller, and
 * treats false exactly as "no session" has always meant: back to /login. */
export async function bootstrapSession(): Promise<boolean> {
	try {
		const response = await apiRefresh();
		setSession({ accessToken: response.access_token, user: response.user });
		return true;
	} catch {
		return false;
	}
}
