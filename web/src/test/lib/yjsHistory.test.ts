import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { toUserId } from '../../api/ids';
import { signAndEncryptUpdate } from '../../crypto/documentCipher';
import { generateIdentityKeyPair } from '../../crypto/identity';
import { changedRange, reconstructTextAt } from '../../lib/yjsHistory';

const DEK_LENGTH = 32;
const ARBITRARY_DEK_FILL_BYTE = 7;
const DEK = new Uint8Array(DEK_LENGTH).fill(ARBITRARY_DEK_FILL_BYTE);
const DOC_ID = '11111111-1111-1111-1111-111111111111';
const AUTHOR_ID = toUserId('alice-user-id');

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

describe('changedRange', () => {
	it('finds an appended suffix', () => {
		expect(changedRange('hello', 'hello world')).toEqual({ start: 5, end: 11 });
	});

	it('finds a prepended prefix', () => {
		expect(changedRange('world', 'hello world')).toEqual({ start: 0, end: 6 });
	});

	it('finds an insertion in the middle', () => {
		expect(changedRange('ac', 'abc')).toEqual({ start: 1, end: 2 });
	});

	it('returns an empty range for identical text', () => {
		expect(changedRange('same', 'same')).toEqual({ start: 4, end: 4 });
	});

	it('handles a full replacement', () => {
		expect(changedRange('abc', 'xyz')).toEqual({ start: 0, end: 3 });
	});
});

// Once a snapshot covers a run of updates, those updates no longer exist
// server-side at all. reconstructTextAt needs to seed the replay from the
// decrypted snapshot, or history before it would silently come back empty
// instead of being reconstructed.
describe('reconstructTextAt with a snapshot', () => {
	it('seeds the replay from snapshotPlaintext before applying any updates', () => {
		// A snapshot and a later update need to come from the history of the
		// *same* underlying Y.Doc (as always happens in practice — the
		// snapshot is literally this doc's state at the moment compaction
		// ran, and the live session just keeps editing from there): Yjs
		// update deltas reference the source doc's own operation history
		// (client, clock), which a snapshot taken from an unrelated Y.Doc
		// instance wouldn't have.
		const liveDoc = new Y.Doc();
		const initialText = 'hello';
		liveDoc.getText('content').insert(0, initialText);
		const snapshotPlaintext = Y.encodeStateAsUpdate(liveDoc);
		const stateAtSnapshot = Y.encodeStateVector(liveDoc);

		// An update from *after* compaction: appends " world".
		liveDoc.getText('content').insert(initialText.length, ' world');
		const appendUpdate = Y.encodeStateAsUpdate(liveDoc, stateAtSnapshot);
		liveDoc.destroy();

		const author = generateIdentityKeyPair();
		const wire = signAndEncryptUpdate({
			dek: DEK,
			signingPrivate: author.signingPrivate,
			docId: DOC_ID,
			keyEpoch: 1,
			authorUserId: AUTHOR_ID,
			plaintext: appendUpdate,
		});
		const updates = [
			{
				id: 1,
				author_id: AUTHOR_ID,
				payload: toBase64(wire),
				created_at: new Date().toISOString(),
			},
		];
		const authorSigningKeys = new Map<string, Uint8Array | null>([[AUTHOR_ID, author.signingPublic]]);

		const text = reconstructTextAt({
			updates,
			upToId: 1,
			docId: DOC_ID,
			keyRing: [{ dek: DEK, keyEpoch: 1 }],
			authorSigningKeys,
			snapshotPlaintext,
		});
		expect(text).toBe('hello world');
	});

	it('reconstructs just the snapshot state when there are no updates after it', () => {
		const snapshotDoc = new Y.Doc();
		snapshotDoc.getText('content').insert(0, 'only the snapshot');
		const snapshotPlaintext = Y.encodeStateAsUpdate(snapshotDoc);
		snapshotDoc.destroy();

		const text = reconstructTextAt({
			updates: [],
			upToId: 0,
			docId: DOC_ID,
			keyRing: [{ dek: DEK, keyEpoch: 1 }],
			authorSigningKeys: new Map(),
			snapshotPlaintext,
		});
		expect(text).toBe('only the snapshot');
	});
});
