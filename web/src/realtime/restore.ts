import * as Y from 'yjs';

import { toUserId, type DocumentId, type UserId } from '../api/ids';
import { resolveTrustedSigningKey } from '../crypto/authorKeys';
import {
	bytesToUuidString,
	signAndEncryptUpdate,
	verifyAndDecryptUpdateWithAnyKey,
	type SignAndEncryptUpdateParams,
	type VerifyAndDecryptUpdateWithAnyKeyParams,
} from '../crypto/documentCipher';
import { DocProvider, type ProviderOptions } from './provider';

type KeyRingEntry = {
	dek: Uint8Array;
	keyEpoch: number;
};

// Best-effort: opens a live connection, waits for the initial history
// replay to settle, then replaces the document's text as a single new
// update — exactly the design's "restore lands as a new layer" semantics.
// The fixed delays are a real limitation (someone else's concurrent edit
// during that window could get overwritten) — acceptable for now since
// there's no "history replay finished" signal to wait on instead.
const SETTLE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function replaceText(ydoc: Y.Doc, text: string): void {
	const ytext = ydoc.getText('content');
	ydoc.transact(() => {
		ytext.delete(0, ytext.length);
		ytext.insert(0, text);
	});
}

/** Params for {@link restoreDocumentText} — an object instead of six
 * positional arguments, several of which (docId, token, text) are plain
 * strings the caller could swap by accident without the compiler
 * noticing. */
export type RestoreDocumentTextParams = {
	docId: DocumentId;
	token: string;
	text: string;
	userId: UserId;
	signingPrivate: Uint8Array;
	keyRing: KeyRingEntry[];
};

/** keyRing's first entry needs to be the document's CURRENT epoch (the
 * convention that crypto/documentDek.ts's fetchKeyRing follows) — that's
 * what the restored text itself gets encrypted with. The rest are older
 * epochs, tried while decrypting whatever history gets replayed first.
 * signingPrivate signs the restored write; the replayed history is
 * verified the same way a live session's would be. */
export function restoreDocumentText({ docId, token, text, userId, signingPrivate, keyRing }: RestoreDocumentTextParams): Promise<void> {
	return new Promise((resolve) => {
		const ydoc = new Y.Doc();
		const current = keyRing[0];

		const providerOptions: ProviderOptions = {
			docId,
			token,
			ydoc,
			encryptUpdate: (plaintext) => {
				const signAndEncryptInput: SignAndEncryptUpdateParams = {
					dek: current.dek,
					signingPrivate,
					docId,
					keyEpoch: current.keyEpoch,
					authorUserId: userId,
					plaintext,
				};
				return signAndEncryptUpdate(signAndEncryptInput);
			},
			decryptUpdate: async (ciphertext, authorIdBytes) => {
				const authorId = toUserId(bytesToUuidString(authorIdBytes));
				const authorSigningPublic = await resolveTrustedSigningKey(authorId);
				const verifyInput: VerifyAndDecryptUpdateWithAnyKeyParams = {
					keyRing,
					authorSigningPublic,
					docId,
					authorUserId: authorId,
					signedWire: ciphertext,
				};
				return verifyAndDecryptUpdateWithAnyKey(verifyInput);
			},
			onStatusChange: (status) => {
				if (status !== 'connected') {
					return;
				}

				void (async () => {
					await sleep(SETTLE_DELAY_MS);
					replaceText(ydoc, text);
					await sleep(SETTLE_DELAY_MS);
					provider.destroy();
					ydoc.destroy();
					resolve();
				})();
			},
		};
		const provider = new DocProvider(providerOptions);
	});
}
