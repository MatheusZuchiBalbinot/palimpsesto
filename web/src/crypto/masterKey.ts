// "Where the private key lives" — the master key hierarchy:
//
//   password ──Argon2id(password, salt_mk)──► MK (never leaves the browser)
//     MK ──HKDF(info="palimpsesto/login/v1")──► loginKey ──► sent to the server
//     MK ──HKDF(info="palimpsesto/wrap/v1")───► wrapKey  ──► wraps the private keys
//
// Deliberately the pure-JS argon2id from @noble/hashes, not the
// WASM-based `argon2-browser` — same algorithm and parameters, same
// already-audited @noble family used throughout the rest of this
// project's cryptography, and it avoids bundling/loading a separate
// .wasm asset via Vite/Docker with no security difference. This isn't
// "inventing a primitive" — it's just a different implementation of
// the same one.
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

// Argon2id(m=64MiB, t=3, p=1) — the same cost the server uses for its
// own login_key_hash (server/internal/domain/user/password.go), chosen
// independently for each derivation's security needs. `m` here is in
// KiB per the noble API — 64 MiB expressed in KiB.
const ARGON2_MEMORY_KIB = 65536;
export const MASTER_KEY_ARGON2_PARAMS = { m: ARGON2_MEMORY_KIB, t: 3, p: 1, dkLen: 32 };

export const SALT_MK_LENGTH = 16;
const LOGIN_KEY_INFO = utf8ToBytes('palimpsesto/login/v1');
const WRAP_KEY_INFO = utf8ToBytes('palimpsesto/wrap/v1');
const DERIVED_KEY_LENGTH = 32;

/** A fresh, random salt_mk for a newly created account — the client
 * generates and controls the entire cryptographic material, the server
 * only stores and later returns this (publicly, by email, so that a
 * returning user can derive the same MK before authenticating — an
 * account-existence-leak trade-off that is knowingly accepted). */
export function generateSaltMK(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(SALT_MK_LENGTH));
}

/** Derives the master key from a password and the account's salt_mk.
 * Deliberately slow (~1s) — that's Argon2id's memory-hardness doing its
 * job, not a bug to optimize away. onProgress feeds a progress bar
 * since this blocks noticeably. */
export async function deriveMasterKey(password: string, saltMK: Uint8Array, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
	return argon2idAsync(password, saltMK, { ...MASTER_KEY_ARGON2_PARAMS, onProgress });
}

/** HKDF(MK, info="palimpsesto/login/v1") — sent to the server in place
 * of the password; safe to hand over because it proves identity but
 * doesn't allow deriving wrapKey ("why two derivations from the
 * password"). */
export function deriveLoginKey(masterKey: Uint8Array): Uint8Array {
	return hkdf(sha256, masterKey, undefined, LOGIN_KEY_INFO, DERIVED_KEY_LENGTH);
}

/** HKDF(MK, info="palimpsesto/wrap/v1") — never leaves the browser;
 * wraps (and later unwraps) the identity private keys. */
export function deriveWrapKey(masterKey: Uint8Array): Uint8Array {
	return hkdf(sha256, masterKey, undefined, WRAP_KEY_INFO, DERIVED_KEY_LENGTH);
}
