import { useTranslation } from 'react-i18next';

import type { DeviceRevokeGroup, DeviceRevokeOthersGroup } from '../../hooks/useDevices';
import { browserNameFromDeviceLabel } from '../../lib/deviceLabel';
import { ChangePasswordModal } from '../ChangePasswordModal';
import { ConfirmModal } from '../ConfirmModal';

type SettingsModalsProps = {
	isChangePasswordOpen: boolean;
	sessionEmail: string | undefined;
	onCloseChangePassword: () => void;
	revoke: DeviceRevokeGroup;
	revokeOthers: DeviceRevokeOthersGroup;
};

export function SettingsModals({ isChangePasswordOpen, sessionEmail, onCloseChangePassword, revoke, revokeOthers }: Readonly<SettingsModalsProps>) {
	const { t } = useTranslation();
	return (
		<>
			{isChangePasswordOpen && sessionEmail ? <ChangePasswordModal email={sessionEmail} onClose={onCloseChangePassword} /> : null}

			{revoke.target ? (
				<ConfirmModal
					title={t('settings.deviceRevokeConfirmTitle')}
					body={t('settings.deviceRevokeConfirmBody', {
						name: browserNameFromDeviceLabel(revoke.target.device_label),
					})}
					confirmLabel={t('settings.deviceRevoke')}
					pending={revoke.isPending}
					onConfirm={revoke.onConfirm}
					onClose={revoke.onCancel}
				/>
			) : null}

			{revokeOthers.isConfirmOpen ? (
				<ConfirmModal
					title={t('settings.revokeOtherDevicesConfirmTitle')}
					body={t('settings.revokeOtherDevicesConfirmBody')}
					confirmLabel={t('settings.revokeOtherDevices')}
					pending={revokeOthers.isPending}
					onConfirm={revokeOthers.onConfirm}
					onClose={revokeOthers.onCancel}
				/>
			) : null}
		</>
	);
}
