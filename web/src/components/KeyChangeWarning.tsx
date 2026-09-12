import { useTranslation } from 'react-i18next';

import { base64ToBytes, computeFingerprint, identityHash } from '../crypto/identity';
import { Button } from './Button';
import { Modal } from './Modal';
import { useModalClose } from './modalCloseContext';
import { useModalTitleId } from './modalTitleContext';
import { Sigil } from './Sigil';

type KeyChangeWarningProps = {
	/** Who this key belongs to, for display — an email or display name. */
	subject: string;
	newIdentityPub: string;
	newSigningPub: string;
	onConfirm: () => void;
	onClose: () => void;
};

/** Blocks a sharing operation when the other party's identity key doesn't
 * match what this browser last saw for them (the "key-change warning" from
 * docs/CRYPTO.md). Never proceeds silently — the user needs to compare this
 * sigil/fingerprint with the person over another channel and explicitly
 * confirm before crypto/knownKeys.ts records it as trusted. */
export function KeyChangeWarning({ subject, newIdentityPub, newSigningPub, onConfirm, onClose }: Readonly<KeyChangeWarningProps>) {
	return (
		<Modal onClose={onClose} maxWidth={420}>
			<KeyChangeWarningInner subject={subject} newIdentityPub={newIdentityPub} newSigningPub={newSigningPub} onConfirm={onConfirm} />
		</Modal>
	);
}

// Only for KeyChangeWarning's own standalone Modal above — resolves
// useModalClose() to the Modal wrapping *this* component, which only works
// when called from inside that Modal's children (see modalCloseContext.ts).
function KeyChangeWarningInner(props: Readonly<Omit<KeyChangeWarningProps, 'onClose'>>) {
	const requestClose = useModalClose();
	return <KeyChangeWarningContent {...props} onCancel={requestClose} />;
}

type KeyChangeWarningContentProps = {
	subject: string;
	newIdentityPub: string;
	newSigningPub: string;
	onConfirm: () => void;
	onCancel: () => void;
};

/** The actual warning content, with no Modal/overlay of its own — for a
 * caller that already has one open (ShareModal's invite and remove-member
 * flows can trigger this warning *while* its own sharing dialog is still
 * open) and needs the warning to take over that same card instead of
 * stacking a second overlay on top of it, which resulted in a broken,
 * doubly-dimmed mess with the first dialog's content bleeding through
 * underneath (discovered by actually looking at a screenshot, not by code
 * review). KeyChangeWarning above is this plus its own Modal, for a caller
 * that doesn't have anything open yet. */
export function KeyChangeWarningContent({ subject, newIdentityPub, newSigningPub, onConfirm, onCancel }: Readonly<KeyChangeWarningContentProps>) {
	const { t } = useTranslation();
	const titleId = useModalTitleId();
	const identityPublic = base64ToBytes(newIdentityPub);
	const signingPublic = base64ToBytes(newSigningPub);
	const hash = identityHash(identityPublic, signingPublic);
	const fingerprint = computeFingerprint(identityPublic, signingPublic);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<div className="modal-title" id={titleId}>
				{t('keyChangeWarning.title')}
			</div>
			<p className="text-sm text-secondary" style={{ margin: 0, lineHeight: 1.5 }}>
				{t('keyChangeWarning.body', { subject })}
			</p>
			<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
				<Sigil hash={hash} size={56} />
				<div className="settings-fingerprint">{fingerprint}</div>
			</div>
			<p className="text-sm text-secondary" style={{ margin: 0, lineHeight: 1.5 }}>
				{t('keyChangeWarning.hint')}
			</p>
			<div className="modal-actions">
				<Button type="button" variant="secondary" onClick={onCancel}>
					{t('keyChangeWarning.cancel')}
				</Button>
				<Button type="button" variant="danger" onClick={onConfirm}>
					{t('keyChangeWarning.confirm')}
				</Button>
			</div>
		</div>
	);
}
