import type { DocumentDTO } from '../api/docTypes';
import { decryptTitleWithAnyKey } from './documentCipher';
import { base64ToBytes } from './identity';

type KeyRingEntry = {
	dek: Uint8Array;
	keyEpoch: number;
};

/** Decrypts a document's title_ciphertext field. Returns null (never
 * throws) on a decrypt failure — the empty placeholder title a document
 * briefly has between creation and its real encrypted title arriving
 * (components/NewDocumentModal.tsx), a genuinely corrupt or garbled blob,
 * or a title nobody's re-encrypted since a rotation moved past its
 * epoch — all three cases look the same to the caller: "can't show a
 * title right now," not a crash. Tries every key in the keyRing, since the
 * title could be under any epoch the caller has ever lived through, not
 * just the current one. */
export function tryDecryptTitle(keyRing: KeyRingEntry[], docId: string, titleCiphertext: string): string | null {
	if (!titleCiphertext) {
		return null;
	}
	try {
		return decryptTitleWithAnyKey(keyRing, docId, base64ToBytes(titleCiphertext));
	} catch {
		return null;
	}
}

/** The '…' placeholder before docInfo/the key ring are ready, or the
 * decrypted title otherwise — shared by DocumentPage.tsx and
 * HistoryPage.tsx, which each show a document's title while its data
 * loads. `decryptFailureFallback` lets each caller pick its own copy for
 * the (rare) case where the title exists but can't be decrypted. */
export function computeDisplayTitle(docInfo: DocumentDTO | null, keyRing: KeyRingEntry[], decryptFailureFallback: string): string {
	if (!docInfo || keyRing.length === 0) {
		return '…';
	}
	return tryDecryptTitle(keyRing, docInfo.id, docInfo.title_ciphertext) ?? decryptFailureFallback;
}
