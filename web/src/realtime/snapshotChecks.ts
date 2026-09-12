import * as Y from 'yjs';

import { createSnapshot, listUpdates } from '../api/docs';
import type { DocumentId } from '../api/ids';
import { encryptSnapshot } from '../crypto/documentCipher';
import { bytesToBase64 } from '../crypto/identity';

// Once a document accumulates this many updates beyond its last snapshot
// (or beyond creation, if it doesn't have one yet), this client
// opportunistically compacts them into a new snapshot. Checked repeatedly
// (not just once on connect) — a session can easily keep typing past the
// threshold well after the first check, and a one-shot check that ran too
// early would never get another chance for the rest of that connection.
export const SNAPSHOT_THRESHOLD = 200;
export const SNAPSHOT_CHECK_DELAY_MS = 2000;
export const SNAPSHOT_CHECK_INTERVAL_MS = 30_000;

export type MaybeCreateSnapshotParams = {
	docId: DocumentId;
	dek: Uint8Array;
	keyEpoch: number;
	ydoc: Y.Doc;
};

/** Checked once per connection, a bit after it settles. Best-effort and
 * silent — this isn't a current-user action to report success or failure
 * for, and a failed attempt just means the next member to load this
 * document (or this same one, on the next reconnect) tries again.
 *
 * Asks the server directly how many updates currently exist for this
 * document (listUpdates), instead of tracking IDs on the client —
 * DocProvider only learns the ID assigned to an update when it arrives over
 * the network, which for a *solo* editor never happens: the server excludes
 * the sender from a broadcast's fan-out (realtime/hub.go), so a lone
 * author's own edits never echo back to them and nothing would ever advance
 * a client-tracked counter. listUpdates()'s result is already exactly "what
 * remains to compact" regardless of who wrote it, since an earlier snapshot
 * already pruned everything before it. */
export async function maybeCreateSnapshot({ docId, dek, keyEpoch, ydoc }: MaybeCreateSnapshotParams): Promise<void> {
	try {
		const pending = await listUpdates(docId);
		if (pending.length < SNAPSHOT_THRESHOLD) {
			return;
		}

		const upToUpdateId = pending[pending.length - 1].id;
		const plaintext = Y.encodeStateAsUpdate(ydoc);
		const wire = encryptSnapshot({ dek, docId, keyEpoch, plaintext });
		await createSnapshot(docId, {
			key_epoch: keyEpoch,
			up_to_update_id: upToUpdateId,
			ciphertext: bytesToBase64(wire),
		});
	} catch {
		// Best-effort — see the function comment above.
	}
}

// Started once per connection, not restarted on every reconnect hiccup — a
// dropped-and-restored connection doesn't need a second timer alongside one
// that's already running. Recurring (not a one-shot check) because a long
// session can easily keep typing past the threshold well after the first
// check runs.
export function startSnapshotChecks(params: MaybeCreateSnapshotParams, isCancelled: () => boolean): ReturnType<typeof setInterval> {
	setTimeout(() => {
		if (isCancelled()) {
			return;
		}
		void maybeCreateSnapshot(params);
	}, SNAPSHOT_CHECK_DELAY_MS);
	return setInterval(() => void maybeCreateSnapshot(params), SNAPSHOT_CHECK_INTERVAL_MS);
}
