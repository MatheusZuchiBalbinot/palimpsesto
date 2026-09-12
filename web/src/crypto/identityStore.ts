// This device's local cache for the identity private keys — a shortcut so
// that not every page load has to fetch and unwrap the private key blob
// (crypto/identityFlow.ts) from the server again. The blob stored on the
// server, encrypted with wrapKey, is the actual source of truth — this
// cache is just that, a cache: clearing it (or a new browser) only means
// the next login will re-derive wrapKey and fetch again instead of using
// this shortcut.
//
// Encrypted at rest with a non-extractable WebCrypto AES-GCM key (the
// "device key"), itself stored in IndexedDB rather than these bytes —
// `crypto.subtle` refuses to ever hand a non-extractable key's raw bytes
// back to JavaScript, including to this module's own code, so a plain
// `localStorage.getItem`/file-level read of IndexedDB's storage can't
// recover the identity keys either. Be precise about what this does and
// doesn't defend against: it's not a defense against a live XSS —
// injected script running in this page can call the exact same
// `crypto.subtle.decrypt` this module calls and get the same plaintext
// the app would, same as it could just call the app's own functions
// directly. What it does raise the bar against is anything that reads
// storage *without* running JavaScript in this page's origin first — a
// stolen device's disk, browser-profile malware, a misconfigured backup
// of local app data — where a plain base64 blob (what this file held
// before) was full plaintext key material, and this is now unusable
// ciphertext.
import { base64ToBytes, bytesToBase64, type IdentityKeyPair } from './identity';

const DB_NAME = 'palimpsesto';
const DB_VERSION = 1;
const IDENTITIES_STORE = 'identities';
const DEVICE_KEY_STORE = 'deviceKey';
const DEVICE_KEY_ID = 'wrappingKey';
const AES_GCM_IV_BYTES = 12;

type StoredIdentity = {
	identityPrivate: string;
	identityPublic: string;
	signingPrivate: string;
	signingPublic: string;
	/** False until setPublicKeys/setWrappedPrivateKeys have actually
	 * succeeded once — lets identityFlow.ts retry just the publish step on
	 * a later login, instead of only trying once per generated key pair. */
	published: boolean;
};

type EncryptedRecord = {
	// Pinned to the ArrayBuffer-backed generic (not the wider
	// ArrayBufferLike default a plain `Uint8Array` annotation infers) —
	// crypto.subtle's BufferSource param type only accepts that narrower
	// form, and this is exactly what `crypto.getRandomValues(new
	// Uint8Array(...))` below already produces.
	iv: Uint8Array<ArrayBuffer>;
	ciphertext: ArrayBuffer;
};

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(IDENTITIES_STORE)) {
				db.createObjectStore(IDENTITIES_STORE);
			}
			if (!db.objectStoreNames.contains(DEVICE_KEY_STORE)) {
				db.createObjectStore(DEVICE_KEY_STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error as Error);
	});
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		const request = db.transaction(store, 'readonly').objectStore(store).get(key);
		request.onsuccess = () => resolve(request.result as T | undefined);
		request.onerror = () => reject(request.error as Error);
	});
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = db.transaction(store, 'readwrite').objectStore(store).put(value, key);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error as Error);
	});
}

/** The one AES-GCM key every identity on this device is encrypted with —
 * generated non-extractable on first use, so from that point on its raw
 * bytes never exist in a form `crypto.subtle` (or anything reading
 * storage without it) can recover. Reused across users on a shared
 * device deliberately: it's a device-local encryption-at-rest layer, not
 * a per-user secret — wrapKey (derived from each user's own password) is
 * still what actually scopes access to a given identity's private keys
 * server-side. */
async function getOrCreateDeviceKey(db: IDBDatabase): Promise<CryptoKey> {
	const existing = await idbGet<CryptoKey>(db, DEVICE_KEY_STORE, DEVICE_KEY_ID);
	if (existing) {
		return existing;
	}
	const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
	await idbPut(db, DEVICE_KEY_STORE, DEVICE_KEY_ID, key);
	return key;
}

export async function loadIdentityKeyPair(userId: string): Promise<(IdentityKeyPair & { published: boolean }) | null> {
	try {
		const db = await openDatabase();
		const record = await idbGet<EncryptedRecord>(db, IDENTITIES_STORE, userId);
		if (!record) {
			return null;
		}
		const deviceKey = await getOrCreateDeviceKey(db);
		const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, deviceKey, record.ciphertext);
		// IndexedDB content is an untrusted boundary just like localStorage
		// was (old schema, tampered with) — this cast doesn't validate the
		// shape, but any resulting garbage either throws inside this same
		// try (caught below) or, worst case, base64ToBytes further down
		// throws on a malformed field; either way this function's contract
		// (null for anything unusable) still holds.
		const stored = JSON.parse(new TextDecoder().decode(plaintext)) as StoredIdentity;
		return {
			identityPrivate: base64ToBytes(stored.identityPrivate),
			identityPublic: base64ToBytes(stored.identityPublic),
			signingPrivate: base64ToBytes(stored.signingPrivate),
			signingPublic: base64ToBytes(stored.signingPublic),
			published: stored.published,
		};
	} catch {
		return null;
	}
}

export async function saveIdentityKeyPair(userId: string, keys: IdentityKeyPair, published: boolean): Promise<void> {
	const stored: StoredIdentity = {
		identityPrivate: bytesToBase64(keys.identityPrivate),
		identityPublic: bytesToBase64(keys.identityPublic),
		signingPrivate: bytesToBase64(keys.signingPrivate),
		signingPublic: bytesToBase64(keys.signingPublic),
		published,
	};
	try {
		const db = await openDatabase();
		const deviceKey = await getOrCreateDeviceKey(db);
		const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
		const plaintext = new TextEncoder().encode(JSON.stringify(stored));
		const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, deviceKey, plaintext);
		const record: EncryptedRecord = { iv, ciphertext };
		await idbPut(db, IDENTITIES_STORE, userId, record);
	} catch {
		// Private mode / storage disabled: this device simply won't cache
		// the identity — every login fetches from the server again instead.
	}
}
