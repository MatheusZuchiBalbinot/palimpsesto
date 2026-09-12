import { describe, expect, it } from 'vitest';

import {
	bytesToUuidString,
	decryptSnapshotWithAnyKey,
	decryptTitle,
	decryptTitleWithAnyKey,
	decryptUpdate,
	decryptUpdateWithAnyKey,
	encryptSnapshot,
	encryptTitle,
	encryptUpdate,
	signAndEncryptUpdate,
	signUpdate,
	verifyAndDecryptUpdateWithAnyKey,
	verifyUpdateSignature,
} from '../../crypto/documentCipher';
import { generateIdentityKeyPair } from '../../crypto/identity';

const DEK_LENGTH = 32;
// Arbitrary, distinct fill bytes — only their identity (same vs.
// different key) matters for these tests, never the value itself.
const DEK_FILL_BYTE = 7;
const WRONG_DEK_FILL_BYTE = 9;
const OLD_DEK_FILL_BYTE = 1;
const NEW_DEK_FILL_BYTE = 2;
const OTHER_OLD_DEK_FILL_BYTE = 3;
const OTHER_NEW_DEK_FILL_BYTE = 4;

const DEK = new Uint8Array(DEK_LENGTH).fill(DEK_FILL_BYTE);
const DOC_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_DOC_ID = '22222222-2222-2222-2222-222222222222';
const AUTHOR_ID = 'alice-user-id';
const OTHER_AUTHOR_ID = 'bob-user-id';

describe('encryptUpdate / decryptUpdate', () => {
	it('round-trips plaintext', () => {
		const plaintext = new TextEncoder().encode('hello yjs update');
		const wire = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		const decrypted = decryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			wire,
		});
		// Array.from, not a direct toEqual on the Uint8Array: the decrypt
		// output's underlying ArrayBuffer can have different spare capacity
		// than a freshly encoded one even when every visible byte matches,
		// which trips up vitest's typed-array deep-equal despite identical
		// content.
		expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
	});

	it('produces different ciphertext for the same plaintext each time (random seq+nonce)', () => {
		const plaintext = new TextEncoder().encode('same content');
		const a = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		const b = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		expect(a).not.toEqual(b);
	});

	// The exact threat this protects against: a malicious server moving an
	// encrypted update from one document to another can't decrypt it.
	it('rejects an update replayed under a different doc_id', () => {
		const plaintext = new TextEncoder().encode('secret');
		const wire = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		expect(() =>
			decryptUpdate({
				dek: DEK,
				docId: OTHER_DOC_ID,
				keyEpoch: 1,
				authorUserId: AUTHOR_ID,
				wire,
			}),
		).toThrow();
	});

	it('rejects an update falsely reattributed to a different author', () => {
		const plaintext = new TextEncoder().encode('secret');
		const wire = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		expect(() =>
			decryptUpdate({
				dek: DEK,
				docId: DOC_ID,
				keyEpoch: 1,
				authorUserId: OTHER_AUTHOR_ID,
				wire,
			}),
		).toThrow();
	});

	it('rejects an update from a different key epoch', () => {
		const plaintext = new TextEncoder().encode('secret');
		const wire = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		expect(() =>
			decryptUpdate({
				dek: DEK,
				docId: DOC_ID,
				keyEpoch: 2,
				authorUserId: AUTHOR_ID,
				wire,
			}),
		).toThrow();
	});

	it('rejects the wrong DEK', () => {
		const plaintext = new TextEncoder().encode('secret');
		const wire = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		const wrongDek = new Uint8Array(DEK_LENGTH).fill(WRONG_DEK_FILL_BYTE);
		expect(() =>
			decryptUpdate({
				dek: wrongDek,
				docId: DOC_ID,
				keyEpoch: 1,
				authorUserId: AUTHOR_ID,
				wire,
			}),
		).toThrow();
	});

	it('rejects a tampered ciphertext', () => {
		const plaintext = new TextEncoder().encode('secret');
		const wire = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		wire[wire.length - 1] ^= 0xff;
		expect(() =>
			decryptUpdate({
				dek: DEK,
				docId: DOC_ID,
				keyEpoch: 1,
				authorUserId: AUTHOR_ID,
				wire,
			}),
		).toThrow();
	});
});

