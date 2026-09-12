import type { TFunction } from 'i18next';
import { useCallback, useEffect, useState } from 'react';

import { cancelInvite, createInvite, leaveDocument, listInvitesForDocument, listMembers, removeMember, updateMemberRole } from '../api/docs';
import type { InviteDTO, MemberDTO, Role } from '../api/docTypes';
import type { DocumentId, InviteId, UserId } from '../api/ids';
import { lookupUser } from '../api/keys';
import type { ShareInviteFormProps } from '../components/share/ShareInviteForm';
import type { ShareMembersListProps } from '../components/share/ShareMembersList';
import { generateDEK, type DocumentDEK } from '../crypto/documentDek';
import { base64ToBytes, bytesToBase64 } from '../crypto/identity';
import { checkKnownKey, trustKey } from '../crypto/knownKeys';
import { seal } from '../crypto/sealedBox';
import { translateError } from '../i18n/errors';
import { reconcilePendingMember } from '../lib/pendingMemberAccess';
import type { KeyChangeConflict, ShareModalOverlayState } from '../lib/shareModalOverlay';
import { showToast } from '../lib/toast';
import { useAsyncAction } from './useAsyncAction';

type InviteMemberResult = { status: 'invited' } | ({ status: 'conflict' } & KeyChangeConflict);

type InviteMemberParams = {
	docId: DocumentId;
	email: string;
	role: Role;
	dek: Uint8Array;
};

/** Invites a member by email: fetches their public keys, seals a copy of
 * the DEK for them, and creates a *pending* invite on the server — unless
 * this browser already trusts a different identity key for that user
 * (the "key-change warning" from docs/CRYPTO.md), in which case it
 * refrains from wrapping anything and reports the conflict instead. The
 * seal happens now, same as it always did, but the invitee only becomes a
 * real member once they accept (vault's "Convites" — AcceptInviteHandler
 * moves this same sealed key into doc_members server-side). */
async function inviteMember({ docId, email, role, dek }: InviteMemberParams): Promise<InviteMemberResult> {
	const invitee = await lookupUser(email);
	const trust = checkKnownKey({ userId: invitee.user_id, identityPub: invitee.identity_pub, signingPub: invitee.signing_pub });
	if (trust === 'changed') {
		return { status: 'conflict', invitee, email };
	}
	if (trust === 'first-time') {
		trustKey({ userId: invitee.user_id, identityPub: invitee.identity_pub, signingPub: invitee.signing_pub });
	}
	const wrappedDek = seal(base64ToBytes(invitee.identity_pub), dek);
	await createInvite(docId, { email, role, wrapped_dek: bytesToBase64(wrappedDek) });
	return { status: 'invited' };
}

type RemoveMemberResult = { status: 'rotated'; newKey: DocumentDEK } | ({ status: 'conflict' } & KeyChangeConflict);

/** Removes a member by rotating the DEK — a new key sealed for each
 * remaining member, computed entirely client-side (the server never sees a
 * plaintext DEK). Same key-change protection as inviteMember: if some
 * remaining member's identity key doesn't match what this browser trusted
 * before, this refrains from wrapping a new key against an unverified one
 * and reports the conflict instead. */
async function removeMemberWithRotation(docId: DocumentId, removeTargetId: UserId, remainingMembers: MemberDTO[]): Promise<RemoveMemberResult> {
	const newDek = generateDEK();
	const newWraps: Record<UserId, string> = {};
	for (const member of remainingMembers) {
		const theirKeys = await lookupUser(member.email);
		const trust = checkKnownKey({ userId: member.user_id, identityPub: theirKeys.identity_pub, signingPub: theirKeys.signing_pub });
		if (trust === 'changed') {
			return { status: 'conflict', invitee: theirKeys, email: member.email };
		}
		if (trust === 'first-time') {
			trustKey({ userId: member.user_id, identityPub: theirKeys.identity_pub, signingPub: theirKeys.signing_pub });
		}
		newWraps[member.user_id] = bytesToBase64(seal(base64ToBytes(theirKeys.identity_pub), newDek));
	}
	const result = await removeMember(docId, removeTargetId, { new_wraps: newWraps });
	return { status: 'rotated', newKey: { dek: newDek, keyEpoch: result.key_epoch } };
}

type UseInviteFlowParams = {
	docId: DocumentId;
	dek: Uint8Array;
	refresh: () => void;
	t: TFunction;
};

/** The email invite form's state and submit flow, including the key-change
 * conflict it can run into (the "key-change warning" from docs/CRYPTO.md)
 * and the explicit retry once the caller confirms anyway. */
