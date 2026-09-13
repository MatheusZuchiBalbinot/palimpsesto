import { describe, expect, it } from 'vitest';

import { PASSWORD_MIN_LENGTH } from '../../constants';
import { checkPasswordRequirements, isPasswordStrong } from '../../lib/passwordStrength';

describe('isPasswordStrong', () => {
	it('rejects an empty password', () => {
		expect(isPasswordStrong('')).toBe(false);
	});

	it('rejects a password missing one requirement (no symbol)', () => {
		expect(isPasswordStrong('Abcdefgh1234')).toBe(false);
	});

	it('rejects a password shorter than the minimum length even if otherwise varied', () => {
		expect(isPasswordStrong('Ab1!')).toBe(false);
	});

	it('accepts a password meeting every requirement', () => {
		expect(isPasswordStrong('Correct-Horse9')).toBe(true);
	});
});

describe('checkPasswordRequirements', () => {
	it('reports each requirement independently', () => {
		const requirements = checkPasswordRequirements('alllowercase');
		const byKey = Object.fromEntries(requirements.map((r) => [r.key, r.satisfied]));

		expect(byKey.length).toBe('alllowercase'.length >= PASSWORD_MIN_LENGTH);
		expect(byKey.lowercase).toBe(true);
		expect(byKey.uppercase).toBe(false);
		expect(byKey.number).toBe(false);
		expect(byKey.symbol).toBe(false);
	});
});
