// App-wide UI knobs that multiple components pick independently for a
// similar purpose (how big an avatar renders, how long a fade takes) — kept
// here so they can be scanned and tuned together. Constants that describe an
// algorithm (crypto, wire protocol framing, hashing) stay next to the code
// that implements it instead of moving here: they aren't "UI", and moving
// them away from their formula would hurt readability for no benefit.

// --- Sizes (px) ---------------------------------------------------------

export const AVATAR_SIZE_DEFAULT = 26;
export const AVATAR_SIZE_STACK = 28;
export const AVATAR_SIZE_POPOVER = 30;
export const AVATAR_SIZE_SHARE_MEMBER = 32;
export const AVATAR_SIZE_PROFILE = 58;
export const AVATAR_SIZE_HISTORY_VERSION = 20;

export const SIGIL_SIZE_DEFAULT = 64;
export const SIGIL_SIZE_IDENTITY = 56;

// --- Durations (ms) ------------------------------------------------------

/** How long a menu/popover/modal stays mounted after closing so its
 * fade/scale-out transition gets to play. Modal's own overlay fades slower
 * than the smaller popovers/dropdowns, hence two values. */
export const CLOSE_ANIMATION_MS_MODAL = 180;
export const CLOSE_ANIMATION_MS_POPOVER = 150;

/** How long a pointer/keyboard focus has to stay on a Tooltip's trigger
 * before it shows — instant would flash one on every mouse pass-through,
 * literally zero delay would fire while just moving toward something else. */
export const TOOLTIP_DELAY_MS = 400;

/** How long a "Copied!"-style inline confirmation stays visible before
 * reverting to its normal label. */
export const COPIED_FEEDBACK_MS = 2000;

/** How long a toast stays on screen before auto-dismissing. Undo toasts get
 * longer, since acting on them takes more than a glance. */
export const TOAST_DURATION_MS = 4000;
export const UNDO_TOAST_DURATION_MS = 8000;

/** How long a just-restored history version stays visually highlighted. */
export const HISTORY_HIGHLIGHT_DURATION_MS = 900;

/** History scrubber playback: how often the "cursor" advances one step
 * while playing back at 1x. */
export const HISTORY_PLAYBACK_STEP_MS = 700;

/** How often the vault poll for which documents have someone active in
 * them. */
export const ACTIVE_DOCUMENTS_POLL_MS = 8000;

/** Debounce before looking up an invite email's account, so the preview
 * doesn't fire a request on every keystroke. */
export const INVITE_LOOKUP_DEBOUNCE_MS = 300;

/** How long the realtime connection has to stay disconnected before the
 * editor shows a banner about it — a brief drop that reconnects on its own
 * doesn't deserve one. */
export const DISCONNECT_BANNER_DELAY_MS = 5000;

/** How long the app can sit untouched before the auto-lock screen (when
 * enabled — see lib/autoLock.ts) covers it, requiring the password again.
 * Matches settings.autoLockValue's copy ("Depois de 30 minutos") — not
 * yet a user-configurable duration, just the one the UI already promises. */
export const AUTO_LOCK_IDLE_MS = 1_800_000; // 30 minutes

// --- Validation ------------------------------------------------------------

export const PASSWORD_MIN_LENGTH = 12;

/** Largest file the "Importar" starting point (NewDocumentModal) will
 * read — the editor is a plain textarea, not built for dropping a whole
 * book into, and the imported text becomes one CRDT update on creation. */
export const IMPORT_MAX_FILE_BYTES = 1_000_000;