const UUID_BYTE_LENGTH = 16;
const HEX_RADIX = 16;
const REPEATED_UUID_BYTE = 0x11;
const MALFORMED_SIGNATURE_LENGTH = 3;
const TOO_SHORT_WIRE_LENGTH = 10;

describe('bytesToUuidString', () => {
	it('formats 16 bytes as a hyphenated UUID string', () => {
		const bytes = new Uint8Array(UUID_BYTE_LENGTH).fill(REPEATED_UUID_BYTE);
		expect(bytesToUuidString(bytes)).toBe('11111111-1111-1111-1111-111111111111');
	});

	it('round-trips a real-looking UUID', () => {
		const uuid = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
		const hex = uuid.replace(/-/g, '');
		const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, HEX_RADIX)));
		expect(bytesToUuidString(bytes)).toBe(uuid);
	});
});

describe('encryptTitle / decryptTitle', () => {
	it('round-trips a title', () => {
		const wire = encryptTitle({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			title: 'Investigação porto',
		});
		expect(decryptTitle({ dek: DEK, docId: DOC_ID, keyEpoch: 1, wire })).toBe('Investigação porto');
	});

	it('rejects a title decrypted under the wrong doc_id', () => {
		const wire = encryptTitle({ dek: DEK, docId: DOC_ID, keyEpoch: 1, title: 'a title' });
		expect(() => decryptTitle({ dek: DEK, docId: OTHER_DOC_ID, keyEpoch: 1, wire })).toThrow();
	});
});

