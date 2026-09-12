import { useTranslation } from 'react-i18next';

import { Button } from './Button';
import { Modal } from './Modal';
import { useModalClose } from './modalCloseContext';
import { useModalTitleId } from './modalTitleContext';

type RestoreModalProps = {
	onClose: () => void;
	onConfirm: () => void;
	pending: boolean;
};

export function RestoreModal({ onClose, onConfirm, pending }: Readonly<RestoreModalProps>) {
	return (
		<Modal onClose={onClose} maxWidth={412}>
			<RestoreModalContent onConfirm={onConfirm} pending={pending} />
		</Modal>
	);
}

// Separated from RestoreModal so useModalClose() resolves to *this* modal's
// close animation — only works when called from inside the Modal's own
// children, not from the component that renders <Modal> in the first place.
function RestoreModalContent({
	onConfirm,
	pending,
}: Readonly<{
	onConfirm: () => void;
	pending: boolean;
}>) {
	const { t } = useTranslation();
	const requestClose = useModalClose();
	const titleId = useModalTitleId();

	return (
		<>
			<div className="modal-title" id={titleId}>
				{t('restoreModal.title')}
			</div>
			<p className="text-base text-tertiary leading-relaxed">{t('restoreModal.body')}</p>
			<div className="modal-actions">
				<Button type="button" variant="secondary" onClick={requestClose}>
					{t('restoreModal.cancel')}
				</Button>
				<Button type="button" onClick={onConfirm} disabled={pending}>
					{t('restoreModal.restore')}
				</Button>
			</div>
		</>
	);
}
