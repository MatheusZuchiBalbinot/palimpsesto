import { useTranslation } from 'react-i18next';

import type { DeviceDTO } from '../../api/authTypes';
import type { DeviceListGroup } from '../../hooks/useDevices';
import { translateError } from '../../i18n/errors';
import { browserNameFromDeviceLabel } from '../../lib/deviceLabel';
import { formatRelativeTime } from '../../lib/relativeTime';
import { Button } from '../Button';

type DeviceRowProps = {
	device: DeviceDTO;
	onRequestRevoke: (device: DeviceDTO) => void;
};

function DeviceRow({ device, onRequestRevoke }: Readonly<DeviceRowProps>) {
	const { t, i18n } = useTranslation();
	return (
		<div className="settings-row">
			{/* Only the current device has a live "online" signal — the others
			 * are just "last seen at X", not something this app polls for in
			 * real time, so they get the plain (offline) dot rather than a
			 * guessed status from how recent last_active_at happens to be. */}
			<span className={`dot${device.is_current ? ' dot--success' : ''}`} aria-hidden="true" />
			<div style={{ flex: 1, minWidth: 0 }}>
				<div className="settings-row__title">
					{browserNameFromDeviceLabel(device.device_label)}
					{device.is_current ? (
						<span className="badge badge--muted" style={{ marginLeft: 8 }}>
							{t('settings.thisDevice')}
						</span>
					) : null}
				</div>
				<div className="settings-row__sub">
					{t('settings.deviceLastActive', {
						time: formatRelativeTime(device.last_active_at, i18n.language),
					})}
				</div>
			</div>
			{device.is_current ? null : (
				<Button size="sm" variant="danger" onClick={() => onRequestRevoke(device)}>
					{t('settings.deviceRevoke')}
				</Button>
			)}
		</div>
	);
}

type DevicesCardProps = DeviceListGroup & {
	onRequestRevoke: (device: DeviceDTO) => void;
	onRequestRevokeOthers: () => void;
};

export function DevicesCard({ devices, loadError, onRequestRevoke, onRequestRevokeOthers }: Readonly<DevicesCardProps>) {
	const { t } = useTranslation();
	const hasOtherDevices = (devices ?? []).some((d) => !d.is_current);
	return (
		<div className="settings-card">
			<h2 className="settings-card__section-title">{t('settings.devices')}</h2>
			{loadError ? (
				<p className="form-error" role="alert">
					{translateError(t, loadError)}
				</p>
			) : null}
			{!loadError && devices !== null && devices.length === 0 ? (
				<p className="settings-row__sub settings-row__sub--card-note">{t('settings.devicesEmpty')}</p>
			) : null}
			{devices?.map((device) => (
				<DeviceRow key={device.family_id} device={device} onRequestRevoke={onRequestRevoke} />
			))}
			{hasOtherDevices ? (
				<div className="settings-row">
					<div style={{ flex: 1 }}>
						<div className="settings-row__title">{t('settings.revokeOtherDevices')}</div>
						<div className="settings-row__sub">{t('settings.revokeOtherDevicesNote')}</div>
					</div>
					<Button size="sm" variant="danger" onClick={onRequestRevokeOthers}>
						{t('settings.revokeOtherDevicesAction')}
					</Button>
				</div>
			) : null}
			<p className="settings-row__sub settings-row__sub--card-note">{t('settings.devicesNote')}</p>
		</div>
	);
}
