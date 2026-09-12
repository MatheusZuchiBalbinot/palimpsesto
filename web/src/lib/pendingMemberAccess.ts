import { setMemberWrappedDEK } from '../api/docs';
import type { MemberDTO } from '../api/docTypes';
import type { DocumentId, UserId } from '../api/ids';
import { lookupUser } from '../api/keys';
import { base64ToBytes, bytesToBase64 } from '../crypto/identity';
import { checkKnownKey, trustKey } from '../crypto/knownKeys';
import { seal } from '../crypto/sealedBox';

export type PendingMemberConflict = {
	userId: UserId;
	email: string;
	identityPub: string;
	signingPub: string;
};

/** Attempt to reconcile a pending member: looks up their public keys and
 * wraps the document's current DEK for them, unless this browser already
 * trusts a different key for that user — in that case it returns a
 * PendingMemberConflict instead of wrapping, so the caller can surface it
 * instead of silently accepting a changed identity. Any existing member
 * can do this for another pending member, not just the owner (docs/CRYPTO.md:
 * wrapping only needs the DEK, which every member already has). */
export async function reconcilePendingMember(docId: DocumentId, member: MemberDTO, dek: Uint8Array): Promise<PendingMemberConflict | null> {
	try {
		const theirKeys = await lookupUser(member.email);
		const trust = checkKnownKey({ userId: member.user_id, identityPub: theirKeys.identity_pub, signingPub: theirKeys.signing_pub });
		if (trust === 'changed') {
			return {
				userId: member.user_id,
				email: member.email,
				identityPub: theirKeys.identity_pub,
				signingPub: theirKeys.signing_pub,
			};
		}
		if (trust === 'first-time') {
			trustKey({ userId: member.user_id, identityPub: theirKeys.identity_pub, signingPub: theirKeys.signing_pub });
		}
		const wrapped = seal(base64ToBytes(theirKeys.identity_pub), dek);
		await setMemberWrappedDEK(docId, member.user_id, { wrapped_dek: bytesToBase64(wrapped) });
		return null;
	} catch {
		return null;
	}
}
