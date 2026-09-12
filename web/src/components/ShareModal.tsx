import { useTranslation } from 'react-i18next';

import type { DocumentId, UserId } from '../api/ids';
import type { DocumentDEK } from '../crypto/documentDek';
import { useShareMembers } from '../hooks/useShareMembers';
import { hasShareModalOverlay } from '../lib/shareModalOverlay';
import { ShareModalBody } from './share/ShareModalBody';
import { ShareModalOverlay } from './share/ShareModalOverlays';
import { Modal } from './Modal';
import { useModalClose } from './modalCloseContext';

type ShareModalProps = {
	docTitle: string;
	docId: DocumentId;
	/** The document's current DEK and epoch — needed to seal a copy for
	 * whoever is invited by email (the sharing envelope from
	 * docs/CRYPTO.md). */
	documentKey: DocumentDEK;
	ownUserId: UserId;
	/** Called after removing a member rotates the document's key — the
	 * caller's cached DEK is now stale and needs to be fetched again. */
	onKeyRotated: () => void;
	/** Called after the caller leaves the document themselves — there's
	 * nothing left in this modal to show, so the caller decides what
	 * happens next (close and refresh a list, navigate away from the
	 * document currently open). */
	onLeft: () => void;
	onClose: () => void;
};

export function ShareModal({ docTitle, docId, documentKey, ownUserId, onKeyRotated, onLeft, onClose }: Readonly<ShareModalProps>) {
	return (
		<Modal onClose={onClose} maxWidth={472} flush>
			<ShareModalContent
				docTitle={docTitle}
				docId={docId}
				documentKey={documentKey}
				ownUserId={ownUserId}
				onKeyRotated={onKeyRotated}
				onLeft={onLeft}
			/>
		</Modal>
	);
}

// Separated from ShareModal so useModalClose() resolves to *this* modal's
// close animation — only works when called from inside the Modal's own
// children, not from the component that renders <Modal> in the first
// place.
function ShareModalContent({
	docTitle,
	docId,
	documentKey,
	ownUserId,
	onKeyRotated,
	onLeft,
}: Readonly<{
	docTitle: string;
	docId: DocumentId;
	documentKey: DocumentDEK;
	ownUserId: UserId;
	onKeyRotated: () => void;
	onLeft: () => void;
}>) {
	const requestClose = useModalClose();
	const { t } = useTranslation();
	const { inviteForm, membersList, overlayProps, onRequestLeave } = useShareMembers({ docId, documentKey, ownUserId, onKeyRotated, onLeft, t });

	if (hasShareModalOverlay(overlayProps)) {
		return <ShareModalOverlay {...overlayProps} />;
	}

	return (
		<ShareModalBody
			docTitle={docTitle}
			docId={docId}
			inviteForm={inviteForm}
			membersList={membersList}
			onRequestLeave={onRequestLeave}
			onClose={requestClose}
		/>
	);
}
