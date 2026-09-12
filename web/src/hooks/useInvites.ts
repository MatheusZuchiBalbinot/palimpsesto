import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';

import { acceptInvite, declineInvite, listInvites } from '../api/docs';
import type { InviteDTO } from '../api/docTypes';
import type { InviteId } from '../api/ids';
import { getSession } from '../auth/session';
import { translateError } from '../i18n/errors';
import { showToast } from '../lib/toast';
import { UserNotificationChannel } from '../realtime/userChannel';

/** The vault's "Convites" view — pending invites addressed to the caller,
 * fetched separately from the main list (see VaultScope's doc comment).
 * onAccepted fires after a successful accept — the caller just gained
 * real membership in a document, so the main vault list needs a
 * refresh to pick it up. Also opens the per-user notification channel
 * (see realtime/userChannel.ts) while active, so a new/accepted/declined/
 * cancelled invite refreshes this list live instead of only on the next
 * page load. */
export function useInvites(isActive: boolean, t: TFunction, onAccepted?: () => void) {
	const [invites, setInvites] = useState<InviteDTO[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [respondingId, setRespondingId] = useState<InviteId | null>(null);
	// refresh() has 3 independent callers (the isActive effect below, the
	// realtime notification channel, and a manual retry) that can overlap —
	// this sequence number ensures only the most recently *issued* call
	// ever writes state, so a slower earlier response can't land after a
	// newer one and show stale invites.
	const requestSeqRef = useRef(0);

	const refresh = useCallback(() => {
		const seq = ++requestSeqRef.current;
		setIsLoading(true);
		listInvites()
			.then((next) => {
				if (seq === requestSeqRef.current) {
					setInvites(next);
				}
			})
			.catch(() => {
				if (seq === requestSeqRef.current) {
					setInvites([]);
				}
			})
			.finally(() => {
				if (seq === requestSeqRef.current) {
					setIsLoading(false);
				}
			});
	}, []);

	useEffect(() => {
		if (isActive) {
			refresh();
		}
	}, [isActive, refresh]);

	useEffect(() => {
		if (!isActive) {
			return;
		}
		const channel = new UserNotificationChannel({
			getToken: () => getSession()?.accessToken ?? null,
			onInvitesChanged: refresh,
		});
		return () => channel.destroy();
	}, [isActive, refresh]);

	async function respond(invite: InviteDTO, action: (id: InviteId) => Promise<void>, onSuccess?: () => void) {
		setRespondingId(invite.id);
		try {
			await action(invite.id);
			setInvites((current) => current.filter((i) => i.id !== invite.id));
			onSuccess?.();
		} catch (e) {
			showToast(translateError(t, e), 'error');
		} finally {
			setRespondingId(null);
		}
	}

	return {
		invites,
		isLoading,
		refresh,
		respondingId,
		onAccept: (invite: InviteDTO) => void respond(invite, acceptInvite, onAccepted),
		onDecline: (invite: InviteDTO) => void respond(invite, declineInvite),
	};
}
