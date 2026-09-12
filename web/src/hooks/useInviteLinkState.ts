import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';

import { createInviteLink, getInviteLink, revokeInviteLink } from '../api/docs';
import type { InviteLinkDTO, InviteLinkRole } from '../api/docTypes';
import type { DocumentId } from '../api/ids';
import type { InviteLinkActionsRowProps, InviteLinkCopyRowProps } from '../components/share/InviteLinkSection';
import { COPIED_FEEDBACK_MS } from '../constants';
import { showToast } from '../lib/toast';
import { routes } from '../routes';
import { useAsyncAction } from './useAsyncAction';

export function inviteUrl(token: string): string {
	return `${window.location.origin}${routes.invite(token)}`;
}

/** Concentrates the invite link's state and every action on it (load,
 * create, revoke, copy) — separated from InviteLinkSection so the
 * component itself just wires this up to JSX. */
export function useInviteLinkState(docId: DocumentId, t: TFunction) {
	const [link, setLink] = useState<InviteLinkDTO | null>(null);
	const [isOwner, setIsOwner] = useState(true);
	const [linkRole, setLinkRole] = useState<InviteLinkRole>('editor');
	const [isCopied, setIsCopied] = useState(false);

	useEffect(() => {
		getInviteLink(docId)
			.then((existing) => {
				setLink(existing);
				if (existing) {
					setLinkRole(existing.role);
				}
			})
			.catch(() => setIsOwner(false));
	}, [docId]);

	const [{ isPending: isCreating, error: createError }, submitCreate] = useAsyncAction(async () => {
		const created = await createInviteLink(docId, { role: linkRole });
		setLink(created);
	});

	const [{ isPending: isRevoking }, submitRevoke] = useAsyncAction(async () => {
		await revokeInviteLink(docId);
		setLink(null);
	});

	function handleCopy() {
		if (!link) {
			return;
		}
		navigator.clipboard
			?.writeText(inviteUrl(link.token))
			.then(() => {
				setIsCopied(true);
				showToast(t('share.linkCopiedToast'), 'success');
				setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS);
			})
			.catch(() => {
				// Clipboard permission denied or unavailable — the link still
				// shows as plain text in the input, so the user can
				// select/copy manually.
			});
	}

	const copyRow: InviteLinkCopyRowProps = { isCopied, onCopy: handleCopy };

	const actionsRow: InviteLinkActionsRowProps = {
		hasLink: !!link,
		linkRole,
		onLinkRoleChange: setLinkRole,
		isCreating,
		onCreate: submitCreate,
		isRevoking,
		onRevoke: submitRevoke,
	};

	return { link, isOwner, copyRow, actionsRow, createError };
}
