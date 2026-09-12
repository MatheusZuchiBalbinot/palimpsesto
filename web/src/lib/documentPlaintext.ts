import { getLatestSnapshot, listUpdates } from '../api/docs';
import type { DocumentId } from '../api/ids';
import { resolveTrustedSigningKeys } from '../crypto/authorKeys';
import { decryptSnapshotWithAnyKey } from '../crypto/documentCipher';
import type { DocumentDEK } from '../crypto/documentDek';
import { base64ToBytes } from '../crypto/identity';
import { reconstructTextAt, type ReconstructTextAtParams } from './yjsHistory';

// If the document has a snapshot, the updates it covers no longer exist on
// the server at all — reconstructTextAt needs the decrypted snapshot to
// seed the replay, otherwise the history before it simply vanishes instead
// of being reconstructed.
async function fetchSnapshotPlaintext(docId: DocumentId, ring: DocumentDEK[]): Promise<Uint8Array | undefined> {
	const snapshot = await getLatestSnapshot(docId);
	if (!snapshot) {
		return undefined;
	}
	return decryptSnapshotWithAnyKey(ring, docId, base64ToBytes(snapshot.ciphertext));
}

type ReconstructDocTextParams = {
	docId: DocumentId;
	keyRing: DocumentDEK[];
};

/** Fetches a document's full update history and reconstructs its current
 * plaintext from scratch — used by the vault's duplicate/export actions,
 * which (unlike the live editor or History) don't already have a Yjs doc
 * or a loaded update stream to work from. */
export async function reconstructDocumentPlaintext({ docId, keyRing }: ReconstructDocTextParams): Promise<string> {
	const updates = await listUpdates(docId);
	const authorSigningKeys = await resolveTrustedSigningKeys(updates.map((u) => u.author_id));
	const snapshotPlaintext = await fetchSnapshotPlaintext(docId, keyRing);
	if (updates.length === 0 && !snapshotPlaintext) {
		return '';
	}
	const reconstructInput: ReconstructTextAtParams = {
		updates,
		upToId: updates.length > 0 ? updates[updates.length - 1].id : 0,
		docId,
		keyRing,
		authorSigningKeys,
		snapshotPlaintext,
	};
	return reconstructTextAt(reconstructInput);
}
