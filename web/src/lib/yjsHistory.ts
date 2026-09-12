import * as Y from 'yjs';

import type { UpdateItemDTO } from '../api/docTypes';
import { verifyAndDecryptUpdateWithAnyKey, type VerifyAndDecryptUpdateWithAnyKeyParams } from '../crypto/documentCipher';
import { base64ToBytes } from '../crypto/identity';

type KeyRingEntry = {
	dek: Uint8Array;
	keyEpoch: number;
};

/** An entry in the version list: a run of consecutive updates from the
 * same author with no long gap between them, collapsed into a single
 * selectable point in time. */
export type VersionGroup = {
	lastUpdateId: number;
	authorId: string;
	createdAt: string;
	updateCount: number;
};

/** A gap longer than this between two updates from the same author ends
 * the current editing session and starts a new version group —
 * otherwise someone typing continuously for an hour would show up as a
 * single "version" no matter how many separate sessions it actually
 * was. */
const SESSION_GAP_MS = 300000; // 5 minutes

/** Groups updates into editing sessions — consecutive updates from the
 * same author with no long pause between them — so the version list
 * looks like real save points, not one line per keystroke. */
export function groupUpdates(updates: UpdateItemDTO[]): VersionGroup[] {
	const groups: VersionGroup[] = [];

	for (const update of updates) {
		const last = groups[groups.length - 1];
		const gapMs = last ? Date.parse(update.created_at) - Date.parse(last.createdAt) : Infinity;
		const isContinuingLastSession = last && last.authorId === update.author_id && gapMs <= SESSION_GAP_MS;

		if (isContinuingLastSession) {
			last.lastUpdateId = update.id;
			last.createdAt = update.created_at;
			last.updateCount += 1;
			continue;
		}
		const newGroup: VersionGroup = { lastUpdateId: update.id, authorId: update.author_id, createdAt: update.created_at, updateCount: 1 };
		groups.push(newGroup);
	}

	return groups;
}

/** Params for {@link reconstructTextAt} — grouped into an object instead
 * of six positional arguments because `updates`, `docId`, and (at call
 * sites) a reconstructed `text` are all string-shaped or array-shaped
 * enough to silently transpose past the type checker; a named field
 * can't be passed in the wrong slot. */
export type ReconstructTextAtParams = {
	updates: UpdateItemDTO[];
	upToId: number;
	docId: string;
	keyRing: KeyRingEntry[];
	authorSigningKeys: Map<string, Uint8Array | null>;
	snapshotPlaintext?: Uint8Array;
};

/** Replays every update up to and including upToId onto a fresh Y.Doc and
 * returns the reconstructed text. Each update's payload is encrypted —
 * decrypted here before being applied, same as what the live provider
 * does for updates arriving over the socket. keyRing carries every DEK
 * the caller has legitimate access to (a rotation this client lived
 * through means older updates are under an older epoch's key, tried in
 * sequence — see documentCipher.ts).
 *
 * snapshotPlaintext seeds the Y.Doc before replaying anything, when the
 * document has a compaction snapshot (the doc_updates it covers no
 * longer exist server-side, so without this, history would silently
 * start partway through the document instead of from the beginning).
 *
 * authorSigningKeys already needs every update's author_id resolved
 * (resolveTrustedSigningKeys from crypto/authorKeys.ts) — this function
 * stays synchronous on purpose, since it reruns on every scrubber step
 * and playback tick (HistoryPage.tsx), and resolving a signing key can
 * mean a network lookup the first time; that needs to happen once, up
 * front, not on every replay. */
export function reconstructTextAt({ updates, upToId, docId, keyRing, authorSigningKeys, snapshotPlaintext }: ReconstructTextAtParams): string {
	const doc = new Y.Doc();
	if (snapshotPlaintext) {
		Y.applyUpdate(doc, snapshotPlaintext);
	}
	for (const update of updates) {
		if (update.id > upToId) {
			break;
		}
		const authorSigningPublic = authorSigningKeys.get(update.author_id) ?? null;
		const verifyInput: VerifyAndDecryptUpdateWithAnyKeyParams = {
			keyRing,
			authorSigningPublic,
			docId,
			authorUserId: update.author_id,
			signedWire: base64ToBytes(update.payload),
		};
		const plaintext = verifyAndDecryptUpdateWithAnyKey(verifyInput);
		Y.applyUpdate(doc, plaintext);
	}
	// Y.Text overrides toString() to return its actual text content (not
	// the default Object stringification) — this is the correct way Yjs
	// itself documents for extracting plain text from it.
	// eslint-disable-next-line @typescript-eslint/no-base-to-string
	const text = doc.getText('content').toString();
	doc.destroy();
	return text;
}

