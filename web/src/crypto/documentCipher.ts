// Encrypts/decrypts everything that leaves the browser for a document —
// Yjs updates and the title — with its DEK. AAD rule: "without this, a
// malicious server could take an encrypted update from Alice in document
// A and replay it into document B, or attribute it to Bob" — so every
// seal binds doc_id + key_epoch (+ author + a per-update nonce-like seq,
// in the case of updates) as associated data. XChaCha20-Poly1305
// throughout, same as the rest of this project's envelope encryption.
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';

const NONCE_LEN = 24;
const SIGNATURE_LEN = 64;
const UINT32_BYTE_LENGTH = 4;
// Plays the role of the "seq": the server only assigns the update's real
// id after persisting it, so the client can't know that id before
// encrypting. A random 16-byte value generated per update fulfills the
// same anti-replay/anti-reinjection binding role (unique, unpredictable)
// without needing a round trip beforehand. device_id stays out of the AAD
// for the same reason: there isn't yet a real multi-device identity to
// bind, and doc_id + key_epoch + author already cover the
// cross-document/cross-author reinjection threats.
const SEQ_LEN = 16;
const FIELD_SEPARATOR = 0; // UUIDs never contain a null byte, so this can't be confused with content
const HEX_RADIX = 16;
const HEX_BYTE_PAD_LENGTH = 2;

function concatAAD(...fields: Uint8Array[]): Uint8Array {
	const sep = new Uint8Array([FIELD_SEPARATOR]);
	const parts: Uint8Array[] = [];
	fields.forEach((field, i) => {
		if (i > 0) {
			parts.push(sep);
		}
		parts.push(field);
	});

	const total = parts.reduce((sum, p) => sum + p.length, 0);
	const out = new Uint8Array(total);

	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}

	return out;
}

function epochBytes(keyEpoch: number): Uint8Array {
	const buf = new Uint8Array(UINT32_BYTE_LENGTH);
	new DataView(buf.buffer).setUint32(0, keyEpoch, false);

	return buf;
}

const utf8 = new TextEncoder();

type UpdateAADParams = {
	docId: string;
	keyEpoch: number;
	authorUserId: string;
	seq: Uint8Array;
};

function updateAAD({ docId, keyEpoch, authorUserId, seq }: UpdateAADParams): Uint8Array {
	return concatAAD(utf8.encode(docId), epochBytes(keyEpoch), utf8.encode(authorUserId), seq);
}

function titleAAD(docId: string, keyEpoch: number): Uint8Array {
	return concatAAD(utf8.encode(docId), epochBytes(keyEpoch));
}

export type EncryptUpdateParams = {
	dek: Uint8Array;
	docId: string;
	keyEpoch: number;
	authorUserId: string;
	plaintext: Uint8Array;
};

/** Encrypts a Yjs update. Wire format: seq(16) || nonce(24) ||
 * ciphertext — that's what travels as the opaque payload of the binary WS
 * frame (the frame's own author_id field is a separate thing, already in
 * plaintext at the transport level because presence/routing need it; the
 * *content* is what's protected here). */
export function encryptUpdate({ dek, docId, keyEpoch, authorUserId, plaintext }: EncryptUpdateParams): Uint8Array {
	const seq = randomBytes(SEQ_LEN);
	const nonce = randomBytes(NONCE_LEN);
	const aad = updateAAD({ docId, keyEpoch, authorUserId, seq });
	const ciphertext = xchacha20poly1305(dek, nonce, aad).encrypt(plaintext);

	const wire = new Uint8Array(SEQ_LEN + NONCE_LEN + ciphertext.length);
	wire.set(seq, 0);
	wire.set(nonce, SEQ_LEN);
	wire.set(ciphertext, SEQ_LEN + NONCE_LEN);

	return wire;
}

export type DecryptUpdateParams = {
	dek: Uint8Array;
	docId: string;
	keyEpoch: number;
	authorUserId: string;
	wire: Uint8Array;
};

/** Decrypts a Yjs update. Throws with the wrong DEK, wrong epoch, wrong
 * author, or a tampered payload — including a payload replayed from
 * another document or falsely attributed to someone else, exactly what
 * the AAD binding exists to catch. */
