import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { MemberDTO } from '../../api/docTypes';
import { toKeyChangePrompt, type ShareModalOverlayState } from '../../lib/shareModalOverlay';
import { ConfirmModalContent } from '../ConfirmModal';
import { KeyChangeWarningContent } from '../KeyChangeWarning';

// The overlay takes over the Share dialog's already-open card in place —
// Modal's own mount-time focus move doesn't fire again for this, since
// Modal itself never remounts. Without this, focus stayed on whatever
// button in the *previous* view triggered the swap (e.g. "Remover"), which
// no longer exists once the confirmation replaces it.
function useFocusOnMount<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	useEffect(() => {
		ref.current?.focus();
	}, []);
	return ref;
}

// A key-change warning or a remove confirmation can surface *while* the
// Share dialog is already open — they take over its card instead of
// stacking a second Modal on top of it. Two independent translucent
// overlays result in a broken, doubly-dimmed mess, with the first dialog's
// content bleeding through the second (discovered by actually looking at a
// screenshot, not by code review). The 26px padding matches Modal's own
// default (ShareModal renders `flush`, since its normal sharing UI defines
// its own per-section padding) — these "take over the card" states aren't
// flush, so they need that padding back.
type KeyChangeOverlayProps = {
	subject: string;
	newIdentityPub: string;
	newSigningPub: string;
	onConfirm: () => void;
	onCancel: () => void;
};

function KeyChangeOverlay(props: Readonly<KeyChangeOverlayProps>) {
	const ref = useFocusOnMount<HTMLDivElement>();
	return (
		<div ref={ref} tabIndex={-1} style={{ padding: 26 }}>
			<KeyChangeWarningContent {...props} />
		</div>
	);
}

type RemoveConfirmOverlayProps = {
	target: MemberDTO;
	isRemoving: boolean;
	onConfirm: () => void;
	onCancel: () => void;
};

function RemoveConfirmOverlay({ target, isRemoving, onConfirm, onCancel }: Readonly<RemoveConfirmOverlayProps>) {
	const { t } = useTranslation();
	const ref = useFocusOnMount<HTMLDivElement>();
	return (
		<div ref={ref} tabIndex={-1} style={{ padding: 26 }}>
			<ConfirmModalContent
				title={t('share.removeConfirmTitle')}
				body={t('share.removeConfirmBody', { name: target.display_name || target.email })}
				confirmLabel={t('share.remove_short')}
				pending={isRemoving}
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>
		</div>
	);
}

type LeaveConfirmOverlayProps = {
	isLeaving: boolean;
	onConfirm: () => void;
	onCancel: () => void;
};

function LeaveConfirmOverlay({ isLeaving, onConfirm, onCancel }: Readonly<LeaveConfirmOverlayProps>) {
	const { t } = useTranslation();
	const ref = useFocusOnMount<HTMLDivElement>();
	return (
		<div ref={ref} tabIndex={-1} style={{ padding: 26 }}>
			<ConfirmModalContent
				title={t('share.leaveConfirmTitle')}
				body={t('share.leaveConfirmBody')}
				confirmLabel={t('share.leave')}
				pending={isLeaving}
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>
		</div>
	);
}

/** Which of the "take over the whole card" states (if any) is showing
 * right now — see the doc comment on KeyChangeOverlay/RemoveConfirmOverlay
 * for why they take priority over the normal sharing view instead of
 * stacking on top of it. Renders nothing if none apply; check
 * hasShareModalOverlay first to decide whether to render this at all
 * instead of the normal body. */
export function ShareModalOverlay({
	removeTarget,
	isRemoving,
	onConfirmRemove,
	onCancelRemove,
	removeKeyChange,
	onConfirmRemoveKeyChange,
	onCancelRemoveKeyChange,
	keyChange,
	onConfirmKeyChange,
	onCancelKeyChange,
	isLeaveConfirmOpen,
	isLeaving,
	onConfirmLeave,
	onCancelLeave,
}: Readonly<ShareModalOverlayState>): ReactNode {
	if (removeTarget) {
		return <RemoveConfirmOverlay target={removeTarget} isRemoving={isRemoving} onConfirm={onConfirmRemove} onCancel={onCancelRemove} />;
	}
	if (isLeaveConfirmOpen) {
		return <LeaveConfirmOverlay isLeaving={isLeaving} onConfirm={onConfirmLeave} onCancel={onCancelLeave} />;
	}
	if (removeKeyChange) {
		return <KeyChangeOverlay {...toKeyChangePrompt(removeKeyChange)} onConfirm={onConfirmRemoveKeyChange} onCancel={onCancelRemoveKeyChange} />;
	}
	if (keyChange) {
		return <KeyChangeOverlay {...toKeyChangePrompt(keyChange)} onConfirm={onConfirmKeyChange} onCancel={onCancelKeyChange} />;
	}
	return null;
}
