import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listDevices, revokeDevice } from '../api/auth';
import type { DeviceDTO } from '../api/authTypes';
import { translateError } from '../i18n/errors';
import { showToast } from '../lib/toast';

export type DeviceListGroup = {
	devices: DeviceDTO[] | null;
	loadError: unknown;
};

export type DeviceRevokeGroup = {
	target: DeviceDTO | null;
	isPending: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	onRequest: (device: DeviceDTO) => void;
};

export type DeviceRevokeOthersGroup = {
	isConfirmOpen: boolean;
	isPending: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	onRequest: () => void;
};

/** The device list plus the revoke-confirmation flow on top of it —
 * separated so SettingsPage itself doesn't carry the four useStates/the
 * effect directly. Returns three grouped sub-objects (list/revoke/
 * revokeOthers) instead of ten flat fields — SettingsPage used to
 * destructure all ten just to relist them individually as props for
 * DevicesCard/SettingsModals. */
export function useDevices() {
	const { t } = useTranslation();
	const [devices, setDevices] = useState<DeviceDTO[] | null>(null);
	const [loadError, setLoadError] = useState<unknown>(null);
	const [revokeTarget, setRevokeTarget] = useState<DeviceDTO | null>(null);
	const [isRevoking, setIsRevoking] = useState(false);

	const refreshDevices = useCallback(() => {
		listDevices()
			.then((next) => {
				setDevices(next);
				setLoadError(null);
			})
			.catch(setLoadError);
	}, []);

	useEffect(() => {
		refreshDevices();
	}, [refreshDevices]);

	async function handleRevokeDevice() {
		if (!revokeTarget) {
			return;
		}
		setIsRevoking(true);
		try {
			await revokeDevice(revokeTarget.family_id);
			setRevokeTarget(null);
			refreshDevices();
		} catch (e) {
			showToast(translateError(t, e), 'error');
		} finally {
			setIsRevoking(false);
		}
	}

	const [isRevokeOthersConfirmOpen, setIsRevokeOthersConfirmOpen] = useState(false);
	const [isRevokingOthers, setIsRevokingOthers] = useState(false);
	async function handleRevokeOtherDevices() {
		const others = (devices ?? []).filter((d) => !d.is_current);
		setIsRevokingOthers(true);
		try {
			await Promise.all(others.map((d) => revokeDevice(d.family_id)));
			setIsRevokeOthersConfirmOpen(false);
			refreshDevices();
		} catch (e) {
			showToast(translateError(t, e), 'error');
		} finally {
			setIsRevokingOthers(false);
		}
	}

	const list: DeviceListGroup = { devices, loadError };

	const revoke: DeviceRevokeGroup = {
		target: revokeTarget,
		isPending: isRevoking,
		onConfirm: () => void handleRevokeDevice(),
		onCancel: () => setRevokeTarget(null),
		onRequest: setRevokeTarget,
	};

	const revokeOthers: DeviceRevokeOthersGroup = {
		isConfirmOpen: isRevokeOthersConfirmOpen,
		isPending: isRevokingOthers,
		onConfirm: () => void handleRevokeOtherDevices(),
		onCancel: () => setIsRevokeOthersConfirmOpen(false),
		onRequest: () => setIsRevokeOthersConfirmOpen(true),
	};

	return { list, revoke, revokeOthers };
}