export function decryptUpdate({ dek, docId, keyEpoch, authorUserId, wire }: DecryptUpdateParams): Uint8Array {
	const seq = wire.slice(0, SEQ_LEN);
	const nonce = wire.slice(SEQ_LEN, SEQ_LEN + NONCE_LEN);
	const ciphertext = wire.slice(SEQ_LEN + NONCE_LEN);
	const aad = updateAAD({ docId, keyEpoch, authorUserId, seq });
	return xchacha20poly1305(dek, nonce, aad).decrypt(ciphertext);
}

export type EncryptTitleParams = {
	dek: Uint8Array;
	docId: string;
	keyEpoch: number;
	title: string;
};

/** Encrypts a document's title. Wire format: nonce(24) || ciphertext,
 * meant to be base64-encoded in full into the title_ciphertext field. */
export function encryptTitle({ dek, docId, keyEpoch, title }: EncryptTitleParams): Uint8Array {
	const nonce = randomBytes(NONCE_LEN);
	const aad = titleAAD(docId, keyEpoch);
	const ciphertext = xchacha20poly1305(dek, nonce, aad).encrypt(utf8.encode(title));

	const wire = new Uint8Array(NONCE_LEN + ciphertext.length);
	wire.set(nonce, 0);
	wire.set(ciphertext, NONCE_LEN);
	return wire;
}

export type DecryptTitleParams = {
	dek: Uint8Array;
	docId: string;
	keyEpoch: number;
	wire: Uint8Array;
};

export function decryptTitle({ dek, docId, keyEpoch, wire }: DecryptTitleParams): string {
	const nonce = wire.slice(0, NONCE_LEN);
	const ciphertext = wire.slice(NONCE_LEN);
	const aad = titleAAD(docId, keyEpoch);
	const plaintext = xchacha20poly1305(dek, nonce, aad).decrypt(ciphertext);
	return new TextDecoder().decode(plaintext);
}

export type EncryptSnapshotParams = {
	dek: Uint8Array;
	docId: string;
	keyEpoch: number;
	plaintext: Uint8Array;
};

/** Encrypts a document snapshot — a full capture of Yjs state
 * (`Y.encodeStateAsUpdate(doc)`), not a single incremental update. Same
 * AAD format as the title (just doc_id + key_epoch: a snapshot isn't part
 * of the per-update anti-replay flow, so it doesn't need to bind author
 * or seq). Wire format: nonce(24) || ciphertext. */
export function encryptSnapshot({ dek, docId, keyEpoch, plaintext }: EncryptSnapshotParams): Uint8Array {
	const nonce = randomBytes(NONCE_LEN);
	const aad = titleAAD(docId, keyEpoch);
	const ciphertext = xchacha20poly1305(dek, nonce, aad).encrypt(plaintext);

	const wire = new Uint8Array(NONCE_LEN + ciphertext.length);
	wire.set(nonce, 0);
	wire.set(ciphertext, NONCE_LEN);
	return wire;
}

type DecryptSnapshotParams = {
	dek: Uint8Array;
	docId: string;
	keyEpoch: number;
	wire: Uint8Array;
};

function decryptSnapshot({ dek, docId, keyEpoch, wire }: DecryptSnapshotParams): Uint8Array {
	const nonce = wire.slice(0, NONCE_LEN);
	const ciphertext = wire.slice(NONCE_LEN);
	const aad = titleAAD(docId, keyEpoch);
	return xchacha20poly1305(dek, nonce, aad).decrypt(ciphertext);
}

/** decryptSnapshot tried against every key in the keyRing — a snapshot may
 * have been created under an epoch this client has since rotated past,
 * same reasoning as decryptUpdateWithAnyKey. */
export function decryptSnapshotWithAnyKey(keyRing: KeyRingEntry[], docId: string, wire: Uint8Array): Uint8Array {
	for (const { dek, keyEpoch } of keyRing) {
		try {
			return decryptSnapshot({ dek, docId, keyEpoch, wire });
		} catch {
			// wrong epoch for this snapshot — try the next one
		}
	}
	throw new Error('decryptSnapshotWithAnyKey: no key in the ring decrypts this snapshot');
}

/** A DEK this client has legitimate access to, at the epoch it was
 * issued under — see DocumentDEK in crypto/documentDek.ts, duplicated
 * here as a narrower shape so this module doesn't need to import that
 * one. */
