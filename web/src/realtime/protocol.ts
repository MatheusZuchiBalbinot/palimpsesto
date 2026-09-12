// Wire tags and message shapes for the control-message (text frame) side
// of the websocket protocol — mirrors
// server/internal/infrastructure/realtime/protocol.go. Binary frames are
// the separate CRDT update channel and don't go through here.
export const MESSAGE_TYPE = {
	JOINED: 'joined',
	MEMBER_JOINED: 'member_joined',
	MEMBER_LEFT: 'member_left',
	PRESENCE: 'presence',
	PING: 'ping',
	ERROR: 'error',
	INVITES_CHANGED: 'invites_changed',
} as const;

/** Sent once, right after connecting: who's already on the
 * document. */
export type JoinedMessage = {
	t: typeof MESSAGE_TYPE.JOINED;
	members: string[];
};

/** Broadcast to everyone already connected when a member arrives or
 * leaves. */
export type MemberJoinedMessage = {
	t: typeof MESSAGE_TYPE.MEMBER_JOINED;
	user_id: string;
};

export type MemberLeftMessage = {
	t: typeof MESSAGE_TYPE.MEMBER_LEFT;
	user_id: string;
};

/** Carries an opaque Yjs awareness-protocol update (base64) — who's
 * online and where each cursor is. The server relays this verbatim. */
export type PresenceMessage = {
	t: typeof MESSAGE_TYPE.PRESENCE;
	awareness: string;
};

export type PingMessage = {
	t: typeof MESSAGE_TYPE.PING;
};

/** Something the server failed to do with a frame we sent — e.g. an
 * update it failed to persist or broadcast (code "update_rejected"). */
export type ErrorMessage = {
	t: typeof MESSAGE_TYPE.ERROR;
	code: string;
};

/** Pushed on the per-user notification channel (/api/ws/user) whenever
 * one of the caller's pending invites is created, accepted, declined, or
 * cancelled — a nudge to refetch, carrying nothing about the invite
 * itself (see the backend's InvitesChangedMessage). */
export type InvitesChangedMessage = {
	t: typeof MESSAGE_TYPE.INVITES_CHANGED;
};

export type ControlMessage =
	JoinedMessage | MemberJoinedMessage | MemberLeftMessage | PresenceMessage | PingMessage | ErrorMessage | InvitesChangedMessage;
