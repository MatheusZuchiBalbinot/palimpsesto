// DTOs for /api/users/me/keys and /api/users/lookup, per
// server/internal/interfaces/http/handlers/keys_handler.go.

import type { UserId } from './ids';

/** Both key fields are standard base64. */
export type SetPublicKeysRequest = {
	identity_pub: string;
	signing_pub: string;
};

export type PublicKeysDTO = {
	user_id: UserId;
	identity_pub: string;
	signing_pub: string;
	/** 12 groups of 5 digits — the "safety number". */
	fingerprint: string;
	/** Only set by GET /api/users/lookup (the invite-by-email flow) —
	 * empty string for every other endpoint that returns this shape. */
	display_name: string;
};

/** Both fields are standard base64. */
export type SetWrappedPrivateKeysRequest = {
	ciphertext: string;
	nonce: string;
};

export type WrappedPrivateKeysDTO = {
	ciphertext: string;
	nonce: string;
};