type KeyRingEntry = {
	dek: Uint8Array;
	keyEpoch: number;
};

export type DecryptUpdateWithAnyKeyParams = {
	keyRing: KeyRingEntry[];
	docId: string;
	authorUserId: string;
	wire: Uint8Array;
};

/** Decrypts an update against whichever key in the keyRing actually
 * authenticates it: a rotation this client has lived through means
 * updates from before it are under an older epoch's DEK, and there's no
 * per-update stored epoch number to look up, only the set of keys this
 * client is entitled to try (XChaCha20-Poly1305 rejects a wrong key
 * outright, so trying is safe — it never silently produces the wrong
 * plaintext). Throws if none of them work. */
export function decryptUpdateWithAnyKey({ keyRing, docId, authorUserId, wire }: DecryptUpdateWithAnyKeyParams): Uint8Array {
	for (const { dek, keyEpoch } of keyRing) {
		try {
			return decryptUpdate({ dek, docId, keyEpoch, authorUserId, wire });
		} catch {
			// wrong epoch for this update — try the next one
		}
	}
	throw new Error('decryptUpdateWithAnyKey: no key in the ring decrypts this update');
}

/** decryptTitle's equivalent of decryptUpdateWithAnyKey — same reasoning. */
export function decryptTitleWithAnyKey(keyRing: KeyRingEntry[], docId: string, wire: Uint8Array): string {
	for (const { dek, keyEpoch } of keyRing) {
		try {
			return decryptTitle({ dek, docId, keyEpoch, wire });
		} catch {
			// wrong epoch for this title — try the next one
		}
	}
	throw new Error('decryptTitleWithAnyKey: no key in the ring decrypts this title');
}

// Ed25519 signatures over updates. What this closes: encryption alone only
// proves "someone who holds the DEK produced this" — every editor holds
// the DEK, so nothing stops an editor from encrypting content and putting
// *another* editor's user_id in the AAD. A signature that only the true
// author's signingPrivate can produce closes that gap, regardless of who
// else has the DEK.
type UpdateSignatureMessageParams = {
	docId: string;
	keyEpoch: number;
	authorUserId: string;
	wire: Uint8Array;
};

function updateSignatureMessage({ docId, keyEpoch, authorUserId, wire }: UpdateSignatureMessageParams): Uint8Array {
	return concatAAD(utf8.encode(docId), epochBytes(keyEpoch), utf8.encode(authorUserId), wire);
}

export type SignUpdateParams = {
	signingPrivate: Uint8Array;
	docId: string;
	keyEpoch: number;
	authorUserId: string;
	wire: Uint8Array;
};

/** Signs an already-encrypted update (authorUserId must be the signer's
 * own — this is never checked here, only by the verifier, which is the
 * only side where it matters). */
export function signUpdate({ signingPrivate, docId, keyEpoch, authorUserId, wire }: SignUpdateParams): Uint8Array {
	return ed25519.sign(updateSignatureMessage({ docId, keyEpoch, authorUserId, wire }), signingPrivate);
}

export type VerifyUpdateSignatureParams = {
	signingPublic: Uint8Array;
	docId: string;
	keyEpoch: number;
	authorUserId: string;
	wire: Uint8Array;
	signature: Uint8Array;
};

/** Verifies an update's signature against the claimed author's
 * signing_pub. Never throws — a malformed signature is simply invalid,
 * not an error condition. */
export function verifyUpdateSignature({ signingPublic, docId, keyEpoch, authorUserId, wire, signature }: VerifyUpdateSignatureParams): boolean {
	if (signature.length !== SIGNATURE_LEN) {
		return false;
	}
	try {
		return ed25519.verify(signature, updateSignatureMessage({ docId, keyEpoch, authorUserId, wire }), signingPublic);
	} catch {
		return false;
	}
}

export type SignAndEncryptUpdateParams = {
	dek: Uint8Array;
	signingPrivate: Uint8Array;
	docId: string;
	keyEpoch: number;
	authorUserId: string;
	plaintext: Uint8Array;
};

/** encryptUpdate + signUpdate in one call — what any call site actually
 * wants, since an update is never sent without a signature. Wire format:
 * seq(16) || nonce(24) || ciphertext || signature(64). */
