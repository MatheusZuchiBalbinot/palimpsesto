import type { MemberDTO } from '../api/docTypes';
import type { PublicKeysDTO } from '../api/keysTypes';
import type { PendingMemberConflict } from './pendingMemberAccess';

/** A pending "this account's identity key doesn't match what this browser
 * already trusted for them" conflict — the same shape useShareMembers.ts's
 * invite and remove flows both surface (docs/CRYPTO.md's key-change
 * warning), shared here instead of being redeclared anonymously at every
 * site that needs it. */
export type KeyChangeConflict = { invitee: PublicKeysDTO; email: string };

/** The prompt shape KeyChangeWarning/KeyChangeWarningContent actually
 * render — both this module's KeyChangeConflict (invite/remove flows,
 * useShareMembers.ts) and useKeyConflicts.ts's PendingMemberConflict
 * (pending-member reconciliation) represent the same "identity key
 * changed" fact with different field layouts, so every call site used to
 * destructure one or the other by hand. One normalizer instead of three
 * copies of that field mapping. */
export function toKeyChangePrompt(conflict: KeyChangeConflict | PendingMemberConflict): {
	subject: string;
	newIdentityPub: string;
	newSigningPub: string;
} {
	if ('invitee' in conflict) {
		return { subject: conflict.email, newIdentityPub: conflict.invitee.identity_pub, newSigningPub: conflict.invitee.signing_pub };
	}
	return { subject: conflict.email, newIdentityPub: conflict.identityPub, newSigningPub: conflict.signingPub };
}

export type ShareModalOverlayState = {
	removeTarget: MemberDTO | null;
	isRemoving: boolean;
	onConfirmRemove: () => void;
	onCancelRemove: () => void;
	removeKeyChange: KeyChangeConflict | null;
	onConfirmRemoveKeyChange: () => void;
	onCancelRemoveKeyChange: () => void;
	keyChange: KeyChangeConflict | null;
	onConfirmKeyChange: () => void;
	onCancelKeyChange: () => void;
	isLeaveConfirmOpen: boolean;
	isLeaving: boolean;
	onConfirmLeave: () => void;
	onCancelLeave: () => void;
};

/** Whether one of the "take over the whole card" states applies right
 * now — see ShareModalOverlay's doc comment for what that means. Lets the
 * caller choose between rendering the overlay or the normal body without
 * duplicating this state's shape. */
export function hasShareModalOverlay(state: ShareModalOverlayState): boolean {
	return !!(state.removeTarget || state.removeKeyChange || state.keyChange || state.isLeaveConfirmOpen);
}
