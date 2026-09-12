// Pinning is purely a local, per-device convenience (no backend field for
// it) — stored in localStorage, namespaced by user id so switching
// accounts on the same browser doesn't leak one person's pins into
// another's list.
import { toDocumentId, type DocumentId, type UserId } from '../api/ids';

function storageKey(userId: UserId): string {
	return `palimpsesto:pinned:${userId}`;
}

export function getPinnedIds(userId: UserId): Set<DocumentId> {
	try {
		const raw = localStorage.getItem(storageKey(userId));
		if (!raw) {
			return new Set();
		}
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return new Set();
		}
		return new Set(parsed.filter((v): v is string => typeof v === 'string').map(toDocumentId));
	} catch {
		return new Set();
	}
}

export function setPinnedIds(userId: UserId, ids: Set<DocumentId>): void {
	try {
		localStorage.setItem(storageKey(userId), JSON.stringify([...ids]));
	} catch {
		// Private mode / storage disabled: pinned state just doesn't survive a reload.
	}
}
