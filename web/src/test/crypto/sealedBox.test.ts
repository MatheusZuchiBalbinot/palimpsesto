import { describe, expect, it } from 'vitest';

import { generateIdentityKeyPair } from '../../crypto/identity';
import { seal, unseal } from '../../crypto/sealedBox';

const DEK_LENGTH = 32;

describe('seal / unseal', () => {
	it('round-trips a DEK for the recipient', () => {
		const recipient = generateIdentityKeyPair();
		const dek = crypto.getRandomValues(new Uint8Array(DEK_LENGTH));

		const sealed = seal(recipient.identityPublic, dek);
		const unsealed = unseal(recipient.identityPrivate, sealed);

		expect(unsealed).toEqual(dek);
	});

	it('uses a fresh ephemeral key and nonce every time', () => {
		const recipient = generateIdentityKeyPair();
		const dek = crypto.getRandomValues(new Uint8Array(DEK_LENGTH));

		const a = seal(recipient.identityPublic, dek);
		const b = seal(recipient.identityPublic, dek);
		expect(a).not.toEqual(b);
	});

	it('the wrong recipient cannot unseal it', () => {
		const recipient = generateIdentityKeyPair();
		const impostor = generateIdentityKeyPair();
		const dek = crypto.getRandomValues(new Uint8Array(DEK_LENGTH));

		const sealed = seal(recipient.identityPublic, dek);
		expect(() => unseal(impostor.identityPrivate, sealed)).toThrow();
	});

	it('throws on a tampered blob', () => {
		const recipient = generateIdentityKeyPair();
		const dek = crypto.getRandomValues(new Uint8Array(DEK_LENGTH));
		const sealed = seal(recipient.identityPublic, dek);
		sealed[sealed.length - 1] ^= 0xff;
		expect(() => unseal(recipient.identityPrivate, sealed)).toThrow();
	});
});