function useInviteFlow({ docId, dek, refresh, t }: UseInviteFlowParams) {
	const [email, setEmail] = useState('');
	const [role, setRole] = useState<Role>('editor');
	const [keyChange, setKeyChange] = useState<KeyChangeConflict | null>(null);

	const [{ isPending, error }, submit] = useAsyncAction(async () => {
		const result = await inviteMember({ docId, email, role, dek });
		if (result.status === 'conflict') {
			setKeyChange({ invitee: result.invitee, email: result.email });
			return;
		}
		setEmail('');
		showToast(t('share.inviteSent'), 'success');
		refresh();
	});

	function handleTrustAndRetry() {
		if (!keyChange) {
			return;
		}
		trustKey({ userId: keyChange.invitee.user_id, identityPub: keyChange.invitee.identity_pub, signingPub: keyChange.invitee.signing_pub });
		setKeyChange(null);
		submit();
	}

	return {
		email,
		setEmail,
		role,
		setRole,
		isPending,
		error,
		submit,
		keyChange,
		setKeyChange,
		handleTrustAndRetry,
	};
}

type UseRemoveFlowParams = {
	docId: DocumentId;
	members: MemberDTO[];
	onKeyRotated: () => void;
	refresh: () => void;
	onRotated: (newKey: DocumentDEK) => void;
};

/** The remove-member flow: rotates the DEK for whoever remains, falling
 * into the same key-change conflict useInviteFlow can hit if some
 * remaining member's identity key doesn't match what this browser trusted
 * before. */
function useRemoveFlow({ docId, members, onKeyRotated, refresh, onRotated }: UseRemoveFlowParams) {
	const [removeTarget, setRemoveTarget] = useState<MemberDTO | null>(null);
	const [removeKeyChange, setRemoveKeyChange] = useState<KeyChangeConflict | null>(null);

	const [{ isPending: isRemoving, error: removeError }, submitRemove] = useAsyncAction(async () => {
		if (!removeTarget) {
			return;
		}
		const remaining = members.filter((m) => m.user_id !== removeTarget.user_id);
		const result = await removeMemberWithRotation(docId, removeTarget.user_id, remaining);
		if (result.status === 'conflict') {
			setRemoveKeyChange({ invitee: result.invitee, email: result.email });
			return;
		}
		onRotated(result.newKey);
		setRemoveTarget(null);
		onKeyRotated();
		refresh();
	});

	function handleTrustAndRetryRemove() {
		if (!removeKeyChange) {
			return;
		}
		trustKey({
			userId: removeKeyChange.invitee.user_id,
			identityPub: removeKeyChange.invitee.identity_pub,
			signingPub: removeKeyChange.invitee.signing_pub,
		});
		setRemoveKeyChange(null);
		submitRemove();
	}

	return {
		removeTarget,
		setRemoveTarget,
		isRemoving,
		removeError,
		submitRemove,
		removeKeyChange,
		setRemoveKeyChange,
		handleTrustAndRetryRemove,
	};
}

type UseMembershipEditFlowParams = {
	docId: DocumentId;
	ownUserId: UserId;
	dek: Uint8Array;
	refresh: () => void;
	/** Called after the caller successfully leaves the document — nothing
	 * left in this modal to manage from that point on, so the caller
	 * decides what "leaving" means for it (close and refresh a list,
	 * navigate away from the document currently open). */
	onLeft: () => void;
	t: TFunction;
};

/** The role-change, grant-access, and leave-document flows — the
 * non-invite, non-remove ways a member row can change, split out from
 * useShareMembers the same way useInviteFlow/useRemoveFlow are, so that
 * hook stays a thin composition instead of ten useStates in one body. */
function useMembershipEditFlow({ docId, ownUserId, dek, refresh, onLeft, t }: UseMembershipEditFlowParams) {
	const [grantingUserId, setGrantingUserId] = useState<UserId | null>(null);
	async function handleGrantAccess(member: MemberDTO) {
		setGrantingUserId(member.user_id);
		try {
			const conflict = await reconcilePendingMember(docId, member, dek);
			if (conflict) {
				showToast(t('share.grantAccessKeyChanged', { name: member.display_name || member.email }), 'error');
				return;
			}
			refresh();
		} finally {
			setGrantingUserId(null);
		}
	}

	async function handleChangeRole(member: MemberDTO, role: Exclude<Role, 'owner'>) {
		try {
			await updateMemberRole(docId, member.user_id, { role });
			refresh();
		} catch (e) {
			showToast(translateError(t, e), 'error');
		}
	}

	const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
	const [isLeaving, setIsLeaving] = useState(false);
	async function handleConfirmLeave() {
		setIsLeaving(true);
		try {
			await leaveDocument(docId, ownUserId);
			onLeft();
		} catch (e) {
			showToast(translateError(t, e), 'error');
			setIsLeaveConfirmOpen(false);
		} finally {
			setIsLeaving(false);
		}
	}

	return {
		grantingUserId,
		handleGrantAccess,
		handleChangeRole,
		isLeaveConfirmOpen,
		isLeaving,
		onRequestLeave: () => setIsLeaveConfirmOpen(true),
		onConfirmLeave: () => void handleConfirmLeave(),
		onCancelLeave: () => setIsLeaveConfirmOpen(false),
	};
}

