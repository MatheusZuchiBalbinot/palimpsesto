import { zipSync, type Zippable } from 'fflate';
import type { TFunction } from 'i18next';

import { listDocuments } from '../api/docs';
import type { Session } from '../auth/session';
import { fetchKeyRing } from '../crypto/documentDek';
import { tryDecryptTitle } from '../crypto/documentTitle';
import { loadIdentityKeyPair } from '../crypto/identityStore';
import { reconstructDocumentPlaintext } from './documentPlaintext';
import { downloadBlob } from './downloadTextFile';
import { showToast } from './toast';

/** A unique "<title>.txt" name for a zip entry — appends " (2)", " (3)",
 * etc. the way a filesystem would, since two documents can share a title
 * and a zip can't have two entries at the same path. */
function uniqueEntryName(usedNames: Set<string>, title: string): string {
	let candidate = `${title}.txt`;
	let suffix = 2;
	while (usedNames.has(candidate)) {
		candidate = `${title} (${suffix}).txt`;
		suffix++;
	}
	usedNames.add(candidate);
	return candidate;
}

/** Downloads every document the caller has access to as a single .zip of
 * .txt files (UX_REVIEW.md 6.6) — in a product with no password recovery,
 * this is the only backup a user can make of their own account, and
 * today it's one document at a time from the vault's row menu. Documents
 * whose key isn't available (still pending, or genuinely undecryptable)
 * are silently skipped — this is a best-effort bulk export, not an
 * all-or-nothing operation that one bad document should block entirely. */
export async function exportAllDocuments(session: Session, t: TFunction): Promise<void> {
	const identity = await loadIdentityKeyPair(session.user.user_id);
	if (!identity) {
		showToast(t('settings.exportAllFailed'), 'error');
		return;
	}

	const documents = await listDocuments();
	const usedNames = new Set<string>();
	const entries: Zippable = {};

	for (const doc of documents) {
		try {
			const ring = await fetchKeyRing(doc.id, identity.identityPrivate);
			const title = tryDecryptTitle(ring, doc.id, doc.title_ciphertext) ?? doc.id;
			const text = await reconstructDocumentPlaintext({ docId: doc.id, keyRing: ring });
			entries[uniqueEntryName(usedNames, title)] = new TextEncoder().encode(text);
		} catch {
			// Pending key, undecryptable title, network hiccup — skip this
			// one document rather than failing the whole export.
		}
	}

	if (Object.keys(entries).length === 0) {
		showToast(t('settings.exportAllEmpty'), 'error');
		return;
	}

	const zipped = zipSync(entries);
	downloadBlob('palimpsesto-documents.zip', new Blob([zipped], { type: 'application/zip' }));
}