// After a key rotation, a client holds multiple DEKs (the current epoch
// plus whatever's archived from before) and needs to try each one to
// find whichever actually authenticates a given ciphertext — there's no
// epoch number stored alongside to look up instead.
describe('decryptUpdateWithAnyKey / decryptTitleWithAnyKey', () => {
	const OLD_DEK = new Uint8Array(DEK_LENGTH).fill(OLD_DEK_FILL_BYTE);
	const NEW_DEK = new Uint8Array(DEK_LENGTH).fill(NEW_DEK_FILL_BYTE);
	const keyRing = [
		{ dek: NEW_DEK, keyEpoch: 2 },
		{ dek: OLD_DEK, keyEpoch: 1 },
	];

	it('decrypts an update from before the rotation by falling through to the older key', () => {
		const plaintext = new TextEncoder().encode('written before the rotation');
		const wire = encryptUpdate({
			dek: OLD_DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		const decrypted = decryptUpdateWithAnyKey({
			keyRing,
			docId: DOC_ID,
			authorUserId: AUTHOR_ID,
			wire,
		});
		expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
	});

	it('decrypts an update from after the rotation using the current key', () => {
		const plaintext = new TextEncoder().encode('written after the rotation');
		const wire = encryptUpdate({
			dek: NEW_DEK,
			docId: DOC_ID,
			keyEpoch: 2,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		const decrypted = decryptUpdateWithAnyKey({
			keyRing,
			docId: DOC_ID,
			authorUserId: AUTHOR_ID,
			wire,
		});
		expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
	});

	it('throws when no key in the ring authenticates the update', () => {
		const wire = encryptUpdate({
			dek: new Uint8Array(DEK_LENGTH).fill(WRONG_DEK_FILL_BYTE),
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext: new TextEncoder().encode('x'),
		});
		expect(() => decryptUpdateWithAnyKey({ keyRing, docId: DOC_ID, authorUserId: AUTHOR_ID, wire })).toThrow();
	});

	it('decrypts a pre-rotation title by falling through to the older key', () => {
		const wire = encryptTitle({
			dek: OLD_DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			title: 'título antigo',
		});
		expect(decryptTitleWithAnyKey(keyRing, DOC_ID, wire)).toBe('título antigo');
	});

	it('decrypts a post-rotation title using the current key', () => {
		const wire = encryptTitle({
			dek: NEW_DEK,
			docId: DOC_ID,
			keyEpoch: 2,
			title: 'título novo',
		});
		expect(decryptTitleWithAnyKey(keyRing, DOC_ID, wire)).toBe('título novo');
	});

	it('throws when no key in the ring authenticates the title', () => {
		const wire = encryptTitle({
			dek: new Uint8Array(DEK_LENGTH).fill(WRONG_DEK_FILL_BYTE),
			docId: DOC_ID,
			keyEpoch: 1,
			title: 'x',
		});
		expect(() => decryptTitleWithAnyKey(keyRing, DOC_ID, wire)).toThrow();
	});
});

// Ed25519 signatures. The scenario this closes: every editor holds the
// DEK, so encryption alone doesn't stop an editor from putting another
// editor's user_id in the AAD — only the actual victim's signingPrivate
// can produce a signature that verifies against their signingPublic.
describe('signUpdate / verifyUpdateSignature', () => {
	const alice = generateIdentityKeyPair();
	const mallory = generateIdentityKeyPair();

	it('verifies a signature made with the matching signing key', () => {
		const wire = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext: new TextEncoder().encode('hi'),
		});
		const signature = signUpdate({
			signingPrivate: alice.signingPrivate,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			wire,
		});
		expect(
			verifyUpdateSignature({
				signingPublic: alice.signingPublic,
				docId: DOC_ID,
				keyEpoch: 1,
				authorUserId: AUTHOR_ID,
				wire,
				signature,
			}),
		).toBe(true);
	});

	it('rejects a signature made with a different signing key', () => {
		const wire = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext: new TextEncoder().encode('hi'),
		});
		const signature = signUpdate({
			signingPrivate: mallory.signingPrivate,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			wire,
		});
		expect(
			verifyUpdateSignature({
				signingPublic: alice.signingPublic,
				docId: DOC_ID,
				keyEpoch: 1,
				authorUserId: AUTHOR_ID,
				wire,
				signature,
			}),
		).toBe(false);
	});

	it('rejects a signature whose author_id was swapped after signing', () => {
		const wire = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext: new TextEncoder().encode('hi'),
		});
		const signature = signUpdate({
			signingPrivate: mallory.signingPrivate,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: OTHER_AUTHOR_ID,
			wire,
		});
		// mallory did actually sign this, but as an update from OTHER_AUTHOR_ID, not AUTHOR_ID
		expect(
			verifyUpdateSignature({
				signingPublic: alice.signingPublic,
				docId: DOC_ID,
				keyEpoch: 1,
				authorUserId: AUTHOR_ID,
				wire,
				signature,
			}),
		).toBe(false);
	});

	it('rejects a malformed signature outright rather than throwing', () => {
		const wire = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext: new TextEncoder().encode('hi'),
		});
		const tooShortToBeASignature = new Uint8Array(MALFORMED_SIGNATURE_LENGTH);
		expect(
			verifyUpdateSignature({
				signingPublic: alice.signingPublic,
				docId: DOC_ID,
				keyEpoch: 1,
				authorUserId: AUTHOR_ID,
				wire,
				signature: tooShortToBeASignature,
			}),
		).toBe(false);
	});
});

