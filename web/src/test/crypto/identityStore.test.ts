import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import { generateIdentityKeyPair } from '../../crypto/identity';
import { loadIdentityKeyPair, saveIdentityKeyPair } from '../../crypto/identityStore';

// jsdom (this project's vitest environment) doesn't implement IndexedDB at
// all — fake-indexeddb fills that gap. A fresh IDBFactory per test (not
// the shared `fake-indexeddb/auto` singleton) keeps identityStore.ts's
// fixed 'palimpsesto' database name from leaking state between tests.
beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});

describe('identityStore', () => {
	it('returns null before anything has been saved for a user', async () => {
		expect(await loadIdentityKeyPair('user-1')).toBeNull();
	});

	it('round-trips a saved identity back out exactly', async () => {
		const keys = generateIdentityKeyPair();
		await saveIdentityKeyPair('user-1', keys, true);

		const loaded = await loadIdentityKeyPair('user-1');
		expect(loaded).not.toBeNull();
		expect(Array.from(loaded!.identityPrivate)).toEqual(Array.from(keys.identityPrivate));
		expect(Array.from(loaded!.identityPublic)).toEqual(Array.from(keys.identityPublic));
		expect(Array.from(loaded!.signingPrivate)).toEqual(Array.from(keys.signingPrivate));
		expect(Array.from(loaded!.signingPublic)).toEqual(Array.from(keys.signingPublic));
		expect(loaded!.published).toBe(true);
	});

	it('keeps the `published` flag distinct from the key material', async () => {
		const keys = generateIdentityKeyPair();
		await saveIdentityKeyPair('user-1', keys, false);

		const loaded = await loadIdentityKeyPair('user-1');
		expect(loaded!.published).toBe(false);
	});

	it('never mixes up two different users cached on the same device', async () => {
		const alice = generateIdentityKeyPair();
		const bob = generateIdentityKeyPair();
		await saveIdentityKeyPair('alice', alice, true);
		await saveIdentityKeyPair('bob', bob, false);

		const loadedAlice = await loadIdentityKeyPair('alice');
		const loadedBob = await loadIdentityKeyPair('bob');

		expect(Array.from(loadedAlice!.identityPrivate)).toEqual(Array.from(alice.identityPrivate));
		expect(Array.from(loadedBob!.identityPrivate)).toEqual(Array.from(bob.identityPrivate));
		expect(loadedAlice!.published).toBe(true);
		expect(loadedBob!.published).toBe(false);
	});

	it('returns null instead of garbage when the stored ciphertext has been tampered with', async () => {
		const keys = generateIdentityKeyPair();
		await saveIdentityKeyPair('user-1', keys, true);

		// Reach into the same database identityStore.ts just wrote to and
		// flip a byte of the ciphertext — same class of attack the AES-GCM
		// authentication tag exists to catch (a storage-level tamper, not a
		// live-JS one).
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('palimpsesto', 1);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error as Error);
		});
		const record = await new Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }>((resolve, reject) => {
			const request = db.transaction('identities', 'readonly').objectStore('identities').get('user-1');
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error as Error);
		});
		const tampered = new Uint8Array(record.ciphertext);
		tampered[0] ^= 0xff;
		await new Promise<void>((resolve, reject) => {
			const request = db
				.transaction('identities', 'readwrite')
				.objectStore('identities')
				.put({ iv: record.iv, ciphertext: tampered.buffer }, 'user-1');
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error as Error);
		});

		expect(await loadIdentityKeyPair('user-1')).toBeNull();
	});
});
