import { useTranslation } from 'react-i18next';

import { Button } from './Button';
import { Modal } from './Modal';
import { useModalClose } from './modalCloseContext';
import { useModalTitleId } from './modalTitleContext';

type ConfirmModalProps = {
	title: string;
	body: string;
	confirmLabel: string;
	onConfirm: () => void;
	onClose: () => void;
	pending?: boolean;
};

/** The one confirmation dialog every destructive action in the app goes
 * through (deleting a document, deleting a comment, ...) — replaces
 * window.confirm, which can't be styled, animated, or localized beyond
 * whatever the browser decides to show. */
export function ConfirmModal({ title, body, confirmLabel, onConfirm, onClose, pending }: Readonly<ConfirmModalProps>) {
	return (
		<Modal onClose={onClose} maxWidth={400}>
			<ConfirmModalInner title={title} body={body} confirmLabel={confirmLabel} onConfirm={onConfirm} pending={pending} />
		</Modal>
	);
}

// Only for ConfirmModal's own standalone Modal above — resolves
// useModalClose() to the Modal wrapping *this* component, which only works
// when called from inside that Modal's children (see modalCloseContext.ts).
function ConfirmModalInner(props: Readonly<Omit<ConfirmModalProps, 'onClose'>>) {
	const requestClose = useModalClose();
	return <ConfirmModalContent {...props} onCancel={requestClose} />;
}

type ConfirmModalContentProps = {
	title: string;
	body: string;
	confirmLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
	pending?: boolean;
};

/** The actual confirmation content, with no Modal/overlay of its own — for
 * a caller that already has one open (ShareModal's remove-member flow
 * triggers this while its own sharing dialog is still open) and needs this
 * to take over that same card instead of stacking a second overlay on top
 * of it, which resulted in a broken, doubly-dimmed mess with the first
 * dialog's content bleeding through underneath (discovered by actually
 * looking at a screenshot, not by code review). ConfirmModal above is this
 * plus its own Modal, for a caller that doesn't have anything open yet. */
export function ConfirmModalContent({ title, body, confirmLabel, onConfirm, onCancel, pending }: Readonly<ConfirmModalContentProps>) {
	const { t } = useTranslation();
	const titleId = useModalTitleId();

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<div className="modal-title" id={titleId}>
				{title}
			</div>
			<p className="text-sm text-secondary" style={{ margin: 0, lineHeight: 1.5 }}>
				{body}
			</p>
			<div className="modal-actions">
				<Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
					{t('confirmModal.cancel')}
				</Button>
				<Button type="button" variant="danger" onClick={onConfirm} disabled={pending}>
					{confirmLabel}
				</Button>
			</div>
		</div>
	);
}
