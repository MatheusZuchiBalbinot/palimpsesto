import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Session } from '../../auth/session';
import { useAutoLock } from '../../hooks/useAutoLock';
import { exportAllDocuments } from '../../lib/exportAllDocuments';
import { Button } from '../Button';

type SecurityCardProps = {
	session: Session | null;
	onChangePassword: () => void;
};

export function SecurityCard({ session, onChangePassword }: Readonly<SecurityCardProps>) {
	const { t } = useTranslation();
	const [isExporting, setIsExporting] = useState(false);
	const { isEnabled: isAutoLockEnabled, setEnabled: setAutoLockEnabled } = useAutoLock();

	async function handleExportAll() {
		if (!session) {
			return;
		}
		setIsExporting(true);
		try {
			await exportAllDocuments(session, t);
		} finally {
			setIsExporting(false);
		}
	}

	return (
		<div className="settings-card">
			<h2 className="settings-card__section-title">{t('settings.security')}</h2>
			<div className="settings-row">
				<div style={{ flex: 1 }}>
					<div className="settings-row__title">{t('settings.changePhrase')}</div>
					<div className="settings-row__sub">{t('settings.changePhraseNote')}</div>
				</div>
				<Button size="sm" variant="secondary" onClick={onChangePassword}>
					{t('settings.change')}
				</Button>
			</div>
			<div className="settings-row">
				<div style={{ flex: 1 }}>
					<div className="settings-row__title">{t('settings.exportAll')}</div>
					<div className="settings-row__sub">{t('settings.exportAllNote')}</div>
				</div>
				<Button size="sm" variant="secondary" disabled={isExporting} onClick={() => void handleExportAll()}>
					{isExporting ? t('settings.exportAllPending') : t('settings.exportAllAction')}
				</Button>
			</div>
			<div className="settings-row">
				<div style={{ flex: 1 }}>
					<div className="settings-row__title">{t('settings.autoLock')}</div>
					<div className="settings-row__sub">{t('settings.autoLockValue')}</div>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={isAutoLockEnabled}
					aria-label={t('settings.autoLock')}
					className={`settings-toggle ${isAutoLockEnabled ? 'on' : 'off'}`}
					onClick={() => setAutoLockEnabled(!isAutoLockEnabled)}
				>
					<span />
				</button>
			</div>
		</div>
	);
}
