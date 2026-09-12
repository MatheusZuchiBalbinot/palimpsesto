// A small, dedicated websocket client for /api/ws/user — the per-user
// notification channel (server/internal/interfaces/http/handlers/ws_user_handler.go).
// Deliberately not DocProvider: that class carries an entire CRDT/Yjs
// awareness stack this channel has no use for — it only ever receives a
// "something changed, go refetch" nudge, never document content.
import { MESSAGE_TYPE, type ControlMessage } from './protocol';

const PING_INTERVAL_MS = 25000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10000;

export type UserChannelOptions = {
	/** Read fresh on every (re)connect attempt, not captured once — a
	 * long-lived channel like this one easily outlives the access token it
	 * started with; reading it lazily means a reconnect after a silent
	 * refresh picks up the new one instead of failing the handshake with a
	 * stale credential. */
	getToken: () => string | null;
	onInvitesChanged: () => void;
};

/** Opens a single, account-wide connection carrying invite-change
 * notifications — see UserChannelOptions.getToken. Call destroy() once,
 * typically from the app shell's own cleanup (mirrors DocProvider's own
 * destroy(), just without any of its Yjs/CRDT state to tear down). */
export class UserNotificationChannel {
	private readonly opts: UserChannelOptions;
	private ws: WebSocket | null = null;
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private destroyed = false;

	constructor(opts: UserChannelOptions) {
		this.opts = opts;
		this.connect();
	}

	destroy(): void {
		this.destroyed = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
		}
		if (this.pingTimer) {
			clearInterval(this.pingTimer);
		}
		this.ws?.close();
	}

	private connect(): void {
		if (this.destroyed) {
			return;
		}

		const token = this.opts.getToken();
		if (!token) {
			// Logged out — nothing to connect as. handleClose's own backoff
			// isn't in play here since this path never opens a socket; the
			// app shell reconnecting on the next login is what recovers.
			return;
		}

		const url = new URL('/api/ws/user', window.location.origin);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		const ws = new WebSocket(url, [`access_token.${token}`]);
		this.ws = ws;

		const isCurrent = () => this.ws === ws;
		ws.addEventListener('open', () => isCurrent() && this.handleOpen());
		ws.addEventListener('message', (e) => isCurrent() && this.handleMessage(e));
		ws.addEventListener('close', () => isCurrent() && this.handleClose());
		ws.addEventListener('error', () => ws.close());
	}

	private handleOpen = (): void => {
		if (this.pingTimer) {
			clearInterval(this.pingTimer);
		}
		this.reconnectAttempt = 0;
		this.pingTimer = setInterval(() => {
			this.ws?.send(JSON.stringify({ t: MESSAGE_TYPE.PING }));
		}, PING_INTERVAL_MS);
	};

	private handleMessage = (event: MessageEvent): void => {
		if (this.destroyed || typeof event.data !== 'string') {
			return;
		}
		let msg: ControlMessage;
		try {
			msg = JSON.parse(event.data) as ControlMessage;
		} catch {
			return;
		}
		if (msg.t === MESSAGE_TYPE.INVITES_CHANGED) {
			this.opts.onInvitesChanged();
		}
	};

	private handleClose = (): void => {
		if (this.pingTimer) {
			clearInterval(this.pingTimer);
		}
		if (this.destroyed) {
			return;
		}
		const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
		this.reconnectAttempt++;
		this.reconnectTimer = setTimeout(() => this.connect(), delay);
	};
}
