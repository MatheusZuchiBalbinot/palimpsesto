import { useId, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { CommentDTO } from '../../api/docTypes';
import { CommentsPanel, type CommentsPanelProps } from './CommentsPanel';
import { PeoplePanel, type PeoplePanelProps } from './PeoplePanel';

export type PanelTab = 'comments' | 'people';
const PANEL_TABS: PanelTab[] = ['comments', 'people'];

type SidePanelProps = {
	isPanelOpen: boolean;
	panelTab: PanelTab;
	onTabChange: (tab: PanelTab) => void;
	unresolvedComments: CommentDTO[];
	commentsPanelProps: Omit<CommentsPanelProps, 'unresolvedComments'>;
	peoplePanelProps: PeoplePanelProps;
};

export function SidePanel({
	isPanelOpen,
	panelTab,
	onTabChange,
	unresolvedComments,
	commentsPanelProps,
	peoplePanelProps,
}: Readonly<SidePanelProps>) {
	const { t } = useTranslation();
	const baseId = useId();
	const tabId = (tab: PanelTab) => `${baseId}-tab-${tab}`;
	const panelId = (tab: PanelTab) => `${baseId}-panel-${tab}`;

	function handleTabsKeyDown(e: ReactKeyboardEvent) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
			return;
		}
		e.preventDefault();
		const currentIndex = PANEL_TABS.indexOf(panelTab);
		const delta = e.key === 'ArrowRight' ? 1 : -1;
		const nextTab = PANEL_TABS[(currentIndex + delta + PANEL_TABS.length) % PANEL_TABS.length];
		onTabChange(nextTab);
		document.getElementById(tabId(nextTab))?.focus();
	}

	return (
		<div className={`side-panel${isPanelOpen ? '' : ' side-panel--collapsed'}`}>
			<div className="side-panel__tabs" role="tablist" aria-label={t('editor.sidePanelTabs')} onKeyDown={handleTabsKeyDown}>
				<button
					type="button"
					id={tabId('comments')}
					role="tab"
					aria-selected={panelTab === 'comments'}
					aria-controls={panelId('comments')}
					tabIndex={panelTab === 'comments' ? 0 : -1}
					className={`side-panel__tab${panelTab === 'comments' ? ' active' : ''}`}
					onClick={() => onTabChange('comments')}
				>
					{t('editor.comments')}
					{unresolvedComments.length > 0 ? (
						<span className="badge badge--count side-panel__tab-badge">
							<span aria-hidden="true">{unresolvedComments.length}</span>
							<span className="sr-only">{t('editor.unresolvedCount', { count: unresolvedComments.length })}</span>
						</span>
					) : null}
				</button>
				<button
					type="button"
					id={tabId('people')}
					role="tab"
					aria-selected={panelTab === 'people'}
					aria-controls={panelId('people')}
					tabIndex={panelTab === 'people' ? 0 : -1}
					className={`side-panel__tab${panelTab === 'people' ? ' active' : ''}`}
					onClick={() => onTabChange('people')}
				>
					{t('editor.people')}
				</button>
			</div>

			{panelTab === 'comments' ? (
				<div id={panelId('comments')} role="tabpanel" aria-labelledby={tabId('comments')}>
					<CommentsPanel unresolvedComments={unresolvedComments} {...commentsPanelProps} />
				</div>
			) : (
				<div id={panelId('people')} role="tabpanel" aria-labelledby={tabId('people')}>
					<PeoplePanel {...peoplePanelProps} />
				</div>
			)}
		</div>
	);
}
