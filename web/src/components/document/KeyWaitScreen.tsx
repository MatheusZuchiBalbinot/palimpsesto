import { ArrowLeft, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { routes } from '../../routes';
import { IconLinkButton } from '../Button';

type KeyWaitScreenProps = {
	keyStatus: 'pending' | 'error';
};

export function KeyWaitScreen({ keyStatus }: Readonly<KeyWaitScreenProps>) {
	const { t } = useTranslation();
	return (
		<div className="editor-page">
			<div className="editor-header">
				<IconLinkButton to={routes.vault} label={t('editor.backToVault')}>
					<ArrowLeft size={17} />
				</IconLinkButton>
			</div>
			<div className="editor-key-wait">
				<Lock size={22} />
				<p>{keyStatus === 'pending' ? t('editor.keyPending') : t('editor.keyError')}</p>
			</div>
		</div>
	);
}
