// A websocket provider built from scratch for our backend's opaque relay
// protocol — deliberately NOT y-websocket's default provider, which
// expects the server to speak Yjs's own sync protocol. Ours never can:
// every binary frame is an already-formed Yjs update, applied or relayed
// without ever being interpreted server-side. The same "never look
// inside" rule applies to presence — awareness updates are just another
// opaque blob the server relays, same as a CRDT update.
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as Y from 'yjs';

import type { PresenceStatus } from '../components/Avatar';
import { base64ToBytes, bytesToBase64 } from '../crypto/identity';
import { MESSAGE_TYPE, type ControlMessage, type PingMessage, type PresenceMessage } from './protocol';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

const FRAME_TYPE = 0x01;
const TYPE_FIELD_LEN = 1;
const UPDATE_ID_FIELD_LEN = 8;
const AUTHOR_ID_FIELD_LEN = 16;
const LEN_FIELD_LEN = 4;
const FRAME_HEADER_LEN = TYPE_FIELD_LEN + UPDATE_ID_FIELD_LEN + AUTHOR_ID_FIELD_LEN + LEN_FIELD_LEN;
// Incoming frame layout (server -> client): type || update_id ||
// author_id || len || payload.
const UPDATE_ID_OFFSET = TYPE_FIELD_LEN;
const AUTHOR_ID_OFFSET = UPDATE_ID_OFFSET + UPDATE_ID_FIELD_LEN;
const LEN_OFFSET = AUTHOR_ID_OFFSET + AUTHOR_ID_FIELD_LEN;
const PAYLOAD_OFFSET = LEN_OFFSET + LEN_FIELD_LEN;
// The outgoing frame layout (client -> server) is shorter: the server
// assigns update_id/author_id on its own, so only type || len || payload
// is sent.
const OUTGOING_LEN_OFFSET = TYPE_FIELD_LEN;
const OUTGOING_HEADER_LEN = TYPE_FIELD_LEN + LEN_FIELD_LEN;
const PING_INTERVAL_MS = 25000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10000;

export type ProviderOptions = {
	docId: string;
	token: string;
	/** Omit for a connection that never needs to report presence (e.g. the
	 * one-off history-restore connection in restore.ts) — awareness simply
	 * won't carry a userId field, and getAwayUserIds() reports it as
	 * away-from-nobody. */
	userId?: string;
	ydoc: Y.Doc;
	/** When the caller has already applied a snapshot to ydoc before
	 * constructing this provider, pass the snapshot's up_to_update_id here
	 * so the initial history replay only asks the server for what came
	 * after it, instead of everything since the document was created. Omit
	 * in the normal case (no snapshot, or none applied). */
	initialSinceId?: bigint;
	onStatusChange?: (status: ConnectionStatus) => void;
	/** Sent once, right after connecting: who's already on the document. */
	onJoinedSnapshot?: (memberIds: string[]) => void;
	/** Sent to everyone already connected when a new member arrives, or
	 * when someone leaves — keeps onJoinedSnapshot's initial list up to
	 * date. */
	onMemberJoined?: (userId: string) => void;
	onMemberLeft?: (userId: string) => void;
	/** How many local edits are queued behind a socket that's disconnected
	 * / reconnecting right now — 0 means everything has reached the
	 * server. Lets the UI say "syncing…" honestly instead of a generic
	 * "saved" that actually only means "not explicitly disconnected". */
	onPendingCountChange?: (count: number) => void;
	/** Encrypts a local Yjs update before it's sent — plaintext content
	 * never leaves the browser. Required; there's no unencrypted path
	 * anymore. */
	encryptUpdate: (plaintext: Uint8Array) => Uint8Array;
	/** Decrypts and verifies an incoming Yjs update. authorIdBytes is the
	 * raw 16-byte author id straight from the frame header (see
	 * bytesToUuidString in crypto/documentCipher.ts to convert it to the
	 * hyphenated form the AAD/signature message was built from). Async
	 * since verifying a signature can mean a network lookup for the
	 * author's signing key the first time (crypto/authorKeys.ts) — frames
	 * are still applied strictly in arrival order regardless (see
	 * handleBinaryFrame's queue). Throwing here (wrong DEK, wrong epoch,
	 * tampered payload, or a signature that doesn't verify) only drops
	 * that update: logged, never silently applied, but also never a
	 * reason to tear down the whole connection over one bad or forged
	 * frame. */
	decryptUpdate: (ciphertext: Uint8Array, authorIdBytes: Uint8Array) => Promise<Uint8Array>;
	/** Fires when an incoming update was dropped for failing to
	 * decrypt/verify — surfaces the "did I just lose an edit" question, at
	 * least the "coordinated attempt" versus "nothing observable" one. */
	onUpdateVerificationFailed?: () => void;
};

