import type { TFunction } from 'i18next';

import { updateMemberRole } from '../api/docs';
import type { MemberDTO, Role } from '../api/docTypes';
import type { DocumentId } from '../api/ids';
import { translateError } from '../i18n/errors';
import { showToast } from './toast';

export type CreatePeopleActionsParams = {
	docId: DocumentId | undefined;
	refreshMembers: () => void;
	t: TFunction;
};

/** The people panel's own per-row role change (UX_REVIEW.md 4.6) — the
 * owner-only, no-rotation role edit that ShareModal's member list already
 * offers, reachable here too without needing to open that modal first. */
export function createPeopleActions({ docId, refreshMembers, t }: CreatePeopleActionsParams) {
	async function handleChangeRole(member: MemberDTO, role: Exclude<Role, 'owner'>) {
		if (!docId) {
			return;
		}
		try {
			await updateMemberRole(docId, member.user_id, { role });
			refreshMembers();
		} catch (e) {
			showToast(translateError(t, e), 'error');
		}
	}

	return { handleChangeRole };
}