export function signAndEncryptUpdate({ dek, signingPrivate, docId, keyEpoch, authorUserId, plaintext }: SignAndEncryptUpdateParams): Uint8Array {
	const wire = encryptUpdate({ dek, docId, keyEpoch, authorUserId, plaintext });
	const signature = signUpdate({ signingPrivate, docId, keyEpoch, authorUserId, wire });
	const signedWire = new Uint8Array(wire.length + signature.length);
	signedWire.set(wire, 0);
	signedWire.set(signature, wire.length);
	return signedWire;
}

export type VerifyAndDecryptUpdateWithAnyKeyParams = {
	keyRing: KeyRingEntry[];
	authorSigningPublic: Uint8Array | null;
	docId: string;
	authorUserId: string;
	signedWire: Uint8Array;
};

/** decryptUpdateWithAnyKey + verifyUpdateSignature in one call. Tries
 * every key in the keyRing; the first whose AEAD tag authenticates the
 * ciphertext identifies the correct epoch (a wrong key/epoch can't
 * produce a false-positive decrypt), so it's against that same epoch that
 * the signature is checked — a decrypt that succeeds but whose signature
 * doesn't verify is rejected outright, never retried under another epoch.
 * authorSigningPublic is null when the caller couldn't establish a
 * trusted signing key for this author (never seen before and
 * unreachable, or their key changed since it was last trusted — see
 * crypto/knownKeys.ts) — treated the same as an invalid signature, never
 * silently ignored. */
export function verifyAndDecryptUpdateWithAnyKey({
	keyRing,
	authorSigningPublic,
	docId,
	authorUserId,
	signedWire,
}: VerifyAndDecryptUpdateWithAnyKeyParams): Uint8Array {
	if (signedWire.length < SIGNATURE_LEN) {
		throw new Error('verifyAndDecryptUpdateWithAnyKey: wire too short to carry a signature');
	}
	const wire = signedWire.slice(0, signedWire.length - SIGNATURE_LEN);
	const signature = signedWire.slice(signedWire.length - SIGNATURE_LEN);

	for (const { dek, keyEpoch } of keyRing) {
		let plaintext: Uint8Array;
		try {
			plaintext = decryptUpdate({ dek, docId, keyEpoch, authorUserId, wire });
		} catch {
			continue; // wrong epoch for this update — try the next one
		}
		if (!authorSigningPublic) {
			throw new Error('verifyAndDecryptUpdateWithAnyKey: signature verification failed');
		}
		const verifySignatureInput: VerifyUpdateSignatureParams = { signingPublic: authorSigningPublic, docId, keyEpoch, authorUserId, wire, signature };
		if (!verifyUpdateSignature(verifySignatureInput)) {
			throw new Error('verifyAndDecryptUpdateWithAnyKey: signature verification failed');
		}
		return plaintext;
	}
	throw new Error('verifyAndDecryptUpdateWithAnyKey: no key in the ring decrypts this update');
}

/** Converts a raw 16-byte UUID (the wire format of the author_id field in
 * a binary WS frame — see realtime/provider.ts and
 * server/internal/infrastructure/realtime/hub.go's encodeUpdateFrame) to
 * the hyphenated form used throughout the rest of the app
 * (session.user.user_id, MemberDTO.user_id, ...). Needed so the author
 * field of a received update's AAD matches the same representation used
 * when *that* update was encrypted (a string) — a mismatch here would
 * make every legitimate remote update fail to decrypt. */
export function bytesToUuidString(bytes: Uint8Array): string {
	const hex = Array.from(bytes, (b) => b.toString(HEX_RADIX).padStart(HEX_BYTE_PAD_LENGTH, '0')).join('');
	// The canonical UUID hex grouping (8-4-4-4-12) — a regex capture instead
	// of manual slice offsets, so there's no magic number standing in for
	// what are just the UUID format's fixed field widths.
	return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

/** SHA-256(DEK) — the raw hash the document's sigil is derived from, same
 * idea and same Sigil.tsx renderer as a user's identity sigil, just fed a
 * different hash. Two collaborators comparing this glyph confirms they're
 * both actually holding the same DEK. */
export function documentDEKHash(dek: Uint8Array): Uint8Array {
	return sha256(dek);
}