/** The socket's own lifecycle, as one value instead of the four
 * independent, nullable fields (`ws`, `pingTimer`, `reconnectTimer`,
 * `destroyed`) this class used to carry — every method that touched more
 * than one of them relied on a comment explaining which combinations were
 * actually reachable (e.g. "pingTimer is only ever running while ws is
 * open") rather than on the type system ruling the rest out. A tagged
 * union makes the unreachable combinations (a ping timer with no open
 * socket; a reconnect timer *and* an open socket at once) unrepresentable
 * instead of merely undocumented. `reconnectAttempt` stays a separate
 * field — it's backoff bookkeeping that spans a full
 * connecting→connected→disconnected cycle, not something that describes
 * which phase the socket is in right now. */
type ConnState =
	| { phase: 'connecting'; ws: WebSocket }
	| { phase: 'connected'; ws: WebSocket; pingTimer: ReturnType<typeof setInterval> }
	| { phase: 'reconnect-scheduled'; reconnectTimer: ReturnType<typeof setTimeout> }
	| { phase: 'destroyed' };

export class DocProvider {
	/** This document's live awareness instance — pass it (plus a
	 * clientName/color) to y-textarea's TextAreaBinding to get remote
	 * cursor rendering for free. Cleans itself up automatically when
	 * opts.ydoc is destroyed. */
	readonly awareness: Awareness;

	private readonly opts: ProviderOptions;
	private lastUpdateId: bigint;
	// Always assigned synchronously by connect() at the end of the
	// constructor — never read before that first assignment.
	private state!: ConnState;
	private reconnectAttempt = 0;
	private readonly pendingBeforeOpen: Uint8Array[] = [];
	// Each incoming frame's decrypt+verify+apply is chained onto this
	// instead of running independently — decryptUpdate is async, and
	// applying updates out of arrival order would corrupt the CRDT.
	private decryptQueue: Promise<void> = Promise.resolve();

	constructor(opts: ProviderOptions) {
		this.opts = opts;
		this.lastUpdateId = opts.initialSinceId ?? 0n;
		this.awareness = new Awareness(opts.ydoc);
		opts.ydoc.on('update', this.handleLocalUpdate);
		this.awareness.on('update', this.handleAwarenessUpdate);
		document.addEventListener('visibilitychange', this.handleVisibilityChange);
		// Tags every awareness entry with the account it belongs to, so
		// consumers of provider.awareness.getStates() can tell *whose*
		// entry it is — the numeric client id alone means nothing outside
		// this specific connection. 'presenceStatus' is separate from what
		// y-textarea's own Cursors class writes (keyed by the textarea's own
		// DOM id), so the two never collide.
		if (opts.userId) {
			this.awareness.setLocalStateField('userId', opts.userId);
		}
		this.awareness.setLocalStateField('presenceStatus', 'online');
		this.connect();
	}

	/** Marks the local user as idle/active — see the 60s idle timer in
	 * DocumentPage.tsx. Broadcasts to every peer like any other awareness
	 * field change. */
	setPresenceStatus(status: PresenceStatus): void {
		this.awareness.setLocalStateField('presenceStatus', status);
	}

