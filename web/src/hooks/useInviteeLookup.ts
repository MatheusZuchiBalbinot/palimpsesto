import { useEffect, useState } from 'react';

import { lookupUser } from '../api/keys';
import type { PublicKeysDTO } from '../api/keysTypes';
import { INVITE_LOOKUP_DEBOUNCE_MS } from '../constants';

/** Just enough shape-checking to decide "worth a lookup request" — not a
 * validator, so no need for a proper email regex (and its backtracking
 * risk on adversarial input). */
function looksLikeEmail(value: string): boolean {
	const at = value.indexOf('@');
	if (at <= 0 || at === value.length - 1) {
		return false;
	}
	const domain = value.slice(at + 1);
	const dot = domain.indexOf('.');
	return dot > 0 && dot < domain.length - 1;
}

/** Resolves an invite email to the account it belongs to, debounced —
 * turning "invite" into "confirm this is the right person" before the
 * invite is even sent (UX_REVIEW.md 4.10): the invitee's sigil here is the
 * same identity-verification the project already asks people to do out of
 * band, just surfaced earlier. Silent about "not found": a wrong or
 * not-yet-registered email is an entirely normal thing to be mid-typing. */
export function useInviteeLookup(email: string) {
	const [invitee, setInvitee] = useState<PublicKeysDTO | null>(null);
	const [isLookingUp, setIsLookingUp] = useState(false);

	useEffect(() => {
		setInvitee(null);
		if (!looksLikeEmail(email)) {
			setIsLookingUp(false);
			return;
		}

		setIsLookingUp(true);
		let isCancelled = false;
		const timer = setTimeout(() => {
			lookupUser(email)
				.then((found) => {
					if (!isCancelled) {
						setInvitee(found);
					}
				})
				.catch(() => {
					// Not found, no keys published yet, or a network hiccup —
					// all the same "nothing to preview" from here.
				})
				.finally(() => {
					if (!isCancelled) {
						setIsLookingUp(false);
					}
				});
		}, INVITE_LOOKUP_DEBOUNCE_MS);

		return () => {
			isCancelled = true;
			clearTimeout(timer);
		};
	}, [email]);

	return { invitee, isLookingUp };
}
