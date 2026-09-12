import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { routes } from '../../routes';
import { IconLinkButton } from '../Button';

export function SettingsHeader() {
	const { t } = useTranslation();
	return (
		<div className="settings-header">
			<IconLinkButton to={routes.vault} label={t('editor.backToVault')}>
				<ArrowLeft size={17} />
			</IconLinkButton>
			<h1 className="text-base font-medium">{t('settings.back')}</h1>
		</div>
	);
}
