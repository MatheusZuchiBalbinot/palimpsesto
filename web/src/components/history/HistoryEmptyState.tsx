import { ArrowLeft, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { routes } from '../../routes';
import { IconLinkButton } from '../Button';
import { EmptyState } from '../EmptyState';
import type { HistoryDocRef } from './historyDocRef';

export function HistoryEmptyState({ docId, displayTitle }: Readonly<HistoryDocRef>) {
	const { t } = useTranslation();
	return (
		<div className="history-page">
			<div className="editor-header">
				<IconLinkButton to={routes.document(docId)} label={t('editor.backToVault')}>
					<ArrowLeft size={17} />
				</IconLinkButton>
				<div className="editor-header__title">{displayTitle}</div>
			</div>
			<EmptyState icon={<History size={22} />} title={t('history.empty')} />
		</div>
	);
}
