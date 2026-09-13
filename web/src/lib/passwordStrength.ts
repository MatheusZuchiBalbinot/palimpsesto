import { PASSWORD_MIN_LENGTH } from '../constants';

export type PasswordRequirementKey = 'length' | 'lowercase' | 'uppercase' | 'number' | 'symbol';

export type PasswordRequirement = {
	key: PasswordRequirementKey;
	satisfied: boolean;
};

const LOWERCASE_PATTERN = /[a-z]/;
const UPPERCASE_PATTERN = /[A-Z]/;
const NUMBER_PATTERN = /[0-9]/;
const SYMBOL_PATTERN = /[^A-Za-z0-9]/;

/** Every account's master key hinges entirely on this one secret (see
 * docs/CRYPTO.md — there's no 2FA, no server-side complexity check possible
 * since the server never sees the raw password at all). A weak password
 * here isn't "one factor among several" the way it is on most sites — it's
 * the whole security model, so this is enforced client-side at account
 * creation instead of left as a suggestion. */
export function checkPasswordRequirements(password: string): PasswordRequirement[] {
	return [
		{ key: 'length', satisfied: password.length >= PASSWORD_MIN_LENGTH },
		{ key: 'lowercase', satisfied: LOWERCASE_PATTERN.test(password) },
		{ key: 'uppercase', satisfied: UPPERCASE_PATTERN.test(password) },
		{ key: 'number', satisfied: NUMBER_PATTERN.test(password) },
		{ key: 'symbol', satisfied: SYMBOL_PATTERN.test(password) },
	];
}

export function isPasswordStrong(password: string): boolean {
	return checkPasswordRequirements(password).every((requirement) => requirement.satisfied);
}