	/** User ids (not client ids — see the constructor) currently reporting
	 * themselves as idle, from every awareness entry, our own
	 * included. */
	getAwayUserIds(): Set<string> {
		const away = new Set<string>();
		for (const state of this.awareness.getStates().values()) {
			const userId = state.userId as unknown;
			if (state.presenceStatus === 'away' && typeof userId === 'string') {
				away.add(userId);
			}
		}
		return away;
	}

	/** User ids whose awareness state changed within the last windowMs —
	 * any change counts (cursor moved, selection changed, presence
	 * toggled), the same imprecise-but-cheap signal most editors use for
	 * "so-and-so is typing" instead of trying to detect an actual keystroke
	 * over the wire. `awareness.meta` (not just `.states`) is what carries
	 * the per-client last-updated timestamp this needs. */
	getRecentlyActiveUserIds(windowMs: number): Set<string> {
		const active = new Set<string>();
		const now = Date.now();
		for (const [clientId, state] of this.awareness.getStates()) {
			const userId = state.userId as unknown;
			if (typeof userId !== 'string') {
				continue;
			}

			const meta = this.awareness.meta.get(clientId);
			if (meta && now - meta.lastUpdated < windowMs) {
				active.add(userId);
			}
		}
		return active;
	}

	destroy(): void {
		// Best-effort: tells peers we're leaving right now instead of
		// making them wait out awareness's 30s timeout — harmless if the
		// socket is already gone, the timeout still covers that. Must run
		// before the phase switch below, while `state` can still be
		// 'connected' — broadcastAwarenessUpdate is a no-op otherwise.
		removeAwarenessStates(this.awareness, [this.awareness.clientID], 'provider destroyed');
		this.broadcastAwarenessUpdate([this.awareness.clientID]);

		this.opts.ydoc.off('update', this.handleLocalUpdate);
		this.awareness.off('update', this.handleAwarenessUpdate);
		document.removeEventListener('visibilitychange', this.handleVisibilityChange);

		switch (this.state.phase) {
			case 'connecting':
				this.state.ws.close();
				break;
			case 'connected':
				clearInterval(this.state.pingTimer);
				this.state.ws.close();
				break;
			case 'reconnect-scheduled':
				clearTimeout(this.state.reconnectTimer);
				break;
			case 'destroyed':
				break;
		}
		this.state = { phase: 'destroyed' };
	}

	// Browsers throttle setInterval in a backgrounded tab to roughly once a
	// minute — well past the server's 60s read-idle timeout (see
	// readIdleTimeout in ws_handler.go), so a ping can arrive too late and
	// the server drops the connection while the tab is hidden. Recovering
	// would otherwise have to wait out the reconnect backoff; jumping
	// straight to a reconnect attempt as soon as the tab is foregrounded
	// again is near-instant instead.
	private handleVisibilityChange = (): void => {
		const ws = this.state.phase === 'connecting' || this.state.phase === 'connected' ? this.state.ws : null;
		const isForegroundedWithDeadSocket =
			document.visibilityState === 'visible' &&
			this.state.phase !== 'destroyed' &&
			ws?.readyState !== WebSocket.OPEN &&
			ws?.readyState !== WebSocket.CONNECTING;

		if (isForegroundedWithDeadSocket) {
			if (this.state.phase === 'reconnect-scheduled') {
				clearTimeout(this.state.reconnectTimer);
			}
			this.connect();
		}
	};

