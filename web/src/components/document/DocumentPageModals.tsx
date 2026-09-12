import { useTranslation } from 'react-i18next';

import type { DocumentDTO } from '../../api/docTypes';
import type { CommentId, UserId } from '../../api/ids';
import type { Session } from '../../auth/session';
import type { DocumentDEK } from '../../crypto/documentDek';
import type { KeyConflict } from '../../hooks/useKeyConflicts';
import { toKeyChangePrompt } from '../../lib/shareModalOverlay';
import { ConfirmModal } from '../ConfirmModal';
import { KeyChangeWarning } from '../KeyChangeWarning';
import { ShareModal } from '../ShareModal';
import { ShortcutsHelpModal } from '../ShortcutsHelpModal';

/** Every modal DocumentPage can have open, as a single discriminated
 * union instead of one independent boolean/nullable field per modal —
 * same reasoning as VaultModal in components/vault/VaultModals.tsx:
 * nothing stopped e.g. the share dialog and the delete confirmation
 * from both being "open" at once before this. keyConflict is
 * deliberately kept separate (see DocumentPageModalsProps below): it's
 * not a modal the user opens, it's an interrupt that can need showing
 * regardless of whichever of these the user already had open. */
export type DocumentModal =
	{ type: 'share' } | { type: 'shortcuts-help' } | { type: 'delete-document' } | { type: 'delete-comment'; commentId: CommentId };

type ShareModalSlotProps = {
	docInfo: DocumentDTO | null;
	documentKey: DocumentDEK | null;
	session: Session | null;
	displayTitle: string;
	onKeyRotated: () => void;
	onLeft: () => void;
	onClose: () => void;
};

function ShareModalSlot({ docInfo, documentKey, session, displayTitle, onKeyRotated, onLeft, onClose }: Readonly<ShareModalSlotProps>) {
	if (!docInfo || !documentKey || !session) {
		return null;
	}
	return (
		<ShareModal
			docId={docInfo.id}
			docTitle={displayTitle}
			documentKey={documentKey}
			ownUserId={session.user.user_id}
			onKeyRotated={onKeyRotated}
			onLeft={onLeft}
			onClose={onClose}
		/>
	);
}

type KeyConflictSlotProps = {
	keyConflict: KeyConflict | undefined;
	onTrustKeyConflict: (conflict: KeyConflict) => void;
	onDismissKeyConflict: (userId: UserId) => void;
};

function KeyConflictSlot({ keyConflict, onTrustKeyConflict, onDismissKeyConflict }: Readonly<KeyConflictSlotProps>) {
	if (!keyConflict) {
		return null;
	}
	return (
		<KeyChangeWarning
			{...toKeyChangePrompt(keyConflict)}
			onConfirm={() => onTrustKeyConflict(keyConflict)}
			onClose={() => onDismissKeyConflict(keyConflict.userId)}
		/>
	);
}

type DocumentPageModalsProps = {
	modal: DocumentModal | null;
	onClose: () => void;
	docInfo: DocumentDTO | null;
	documentKey: DocumentDEK | null;
	session: Session | null;
	displayTitle: string;
	onShareKeyRotated: () => void;
	onLeaveDocument: () => void;
	onConfirmDeleteDocument: () => void;
	onConfirmDeleteComment: () => void;
	keyConflict: KeyConflict | undefined;
	onTrustKeyConflict: (conflict: KeyConflict) => void;
	onDismissKeyConflict: (userId: UserId) => void;
};

function ActiveModal({
	modal,
	onClose,
	docInfo,
	documentKey,
	session,
	displayTitle,
	onShareKeyRotated,
	onLeaveDocument,
	onConfirmDeleteDocument,
	onConfirmDeleteComment,
}: Readonly<Omit<DocumentPageModalsProps, 'keyConflict' | 'onTrustKeyConflict' | 'onDismissKeyConflict'>>) {
	const { t } = useTranslation();
	if (!modal) {
		return null;
	}

	switch (modal.type) {
		case 'share':
			return (
				<ShareModalSlot
					docInfo={docInfo}
					documentKey={documentKey}
					session={session}
					displayTitle={displayTitle}
					onKeyRotated={onShareKeyRotated}
					onLeft={onLeaveDocument}
					onClose={onClose}
				/>
			);

		case 'shortcuts-help':
			return <ShortcutsHelpModal onClose={onClose} />;

		case 'delete-document':
			if (!docInfo) {
				return null;
			}
			return (
				<ConfirmModal
					title={t('vault.deleteConfirmTitle')}
					body={t('vault.deleteConfirmBody', { title: displayTitle })}
					confirmLabel={t('vault.menu.delete')}
					onConfirm={onConfirmDeleteDocument}
					onClose={onClose}
				/>
			);

		case 'delete-comment':
			return (
				<ConfirmModal
					title={t('editor.deleteCommentConfirmTitle')}
					body={t('editor.deleteCommentConfirmBody')}
					confirmLabel={t('editor.deleteComment')}
					onConfirm={onConfirmDeleteComment}
					onClose={onClose}
				/>
			);
	}
}

export function DocumentPageModals({
	keyConflict,
	onTrustKeyConflict,
	onDismissKeyConflict,
	...activeModalProps
}: Readonly<DocumentPageModalsProps>) {
	return (
		<>
			<ActiveModal {...activeModalProps} />
			<KeyConflictSlot keyConflict={keyConflict} onTrustKeyConflict={onTrustKeyConflict} onDismissKeyConflict={onDismissKeyConflict} />
		</>
	);
}
