import * as Y from 'yjs';

import {
	decryptSnapshotWithAnyKey,
	decryptTitle,
	decryptUpdate,
	decryptUpdateWithAnyKey,
	encryptSnapshot,
	encryptTitle,
	encryptUpdate,
	signAndEncryptUpdate,
	signUpdate,
	verifyAndDecryptUpdateWithAnyKey,
} from '../src/crypto/documentCipher.ts';
import { base64ToBytes, bytesToBase64, generateIdentityKeyPair } from '../src/crypto/identity.ts';
import { seal, unseal } from '../src/crypto/sealedBox.ts';

const BASE_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080';

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(`ASSERTION FAILED: ${message}`);
	}
}

function log(message: string): void {
	console.log(`  ${message}`);
}

async function apiFetch<T>(path: string, opts: RequestInit & { token?: string } = {}): Promise<T> {
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (opts.token) {
		headers.authorization = `Bearer ${opts.token}`;
	}
	const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });
	if (res.status === 204) {
		return undefined as T;
	}
	const body = await res.json().catch(() => null);
	if (!res.ok) {
		throw new Error(`${opts.method ?? 'GET'} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
	}
	return body as T;
}

interface RegisteredUser {
	userId: string;
	email: string;
	token: string;
	identity: ReturnType<typeof generateIdentityKeyPair>;
}

async function registerAndLogin(label: string): Promise<RegisteredUser> {
	const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
	const loginKey = 'live-e2e-simulation-login-key';
	const saltMK = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));

	await apiFetch('/api/auth/register', {
		method: 'POST',
		body: JSON.stringify({
			email,
			login_key: loginKey,
			display_name: label,
			salt_mk: saltMK,
		}),
	});

	const loginRes = await apiFetch<{ access_token: string; user: { user_id: string } }>('/api/auth/login', {
		method: 'POST',
		body: JSON.stringify({ email, login_key: loginKey }),
	});

	const identity = generateIdentityKeyPair();
	await apiFetch('/api/users/me/keys', {
		method: 'POST',
		token: loginRes.access_token,
		body: JSON.stringify({
			identity_pub: bytesToBase64(identity.identityPublic),
			signing_pub: bytesToBase64(identity.signingPublic),
		}),
	});

	return { userId: loginRes.user.user_id, email, token: loginRes.access_token, identity };
}

function connectWS(docId: string, token: string): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`${WS_URL}/api/ws?doc=${docId}`, [`access_token.${token}`]);
		ws.binaryType = 'arraybuffer';
		ws.addEventListener('open', () => resolve(ws), { once: true });
		ws.addEventListener('error', (e) => reject(new Error(`ws error: ${String(e)}`)), {
			once: true,
		});
	});
}

/** Waits for the next binary update frame, ignoring JSON control frames
 * (joined, member_joined, presence, ...) — mirrors what a real client's
 * message handler does. */
function waitForUpdateFrame(ws: WebSocket, timeoutMs = 5000): Promise<{ authorId: string; payload: Uint8Array }> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.removeEventListener('message', onMessage);
			reject(new Error('timed out waiting for an update frame'));
		}, timeoutMs);

		function onMessage(ev: MessageEvent) {
			if (typeof ev.data === 'string') {
				return;
			} // control frame, not what we're waiting for
			const data = new Uint8Array(ev.data as ArrayBuffer);
			if (data[0] !== 0x01) {
				return;
			}
			clearTimeout(timer);
			ws.removeEventListener('message', onMessage);
			const authorIdBytes = data.slice(9, 25);
			const hex = Array.from(authorIdBytes, (b) => b.toString(16).padStart(2, '0')).join('');
			const authorId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
			const len = new DataView(data.buffer, data.byteOffset + 25, 4).getUint32(0, false);
			const payload = data.slice(29, 29 + len);
			resolve({ authorId, payload });
		}
		ws.addEventListener('message', onMessage);
	});
}

function sendUpdateFrame(ws: WebSocket, payload: Uint8Array): void {
	const frame = new Uint8Array(1 + 4 + payload.length);
	frame[0] = 0x01;
	new DataView(frame.buffer).setUint32(1, payload.length, false);
	frame.set(payload, 5);
	ws.send(frame);
}

async function main() {
	console.log('Fase 5 live E2E simulation — against the real running server\n');

	console.log('1. Registering alice and bob, publishing identity keys');
	const alice = await registerAndLogin('alice');
	const bob = await registerAndLogin('bob');
	log(`alice=${alice.userId} bob=${bob.userId}`);

	console.log('2. Alice creates a document (empty placeholder title first)');
	const doc = await apiFetch<{ id: string }>('/api/docs', {
		method: 'POST',
		token: alice.token,
		body: JSON.stringify({ title_ciphertext: '' }),
	});
	log(`doc id = ${doc.id}`);

	console.log('3. Alice generates the DEK and wraps it for herself');
	const dek = crypto.getRandomValues(new Uint8Array(32));
	const keyEpoch = 1;
	const wrappedForAlice = seal(alice.identity.identityPublic, dek);
	await apiFetch(`/api/docs/${doc.id}/members/${alice.userId}/wrapped-dek`, {
		method: 'POST',
		token: alice.token,
		body: JSON.stringify({ wrapped_dek: bytesToBase64(wrappedForAlice) }),
	});

	console.log('4. Alice sets the real, encrypted title');
	const encryptedTitle = encryptTitle(dek, doc.id, keyEpoch, 'segredo de estado');
	await apiFetch(`/api/docs/${doc.id}`, {
		method: 'PATCH',
		token: alice.token,
		body: JSON.stringify({ title_ciphertext: bytesToBase64(encryptedTitle) }),
	});

	console.log('5. Alice invites bob by email, sealing the DEK for his identity_pub');
	const bobKeys = await apiFetch<{ identity_pub: string }>(`/api/users/lookup?email=${encodeURIComponent(bob.email)}`, { token: alice.token });
	const wrappedForBob = seal(base64ToBytes(bobKeys.identity_pub), dek);
	await apiFetch(`/api/docs/${doc.id}/members`, {
		method: 'POST',
		token: alice.token,
		body: JSON.stringify({
			email: bob.email,
			role: 'editor',
			wrapped_dek: bytesToBase64(wrappedForBob),
		}),
	});

	console.log('6. Bob fetches and unwraps his own copy of the DEK');
	const bobWrapped = await apiFetch<{ wrapped_dek: string; key_epoch: number }>(`/api/docs/${doc.id}/wrapped-dek`, {
		token: bob.token,
	});
	const bobDek = unseal(bob.identity.identityPrivate, base64ToBytes(bobWrapped.wrapped_dek));
	assert(Buffer.from(bobDek).equals(Buffer.from(dek)), "bob's unwrapped DEK must equal alice's original DEK");
	log('bob unwrapped the same DEK alice generated');

	console.log('7. Both sides verify the title decrypts identically');
	const aliceTitleFetch = await apiFetch<{ title_ciphertext: string }>(`/api/docs/${doc.id}`, {
		token: alice.token,
	});
	const decryptedByBob = decryptTitle(bobDek, doc.id, bobWrapped.key_epoch, base64ToBytes(aliceTitleFetch.title_ciphertext));
	assert(decryptedByBob === 'segredo de estado', `bob must decrypt the real title, got ${decryptedByBob}`);
	log('title round-trips correctly for bob');

	console.log('8. Both open a real WebSocket connection to the document');
	const aliceWS = await connectWS(doc.id, alice.token);
	const bobWS = await connectWS(doc.id, bob.token);
	log('both connected');

	console.log('9. Alice sends an encrypted update; bob receives and decrypts it');
	const plaintextFromAlice = new TextEncoder().encode('conteúdo secreto do documento');
	const bobFrame = waitForUpdateFrame(bobWS);
	sendUpdateFrame(aliceWS, encryptUpdate(dek, doc.id, keyEpoch, alice.userId, plaintextFromAlice));
	const receivedByBob = await bobFrame;
	assert(receivedByBob.authorId === alice.userId, 'frame must be attributed to alice');
	const decryptedByBobUpdate = decryptUpdate(bobDek, doc.id, bobWrapped.key_epoch, receivedByBob.authorId, receivedByBob.payload);
	assert(new TextDecoder().decode(decryptedByBobUpdate) === 'conteúdo secreto do documento', 'bob must decrypt exactly what alice sent');
	log("bob received and correctly decrypted alice's update");

	console.log('10. Bob replies; alice receives and decrypts it');
	const plaintextFromBob = new TextEncoder().encode('resposta do bob');
	const aliceFrame = waitForUpdateFrame(aliceWS);
	sendUpdateFrame(bobWS, encryptUpdate(bobDek, doc.id, bobWrapped.key_epoch, bob.userId, plaintextFromBob));
	const receivedByAlice = await aliceFrame;
	assert(receivedByAlice.authorId === bob.userId, 'frame must be attributed to bob');
	const decryptedByAlice = decryptUpdate(dek, doc.id, keyEpoch, receivedByAlice.authorId, receivedByAlice.payload);
	assert(new TextDecoder().decode(decryptedByAlice) === 'resposta do bob', 'alice must decrypt exactly what bob sent');
	log("alice received and correctly decrypted bob's update");

	console.log('11. Cross-document reinjection must fail: reusing the same wire payload against a different doc id');
	const otherDoc = await apiFetch<{ id: string }>('/api/docs', {
		method: 'POST',
		token: alice.token,
		body: JSON.stringify({ title_ciphertext: '' }),
	});
	let reinjectionThrew = false;
	try {
		decryptUpdate(dek, otherDoc.id, keyEpoch, alice.userId, encryptUpdate(dek, doc.id, keyEpoch, alice.userId, plaintextFromAlice));
	} catch {
		reinjectionThrew = true;
	}
	assert(reinjectionThrew, "decrypting a different document's ciphertext under a different doc_id AAD must fail");
	log('AAD binding correctly rejects cross-document reinjection');

	aliceWS.close();
	bobWS.close();

	console.log('\n--- Fase 6: revogação e épocas ---\n');

	console.log('12. Alice removes bob, rotating to a fresh DEK sealed only for herself');
	const dekEpoch2 = crypto.getRandomValues(new Uint8Array(32));
	const wrappedEpoch2ForAlice = seal(alice.identity.identityPublic, dekEpoch2);
	const rotateResult = await apiFetch<{ key_epoch: number }>(`/api/docs/${doc.id}/members/${bob.userId}`, {
		method: 'DELETE',
		token: alice.token,
		body: JSON.stringify({
			new_wraps: { [alice.userId]: bytesToBase64(wrappedEpoch2ForAlice) },
		}),
	});
	assert(rotateResult.key_epoch === 2, `want epoch 2, got ${rotateResult.key_epoch}`);
	log(`rotated to epoch ${rotateResult.key_epoch}`);

	console.log('13. Bob is no longer a member — no wrapped DEK for him at all, at any epoch');
	let bobStillHasAccess = true;
	try {
		await apiFetch(`/api/docs/${doc.id}/wrapped-dek`, { token: bob.token });
	} catch {
		bobStillHasAccess = false;
	}
	assert(!bobStillHasAccess, 'bob must not be able to fetch a wrapped DEK after being removed');
	log("bob's access is fully revoked");

	console.log('14. Alice can still decrypt the pre-rotation update using her archived epoch-1 key');
	const aliceKeyHistory = await apiFetch<{ key_epoch: number; wrapped_dek: string }[]>(`/api/docs/${doc.id}/key-history`, { token: alice.token });
	assert(aliceKeyHistory.length === 1 && aliceKeyHistory[0].key_epoch === 1, 'alice must have exactly one archived epoch: 1');
	const archivedDek = unseal(alice.identity.identityPrivate, base64ToBytes(aliceKeyHistory[0].wrapped_dek));
	const aliceKeyRing = [
		{ dek: dekEpoch2, keyEpoch: rotateResult.key_epoch },
		{ dek: archivedDek, keyEpoch: aliceKeyHistory[0].key_epoch },
	];
	const aliceWS2 = await connectWS(doc.id, alice.token);
	const preRotationHistory = waitForUpdateFrame(aliceWS2);
	const preRotationFrame = await preRotationHistory;
	const decryptedPreRotation = decryptUpdateWithAnyKey(aliceKeyRing, doc.id, preRotationFrame.authorId, preRotationFrame.payload);
	assert(
		new TextDecoder().decode(decryptedPreRotation) === 'conteúdo secreto do documento',
		'alice must still decrypt the pre-rotation update via her archived key',
	);
	log('pre-rotation history still decrypts via the archived epoch-1 key');

	console.log('15. Alice writes a new update — encrypted under the new epoch — and decrypts it back');
	const plaintextAfterRotation = new TextEncoder().encode('conteúdo depois da rotação');
	sendUpdateFrame(aliceWS2, encryptUpdate(dekEpoch2, doc.id, rotateResult.key_epoch, alice.userId, plaintextAfterRotation));
	await new Promise((resolve) => setTimeout(resolve, 300));
	const postRotationUpdates = await apiFetch<{ id: number; author_id: string; payload: string }[]>(`/api/docs/${doc.id}/updates`, {
		token: alice.token,
	});
	const lastUpdate = postRotationUpdates[postRotationUpdates.length - 1];
	const decryptedPostRotation = decryptUpdateWithAnyKey(aliceKeyRing, doc.id, lastUpdate.author_id, base64ToBytes(lastUpdate.payload));
	assert(
		new TextDecoder().decode(decryptedPostRotation) === 'conteúdo depois da rotação',
		'alice must decrypt her own post-rotation update using the new epoch key',
	);
	log('post-rotation update round-trips under the new epoch');
	aliceWS2.close();

	console.log('16. A late joiner invited after the rotation is stamped with the new epoch, not the default');
	// The server's own auth rate limit (10/min, burst 5 — router.go) is
	// narrower than this script's own register+login pace once a third
	// user joins partway through; a short pause here lets tokens refill
	// rather than weakening the actual security setting just for a test.
	await new Promise((resolve) => setTimeout(resolve, 15000));
	const carol = await registerAndLogin('carol');
	const carolKeys = await apiFetch<{ identity_pub: string }>(`/api/users/lookup?email=${encodeURIComponent(carol.email)}`, { token: alice.token });
	const wrappedForCarol = seal(base64ToBytes(carolKeys.identity_pub), dekEpoch2);
	await apiFetch(`/api/docs/${doc.id}/members`, {
		method: 'POST',
		token: alice.token,
		body: JSON.stringify({
			email: carol.email,
			role: 'editor',
			wrapped_dek: bytesToBase64(wrappedForCarol),
		}),
	});
	const carolWrapped = await apiFetch<{ wrapped_dek: string; key_epoch: number }>(`/api/docs/${doc.id}/wrapped-dek`, { token: carol.token });
	assert(carolWrapped.key_epoch === 2, `want epoch 2 for the late joiner, got ${carolWrapped.key_epoch}`);
	const carolDek = unseal(carol.identity.identityPrivate, base64ToBytes(carolWrapped.wrapped_dek));
	assert(Buffer.from(carolDek).equals(Buffer.from(dekEpoch2)), "carol's unwrapped DEK must equal the post-rotation DEK");
	log('late joiner correctly stamped with the current epoch, not the column default');

	console.log('\n--- Fase 7: assinatura Ed25519 nos updates ---\n');

	console.log("17. Alice signs and sends a new update; carol fetches alice's signing_pub by ID and verifies it");
	const plaintextSigned = new TextEncoder().encode('update assinado de verdade');
	const signedWire = signAndEncryptUpdate(dekEpoch2, alice.identity.signingPrivate, doc.id, rotateResult.key_epoch, alice.userId, plaintextSigned);
	const aliceSigningKeys = await apiFetch<{ signing_pub: string }>(`/api/users/${alice.userId}/keys`, {
		token: carol.token,
	});
	const decryptedSigned = verifyAndDecryptUpdateWithAnyKey(
		aliceKeyRing,
		base64ToBytes(aliceSigningKeys.signing_pub),
		doc.id,
		alice.userId,
		signedWire,
	);
	assert(
		new TextDecoder().decode(decryptedSigned) === 'update assinado de verdade',
		'carol must verify and decrypt exactly what alice signed and sent',
	);
	log("carol verified alice's signature via GET /api/users/{id}/keys and decrypted the update");

	console.log("18. Carol forges an update claiming to be from alice — she has the DEK (any editor does) but not alice's signing key");
	const forgedPlaintext = new TextEncoder().encode('isso nao foi a alice que escreveu');
	const forgedCiphertextWire = encryptUpdate(dekEpoch2, doc.id, rotateResult.key_epoch, alice.userId, forgedPlaintext);
	const forgedSignature = signUpdate(
		carol.identity.signingPrivate, // carol's own key — she doesn't have alice's
		doc.id,
		rotateResult.key_epoch,
		alice.userId, // ...but claims the update is alice's
		forgedCiphertextWire,
	);
	const forgedSignedWire = new Uint8Array(forgedCiphertextWire.length + forgedSignature.length);
	forgedSignedWire.set(forgedCiphertextWire, 0);
	forgedSignedWire.set(forgedSignature, forgedCiphertextWire.length);

	let forgeryAccepted = true;
	try {
		verifyAndDecryptUpdateWithAnyKey(aliceKeyRing, base64ToBytes(aliceSigningKeys.signing_pub), doc.id, alice.userId, forgedSignedWire);
	} catch {
		forgeryAccepted = false;
	}
	assert(!forgeryAccepted, 'a forged update signed by the wrong key must never verify, even though carol has the DEK');
	log('forged update correctly rejected — the DEK alone was never enough to impersonate alice');

	console.log('\n--- Fase 7: compaction cega ---\n');

	console.log('19. Alice compacts every update so far into one encrypted snapshot');
	const updatesBeforeCompaction = await apiFetch<{ id: number }[]>(`/api/docs/${doc.id}/updates`, {
		token: alice.token,
	});
	assert(updatesBeforeCompaction.length > 0, 'expected at least one update to compact');
	const compactionCutoff = updatesBeforeCompaction[updatesBeforeCompaction.length - 1].id;
	log(`compacting ${updatesBeforeCompaction.length} update(s) up to id ${compactionCutoff}`);

	const snapshotDoc = new Y.Doc();
	snapshotDoc.getText('content').insert(0, 'estado completo no momento da compactação');
	const snapshotPlaintext = Y.encodeStateAsUpdate(snapshotDoc);
	snapshotDoc.destroy();

	const snapshotWire = encryptSnapshot(dekEpoch2, doc.id, rotateResult.key_epoch, snapshotPlaintext);
	const createdSnapshot = await apiFetch<{ key_epoch: number; up_to_update_id: number }>(`/api/docs/${doc.id}/snapshots`, {
		method: 'POST',
		token: alice.token,
		body: JSON.stringify({
			key_epoch: rotateResult.key_epoch,
			up_to_update_id: compactionCutoff,
			ciphertext: bytesToBase64(snapshotWire),
		}),
	});
	assert(createdSnapshot.up_to_update_id === compactionCutoff, 'snapshot must report back the cutoff it was given');
	log('snapshot created');

	console.log('20. The compacted updates are gone; a fresh member fetches and decrypts the snapshot instead');
	const updatesAfterCompaction = await apiFetch<{ id: number }[]>(`/api/docs/${doc.id}/updates`, {
		token: alice.token,
	});
	assert(
		updatesAfterCompaction.every((u) => u.id > compactionCutoff),
		'every update at or before the snapshot cutoff must have been pruned',
	);
	log(`${updatesBeforeCompaction.length - updatesAfterCompaction.length} update(s) pruned from doc_updates`);

	const latestSnapshot = await apiFetch<{
		key_epoch: number;
		up_to_update_id: number;
		ciphertext: string;
	}>(`/api/docs/${doc.id}/snapshots/latest`, { token: alice.token });
	const decryptedSnapshot = decryptSnapshotWithAnyKey(aliceKeyRing, doc.id, base64ToBytes(latestSnapshot.ciphertext));
	const reconstructed = new Y.Doc();
	Y.applyUpdate(reconstructed, decryptedSnapshot);
	const reconstructedText = reconstructed.getText('content').toString();
	reconstructed.destroy();
	assert(reconstructedText === 'estado completo no momento da compactação', 'the fetched snapshot must decrypt back to exactly what was captured');
	log('snapshot fetched and decrypted correctly — history before it now lives only in this capture');

	console.log('\nALL LIVE E2E CHECKS PASSED (Fase 5 + Fase 6 + Fase 7)');
}

main().catch((err) => {
	console.error('\nLIVE E2E SIMULATION FAILED');
	console.error(err);
	process.exitCode = 1;
});