	private connect(): void {
		if (this.state.phase === 'destroyed') {
			return;
		}

		this.opts.onStatusChange?.('connecting');

		const url = new URL('/api/ws', window.location.origin);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		url.searchParams.set('doc', this.opts.docId);
		url.searchParams.set('since', this.lastUpdateId.toString());

		// The access token travels as a Sec-WebSocket-Protocol entry, not a
		// query param — a browser can't set custom headers on a WebSocket
		// handshake, and the query string leaks into proxy/server logs and
		// browser history.
		const ws = new WebSocket(url, [`access_token.${this.opts.token}`]);
		ws.binaryType = 'arraybuffer';
		this.state = { phase: 'connecting', ws };

		// visibilitychange can call connect() while an older socket's own
		// 'close' event is still pending (readyState CLOSING, not yet
		// fired) — without this guard, that stale event would run
		// handleClose/handleOpen/handleMessage against the state of the
		// *new* socket this.state now points to, clobbering its ping timer
		// or flipping its status to 'disconnected' right after it connected.
		const isCurrent = () => (this.state.phase === 'connecting' || this.state.phase === 'connected') && this.state.ws === ws;
		ws.addEventListener('open', () => isCurrent() && this.handleOpen());
		ws.addEventListener('message', (e) => isCurrent() && this.handleMessage(e));
		ws.addEventListener('close', () => isCurrent() && this.handleClose());
		ws.addEventListener('error', () => ws.close());
	}

	private handleOpen = (): void => {
		// Defensive: handleOpen should only ever fire once per socket, while
		// still 'connecting' — the isCurrent() guard at the call site
		// already confirms this, but narrowing `state` here (instead of
		// trusting that) means this method can never read a `ws` that
		// belongs to some other phase.
		if (this.state.phase !== 'connecting') {
			return;
		}
		const ws = this.state.ws;

		this.reconnectAttempt = 0;
		this.opts.onStatusChange?.('connected');

		const pingTimer = setInterval(() => {
			const ping: PingMessage = { t: MESSAGE_TYPE.PING };
			ws.send(JSON.stringify(ping));
		}, PING_INTERVAL_MS);
		this.state = { phase: 'connected', ws, pingTimer };

		// Whatever this client edited while disconnected — the CRDT never
		// stopped recording, only sending. Flushed only now that `state` is
		// 'connected', since sendUpdate itself checks the phase.
		for (const payload of this.pendingBeforeOpen.splice(0)) {
			this.sendUpdate(payload);
		}
		this.opts.onPendingCountChange?.(this.pendingBeforeOpen.length);

		// A reconnect means peers may have timed us out while we were
		// away — resend current presence so we reappear immediately
		// instead of waiting for the next natural awareness heartbeat.
		if (this.awareness.getLocalState() !== null) {
			this.broadcastAwarenessUpdate([this.awareness.clientID]);
		}
	};

	private handleMessage = (event: MessageEvent): void => {
		// Closing a socket doesn't cancel messages already in flight — a
		// frame that arrived just before destroy() was called can still
		// fire this handler afterward. Without this guard, an already
		// unmounted provider (e.g. React StrictMode's first, disposable
		// mount) could deliver a stale "joined" snapshot *after* the
		// surviving provider's fresh snapshot, silently overwriting correct
		// presence state with stale data that nothing would ever correct.
		if (this.state.phase === 'destroyed') {
			return;
		}

		if (typeof event.data === 'string') {
			this.handleTextFrame(event.data);
			return;
		}
		this.handleBinaryFrame(new Uint8Array(event.data as ArrayBuffer));
	};

	private handleTextFrame(raw: string): void {
		let msg: ControlMessage;
		try {
			msg = JSON.parse(raw) as ControlMessage;
		} catch {
			return;
		}
		this.dispatchControlMessage(msg);
	}

	private dispatchControlMessage(msg: ControlMessage): void {
		switch (msg.t) {
			case MESSAGE_TYPE.JOINED:
				this.opts.onJoinedSnapshot?.(msg.members);
				break;
			case MESSAGE_TYPE.MEMBER_JOINED:
				this.opts.onMemberJoined?.(msg.user_id);
				break;
			case MESSAGE_TYPE.MEMBER_LEFT:
				this.opts.onMemberLeft?.(msg.user_id);
				break;
			case MESSAGE_TYPE.PRESENCE:
				this.applyRemoteAwareness(msg.awareness);
				break;
		}
	}