describe('signAndEncryptUpdate / verifyAndDecryptUpdateWithAnyKey', () => {
	const alice = generateIdentityKeyPair();
	const mallory = generateIdentityKeyPair();
	const keyRing = [{ dek: DEK, keyEpoch: 1 }];

	it('round-trips a signed, encrypted update', () => {
		const plaintext = new TextEncoder().encode('assinado e cifrado');
		const signedWire = signAndEncryptUpdate({
			dek: DEK,
			signingPrivate: alice.signingPrivate,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		const decrypted = verifyAndDecryptUpdateWithAnyKey({
			keyRing,
			authorSigningPublic: alice.signingPublic,
			docId: DOC_ID,
			authorUserId: AUTHOR_ID,
			signedWire,
		});
		expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
	});

	it('rejects an update that decrypts fine but was signed by someone else — the exact forgery a malicious co-editor could attempt', () => {
		const plaintext = new TextEncoder().encode('forjado');
		// mallory also has the DEK (she's a real editor) and encrypts
		// content, but claims AUTHOR_ID (alice) wrote it.
		const wire = encryptUpdate({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		const forgedSignature = signUpdate({
			signingPrivate: mallory.signingPrivate,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			wire,
		});
		const signedWire = new Uint8Array(wire.length + forgedSignature.length);
		signedWire.set(wire, 0);
		signedWire.set(forgedSignature, wire.length);

		expect(() =>
			verifyAndDecryptUpdateWithAnyKey({
				keyRing,
				authorSigningPublic: alice.signingPublic,
				docId: DOC_ID,
				authorUserId: AUTHOR_ID,
				signedWire,
			}),
		).toThrow();
	});

	it('rejects when the caller has no trusted signing key for the author at all', () => {
		const plaintext = new TextEncoder().encode('sem chave confiável');
		const signedWire = signAndEncryptUpdate({
			dek: DEK,
			signingPrivate: alice.signingPrivate,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext,
		});
		expect(() =>
			verifyAndDecryptUpdateWithAnyKey({
				keyRing,
				authorSigningPublic: null,
				docId: DOC_ID,
				authorUserId: AUTHOR_ID,
				signedWire,
			}),
		).toThrow();
	});

	it('throws on a signed wire too short to carry a signature', () => {
		const tooShortWire = new Uint8Array(TOO_SHORT_WIRE_LENGTH);
		expect(() =>
			verifyAndDecryptUpdateWithAnyKey({
				keyRing,
				authorSigningPublic: alice.signingPublic,
				docId: DOC_ID,
				authorUserId: AUTHOR_ID,
				signedWire: tooShortWire,
			}),
		).toThrow();
	});
});

// A snapshot is a full capture of Yjs state, encrypted like the title
// (only doc_id + key_epoch AAD, no author/seq — it isn't part of the
// per-update anti-replay flow).
describe('encryptSnapshot / decryptSnapshotWithAnyKey', () => {
	it('round-trips arbitrary binary content', () => {
		// Deliberately arbitrary bytes — the point of the test is that ANY
		// content round-trips, not that these specific values mean anything.
		// eslint-disable-next-line no-magic-numbers
		const plaintext = new Uint8Array([0, 1, 2, 255, 254, 253, 10, 0, 128]);
		const wire = encryptSnapshot({ dek: DEK, docId: DOC_ID, keyEpoch: 1, plaintext });
		const decrypted = decryptSnapshotWithAnyKey([{ dek: DEK, keyEpoch: 1 }], DOC_ID, wire);
		expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
	});

	it('falls through to an older epoch key, same as decryptUpdateWithAnyKey', () => {
		const oldDek = new Uint8Array(DEK_LENGTH).fill(OTHER_OLD_DEK_FILL_BYTE);
		const newDek = new Uint8Array(DEK_LENGTH).fill(OTHER_NEW_DEK_FILL_BYTE);
		// eslint-disable-next-line no-magic-numbers -- arbitrary test payload
		const plaintext = new Uint8Array([9, 9, 9]);
		const wire = encryptSnapshot({ dek: oldDek, docId: DOC_ID, keyEpoch: 1, plaintext });
		const keyRing = [
			{ dek: newDek, keyEpoch: 2 },
			{ dek: oldDek, keyEpoch: 1 },
		];
		const decrypted = decryptSnapshotWithAnyKey(keyRing, DOC_ID, wire);
		expect(Array.from(decrypted)).toEqual(Array.from(plaintext));
	});

	it('rejects a snapshot decrypted under the wrong doc_id', () => {
		const wire = encryptSnapshot({
			dek: DEK,
			docId: DOC_ID,
			keyEpoch: 1,
			plaintext: new Uint8Array([1]),
		});
		expect(() => decryptSnapshotWithAnyKey([{ dek: DEK, keyEpoch: 1 }], OTHER_DOC_ID, wire)).toThrow();
	});

	it('throws when no key in the ring decrypts the snapshot', () => {
		const wire = encryptSnapshot({
			dek: new Uint8Array(DEK_LENGTH).fill(WRONG_DEK_FILL_BYTE),
			docId: DOC_ID,
			keyEpoch: 1,
			plaintext: new Uint8Array([1]),
		});
		expect(() => decryptSnapshotWithAnyKey([{ dek: DEK, keyEpoch: 1 }], DOC_ID, wire)).toThrow();
	});
});