/** How many characters were added/removed between two full-text
 * snapshots, found the same way changedRange finds *where* they differ
 * (trimming the longest common prefix and suffix) — not a real diff, so a
 * mid-text replacement counts as some removed plus some added rather than
 * being recognized as a replacement, but that's the same approximation
 * changedRange already makes, and it's cheap. */
function textDelta(prev: string, next: string): { added: number; removed: number } {
	let prefixLen = 0;
	const maxPrefix = Math.min(prev.length, next.length);
	while (prefixLen < maxPrefix && prev[prefixLen] === next[prefixLen]) {
		prefixLen++;
	}
	let suffixLen = 0;
	const maxSuffix = Math.min(prev.length, next.length) - prefixLen;
	while (suffixLen < maxSuffix && prev[prev.length - 1 - suffixLen] === next[next.length - 1 - suffixLen]) {
		suffixLen++;
	}
	return { added: next.length - prefixLen - suffixLen, removed: prev.length - prefixLen - suffixLen };
}

export type GroupDelta = { added: number; removed: number };

export type ComputeGroupDeltasParams = {
	updates: UpdateItemDTO[];
	groups: VersionGroup[];
	docId: string;
	keyRing: KeyRingEntry[];
	authorSigningKeys: Map<string, Uint8Array | null>;
	snapshotPlaintext?: Uint8Array;
};

/** The "+240 −12" character-change summary for every version group in one
 * pass (UX_REVIEW.md 5.2) — a single incremental replay shared across all
 * groups, instead of one full reconstructTextAt per group (which would be
 * O(groups × updates) instead of O(updates)). */
export function computeGroupDeltas({
	updates,
	groups,
	docId,
	keyRing,
	authorSigningKeys,
	snapshotPlaintext,
}: ComputeGroupDeltasParams): Map<number, GroupDelta> {
	const deltas = new Map<number, GroupDelta>();
	const groupEndIds = new Set(groups.map((g) => g.lastUpdateId));

	const doc = new Y.Doc();
	if (snapshotPlaintext) {
		Y.applyUpdate(doc, snapshotPlaintext);
	}
	// eslint-disable-next-line @typescript-eslint/no-base-to-string
	let previousText = doc.getText('content').toString();

	for (const update of updates) {
		const authorSigningPublic = authorSigningKeys.get(update.author_id) ?? null;
		const verifyInput: VerifyAndDecryptUpdateWithAnyKeyParams = {
			keyRing,
			authorSigningPublic,
			docId,
			authorUserId: update.author_id,
			signedWire: base64ToBytes(update.payload),
		};
		const plaintext = verifyAndDecryptUpdateWithAnyKey(verifyInput);
		Y.applyUpdate(doc, plaintext);

		if (groupEndIds.has(update.id)) {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			const currentText = doc.getText('content').toString();
			deltas.set(update.id, textDelta(previousText, currentText));
			previousText = currentText;
		}
	}

	doc.destroy();
	return deltas;
}

/** The range in `next` that differs from `prev`, found by trimming the
 * longest common prefix and suffix — used by the history time-lapse
 * (HistoryPage.tsx) to highlight only what a version step actually
 * added, not the entire reconstructed text. Not a real diff (can't
 * detect an edit in the *middle* of unchanged text on both sides as
 * anything other than "replace everything in between"), but it's the
 * same trade-off the CRDT's own step-by-step replay already makes, and
 * it's cheap. */
export function changedRange(prev: string, next: string): { start: number; end: number } {
	let prefixLen = 0;
	const maxPrefix = Math.min(prev.length, next.length);
	while (prefixLen < maxPrefix && prev[prefixLen] === next[prefixLen]) {
		prefixLen++;
	}

	let suffixLen = 0;
	const maxSuffix = Math.min(prev.length, next.length) - prefixLen;
	while (suffixLen < maxSuffix && prev[prev.length - 1 - suffixLen] === next[next.length - 1 - suffixLen]) {
		suffixLen++;
	}

	return { start: prefixLen, end: next.length - suffixLen };
}
