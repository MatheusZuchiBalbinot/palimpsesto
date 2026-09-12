import { apiFetch } from './http';
import type { UserId } from './ids';
import type { PublicKeysDTO, SetPublicKeysRequest, SetWrappedPrivateKeysRequest, WrappedPrivateKeysDTO } from './keysTypes';

export function setPublicKeys(body: SetPublicKeysRequest): Promise<void> {
	return apiFetch<void>('/api/users/me/keys', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function getOwnPublicKeys(): Promise<PublicKeysDTO> {
	return apiFetch<PublicKeysDTO>('/api/users/me/keys');
}

export function lookupUser(email: string): Promise<PublicKeysDTO> {
	return apiFetch<PublicKeysDTO>(`/api/users/lookup?email=${encodeURIComponent(email)}`);
}

/** Any user's published public keys by ID — what verifying an update's
 * Ed25519 signature needs when the author is no longer a member of the
 * document (a removal can happen at any time) and is therefore no longer
 * resolvable via the member list's email. */
export function getPublicKeysByID(userId: UserId): Promise<PublicKeysDTO> {
	return apiFetch<PublicKeysDTO>(`/api/users/${userId}/keys`);
}

export function setWrappedPrivateKeys(body: SetWrappedPrivateKeysRequest): Promise<void> {
	return apiFetch<void>('/api/users/me/private-keys', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export function getOwnWrappedPrivateKeys(): Promise<WrappedPrivateKeysDTO> {
	return apiFetch<WrappedPrivateKeysDTO>('/api/users/me/private-keys');
}
