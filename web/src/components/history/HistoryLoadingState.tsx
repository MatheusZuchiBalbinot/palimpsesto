import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { routes } from '../../routes';
import { IconLinkButton } from '../Button';
import type { HistoryDocRef } from './historyDocRef';

export function HistoryLoadingState({ docId, displayTitle }: Readonly<HistoryDocRef>) {
	const { t } = useTranslation();
	return (
		<div className="history-page">
			<div className="editor-header">
				<IconLinkButton to={routes.document(docId)} label={t('editor.backToVault')}>
					<ArrowLeft size={17} />
				</IconLinkButton>
				<div className="editor-header__title">{displayTitle}</div>
			</div>
			<p className="settings-row__sub" role="status" style={{ padding: 40 }}>
				{t('history.loading')}
			</p>
		</div>
	);
}
