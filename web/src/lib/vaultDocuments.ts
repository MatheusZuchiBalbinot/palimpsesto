import type { TFunction } from 'i18next';

import type { DocumentSummaryDTO, MemberDTO } from '../api/docTypes';
import type { DocumentId, UserId } from '../api/ids';
import type { Session } from '../auth/session';
import { formatRelativeTime } from './relativeTime';

export type SortMode = 'recent' | 'name' | 'activity';
export const SORT_MODES: SortMode[] = ['recent', 'name', 'activity'];

/** Which slice of the vault the sidebar is showing — 'all' is the
 * historical default (every document the caller is a member of).
 * 'archived' and 'invites' aren't filters over the same list like the
 * others: each is its own separate fetch (the caller's own deleted
 * documents; the caller's own pending invites), handled entirely in
 * DocumentsPage rather than through matchesScope below. */
export const VAULT_SCOPE = {
	ALL: 'all',
	MINE: 'mine',
	SHARED: 'shared',
	ARCHIVED: 'archived',
	INVITES: 'invites',
} as const;

export type VaultScope = (typeof VAULT_SCOPE)[keyof typeof VAULT_SCOPE];

export function matchesScope(doc: DocumentSummaryDTO, scope: VaultScope, ownUserId: UserId | undefined): boolean {
	if (scope === VAULT_SCOPE.ALL) {
		return true;
	}
	const isOwnedByCaller = doc.owner_id === ownUserId;
	return scope === VAULT_SCOPE.MINE ? isOwnedByCaller : !isOwnedByCaller;
}

type MetaLineParams = {
	doc: DocumentSummaryDTO;
	t: TFunction;
	locale: string;
	ownName: string;
};

export function metaLine({ doc, t, locale, ownName }: MetaLineParams): string {
	if (!doc.last_edited_at) {
		return t('vault.noEditsYet');
	}

	const time = formatRelativeTime(doc.last_edited_at, locale);
	if (doc.last_editor_name === ownName) {
		return t('vault.editedByYou', { time, count: doc.update_count });
	}
	return t('vault.editedBy', {
		time,
		name: doc.last_editor_name,
		count: doc.update_count,
	});
}

type DocumentComparator = (a: DocumentSummaryDTO, b: DocumentSummaryDTO) => number;

function recentComparator(a: DocumentSummaryDTO, b: DocumentSummaryDTO): number {
	const bTime = b.last_edited_at ? Date.parse(b.last_edited_at) : 0;
	const aTime = a.last_edited_at ? Date.parse(a.last_edited_at) : 0;
	return bTime - aTime;
}

function activityComparator(a: DocumentSummaryDTO, b: DocumentSummaryDTO): number {
	return b.update_count - a.update_count;
}

export function sortDocuments(docs: DocumentSummaryDTO[], titleFor: (doc: DocumentSummaryDTO) => string, mode: SortMode): DocumentSummaryDTO[] {
	const comparators: Record<SortMode, DocumentComparator> = {
		recent: recentComparator,
		activity: activityComparator,
		name: (a, b) => titleFor(a).localeCompare(titleFor(b)),
	};
	return [...docs].sort(comparators[mode]);
}

export function resolveOwnName(session: Session | null): string {
	if (!session) {
		return '';
	}
	return session.user.display_name || session.user.email;
}

/** Sidebar "Online agora" widget — everyone currently active in any of the
 * caller's own documents, deduplicated (the same person can show up under
 * several documents in activeUsersByDoc at once) and excluding the caller. */
export function dedupeOnlineUsers(activeUsersByDoc: Map<DocumentId, MemberDTO[]>, ownUserId: UserId | undefined): MemberDTO[] {
	const allMembers = [...activeUsersByDoc.values()].flat();
	const others = allMembers.filter((member) => member.user_id !== ownUserId);
	const seen = new Map(others.map((member) => [member.user_id, member]));
	return [...seen.values()];
}