	private handleBinaryFrame(data: Uint8Array): void {
		if (data.byteLength < FRAME_HEADER_LEN || data[0] !== FRAME_TYPE) {
			return;
		}

		const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
		const updateId = view.getBigUint64(UPDATE_ID_OFFSET);
		const authorIdBytes = data.slice(AUTHOR_ID_OFFSET, LEN_OFFSET);
		const len = view.getUint32(LEN_OFFSET);
		const payload = data.slice(PAYLOAD_OFFSET, PAYLOAD_OFFSET + len);

		if (updateId > this.lastUpdateId) {
			this.lastUpdateId = updateId;
		}

		this.decryptQueue = this.decryptQueue.then(async () => {
			if (this.state.phase === 'destroyed') {
				return;
			}
			let plaintext: Uint8Array;
			try {
				plaintext = await this.opts.decryptUpdate(payload, authorIdBytes);
			} catch (err) {
				console.error('discarding an update that failed to decrypt or verify', err);
				this.opts.onUpdateVerificationFailed?.();
				return;
			}
			// Tags the origin as this provider so handleLocalUpdate below
			// knows not to send it straight back to the server it just came
			// from.
			Y.applyUpdate(this.opts.ydoc, plaintext, this);
		});
	}

	private handleLocalUpdate = (update: Uint8Array, origin: unknown): void => {
		if (origin === this) {
			return;
		}
		this.sendUpdate(this.opts.encryptUpdate(update));
	};

	private sendUpdate(payload: Uint8Array): void {
		if (this.state.phase !== 'connected') {
			this.pendingBeforeOpen.push(payload);
			this.opts.onPendingCountChange?.(this.pendingBeforeOpen.length);
			return;
		}

		const frame = new Uint8Array(OUTGOING_HEADER_LEN + payload.length);
		frame[0] = FRAME_TYPE;
		new DataView(frame.buffer).setUint32(OUTGOING_LEN_OFFSET, payload.length);
		frame.set(payload, OUTGOING_HEADER_LEN);
		this.state.ws.send(frame);
	}

	// Fires both for our own local awareness changes (cursor moved,
	// joined, the library's own 30s keep-alive renewal) and for ones just
	// applied from a remote frame — only the former need to go back out
	// over the wire.
	private handleAwarenessUpdate = (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown): void => {
		if (origin !== 'local') {
			return;
		}
		const changedClients = [...changes.added, ...changes.updated, ...changes.removed];
		this.broadcastAwarenessUpdate(changedClients);
	};

	private broadcastAwarenessUpdate(clientIds: number[]): void {
		if (this.state.phase !== 'connected' || clientIds.length === 0) {
			return;
		}
		const update = encodeAwarenessUpdate(this.awareness, clientIds);
		const presence: PresenceMessage = { t: MESSAGE_TYPE.PRESENCE, awareness: bytesToBase64(update) };
		this.state.ws.send(JSON.stringify(presence));
	}

	private applyRemoteAwareness(base64: string): void {
		try {
			applyAwarenessUpdate(this.awareness, base64ToBytes(base64), 'remote');
		} catch {
			// A malformed or out-of-order awareness frame is simply
			// dropped — presence is best-effort, never worth tearing down
			// the connection over.
		}
	}

	private handleClose = (): void => {
		// Only the 'connected' phase ever has a running ping timer —
		// nothing to clear if the socket closed before ever opening.
		if (this.state.phase === 'connected') {
			clearInterval(this.state.pingTimer);
		}
		// An already-unmounted provider's own socket closing is no longer
		// this component's concern to report — without checking first, a
		// destroyed generation's delayed close event could flip a
		// surviving generation's status indicator to "disconnected" right
		// after it just finished connecting.
		if (this.state.phase === 'destroyed') {
			return;
		}
		this.opts.onStatusChange?.('disconnected');

		const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
		this.reconnectAttempt++;
		const reconnectTimer = setTimeout(() => this.connect(), delay);
		this.state = { phase: 'reconnect-scheduled', reconnectTimer };
	};
}