type UseShareMembersParams = {
	docId: DocumentId;
	documentKey: DocumentDEK;
	ownUserId: UserId;
	onKeyRotated: () => void;
	/** Called after the caller successfully leaves the document — nothing
	 * left in this modal to manage from that point on, so the caller
	 * decides what "leaving" means for it (close and refresh a list,
	 * navigate away from the document currently open). */
	onLeft: () => void;
	t: TFunction;
};

/** Concentrates the entire mutable state ShareModalContent needs — member
 * list, invite form, remove-member flow, and the key-change conflict that
 * can interrupt any of them — so the component itself just wires this up
 * to JSX, without managing seven useStates directly. */
export function useShareMembers({ docId, documentKey, ownUserId, onKeyRotated, onLeft, t }: UseShareMembersParams) {
	const [members, setMembers] = useState<MemberDTO[]>([]);
	const [pendingInvites, setPendingInvites] = useState<InviteDTO[]>([]);
	// The document's DEK/epoch, kept locally so a removal's rotation is
	// immediately usable by a *following* invite in the same modal
	// session, without waiting for the parent page to re-fetch —
	// onKeyRotated still notifies the parent page to update its own copy
	// for everything else it does with the key.
	const [currentKey, setCurrentKey] = useState(documentKey);

	const isOwner = members.some((m) => m.user_id === ownUserId && m.role === 'owner');
	const [loadError, setLoadError] = useState<unknown>(null);

	// A failed fetch used to leave `members` at its initial `[]` with no
	// trace of the error — indistinguishable from "a document with no
	// members", and isOwner (above) derives from that same list, so a
	// network hiccup silently took the owner's management controls away.
	const refresh = useCallback(() => {
		listMembers(docId)
			.then((next) => {
				setMembers(next);
				setLoadError(null);
			})
			.catch(setLoadError);
		listInvitesForDocument(docId)
			.then(setPendingInvites)
			.catch(() => {
				// Best-effort: a failure here shouldn't block the member list
				// from rendering — the Share modal still works without the
				// "convite enviado" rows.
			});
	}, [docId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const [cancellingInviteId, setCancellingInviteId] = useState<InviteId | null>(null);
	async function handleCancelInvite(invite: InviteDTO) {
		setCancellingInviteId(invite.id);
		try {
			await cancelInvite(docId, invite.id);
			refresh();
		} catch (e) {
			showToast(translateError(t, e), 'error');
		} finally {
			setCancellingInviteId(null);
		}
	}

	const invite = useInviteFlow({ docId, dek: currentKey.dek, refresh, t });
	const removeFlowInput: UseRemoveFlowParams = { docId, members, onKeyRotated, refresh, onRotated: setCurrentKey };
	const remove = useRemoveFlow(removeFlowInput);
	const membershipEdit = useMembershipEditFlow({ docId, ownUserId, dek: currentKey.dek, refresh, onLeft, t });

	const overlayProps: ShareModalOverlayState = {
		removeTarget: remove.removeTarget,
		isRemoving: remove.isRemoving,
		onConfirmRemove: remove.submitRemove,
		onCancelRemove: () => remove.setRemoveTarget(null),
		removeKeyChange: remove.removeKeyChange,
		onConfirmRemoveKeyChange: remove.handleTrustAndRetryRemove,
		onCancelRemoveKeyChange: () => remove.setRemoveKeyChange(null),
		keyChange: invite.keyChange,
		onConfirmKeyChange: invite.handleTrustAndRetry,
		onCancelKeyChange: () => invite.setKeyChange(null),
		isLeaveConfirmOpen: membershipEdit.isLeaveConfirmOpen,
		isLeaving: membershipEdit.isLeaving,
		onConfirmLeave: membershipEdit.onConfirmLeave,
		onCancelLeave: membershipEdit.onCancelLeave,
	};

	const inviteForm: ShareInviteFormProps = {
		email: invite.email,
		onEmailChange: invite.setEmail,
		role: invite.role,
		onRoleChange: invite.setRole,
		isPending: invite.isPending,
		error: invite.error,
		onSubmit: (e) => {
			e.preventDefault();
			invite.submit();
		},
	};

	const membersList: ShareMembersListProps = {
		members,
		pendingInvites,
		cancellingInviteId,
		onCancelInvite: (invite: InviteDTO) => void handleCancelInvite(invite),
		isOwner,
		ownUserId,
		onRequestRemove: remove.setRemoveTarget,
		loadError,
		removeError: remove.removeError,
		grantingUserId: membershipEdit.grantingUserId,
		onGrantAccess: (member) => void membershipEdit.handleGrantAccess(member),
		onChangeRole: (member, role) => void membershipEdit.handleChangeRole(member, role),
	};

	return {
		inviteForm,
		membersList,
		overlayProps,
		onRequestLeave: membershipEdit.onRequestLeave,
	};
}
