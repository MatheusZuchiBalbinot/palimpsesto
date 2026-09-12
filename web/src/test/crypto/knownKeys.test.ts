import { beforeEach, describe, expect, it } from 'vitest';

import { toUserId } from '../../api/ids';
import { checkKnownKey, trustKey } from '../../crypto/knownKeys';

const alice = toUserId('alice');
const bob = toUserId('bob');

describe('checkKnownKey / trustKey', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('reports first-time for a user never seen before', () => {
		expect(checkKnownKey({ userId: alice, identityPub: 'idpub-a', signingPub: 'signpub-a' })).toBe('first-time');
	});

	it('reports unchanged once the same key has been trusted', () => {
		trustKey({ userId: alice, identityPub: 'idpub-a', signingPub: 'signpub-a' });
		expect(checkKnownKey({ userId: alice, identityPub: 'idpub-a', signingPub: 'signpub-a' })).toBe('unchanged');
	});

	it('reports changed when either key differs from what was trusted', () => {
		trustKey({ userId: alice, identityPub: 'idpub-a', signingPub: 'signpub-a' });
		expect(checkKnownKey({ userId: alice, identityPub: 'idpub-b', signingPub: 'signpub-a' })).toBe('changed');
		expect(checkKnownKey({ userId: alice, identityPub: 'idpub-a', signingPub: 'signpub-b' })).toBe('changed');
	});

	it('never trusts a key implicitly just by checking it', () => {
		checkKnownKey({ userId: alice, identityPub: 'idpub-a', signingPub: 'signpub-a' });
		expect(checkKnownKey({ userId: alice, identityPub: 'idpub-a', signingPub: 'signpub-a' })).toBe('first-time');
	});

	it('keeps separate trust per user id', () => {
		trustKey({ userId: alice, identityPub: 'idpub-a', signingPub: 'signpub-a' });
		expect(checkKnownKey({ userId: bob, identityPub: 'idpub-a', signingPub: 'signpub-a' })).toBe('first-time');
	});
});
