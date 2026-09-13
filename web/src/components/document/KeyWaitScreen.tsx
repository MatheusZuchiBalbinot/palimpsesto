import { ArrowLeft, Lock, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { routes } from '../../routes';
import { IconLinkButton } from '../Button';
import { EmptyState } from '../EmptyState';

type KeyWaitScreenProps = {
	keyStatus: 'pending' | 'error';
};

export function KeyWaitScreen({ keyStatus }: Readonly<KeyWaitScreenProps>) {
	const { t } = useTranslation();
	const isError = keyStatus === 'error';
	return (
		<div className="editor-page">
			<div className="editor-header">
				<IconLinkButton to={routes.vault} label={t('editor.backToVault')}>
					<ArrowLeft size={17} />
				</IconLinkButton>
			</div>
			<main id="main-content" tabIndex={-1} className="editor-key-wait">
				<EmptyState
					icon={isError ? <ShieldAlert size={22} /> : <Lock size={22} />}
					title={isError ? t('editor.keyError') : t('editor.keyPending')}
					role={isError ? 'alert' : undefined}
				/>
			</main>
		</div>
	);
}
