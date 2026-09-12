import { ArrowLeft, Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { UpdateItemDTO } from '../../api/docTypes';
import { PLAYBACK_SPEEDS } from '../../hooks/useHistoryPlayback';
import type { VersionGroup } from '../../lib/yjsHistory';
import { routes } from '../../routes';
import { Button, IconButton, IconLinkButton, LinkButton } from '../Button';
import type { HistoryDocRef } from './historyDocRef';

export type HistoryPlaybackControlsProps = {
	isPlaying: boolean;
	speedIndex: number;
	onTogglePlay: () => void;
	onCycleSpeed: () => void;
};

function HistoryPlaybackControls({ isPlaying, speedIndex, onTogglePlay, onCycleSpeed }: Readonly<HistoryPlaybackControlsProps>) {
	const { t } = useTranslation();
	return (
		<>
			<IconButton label={t(isPlaying ? 'history.pause' : 'history.play')} onClick={onTogglePlay}>
				{isPlaying ? <Pause size={15} /> : <Play size={15} />}
			</IconButton>
			<button type="button" className="history-speed" onClick={onCycleSpeed} title={t('history.speed')}>
				{PLAYBACK_SPEEDS[speedIndex]}x
			</button>
		</>
	);
}

type HistoryHeaderProps = HistoryDocRef & {
	isCurrent: boolean;
	updates: UpdateItemDTO[];
	selectedId: number | null;
	groups: VersionGroup[];
	isPlaying: boolean;
	speedIndex: number;
	onTogglePlay: () => void;
	onCycleSpeed: () => void;
	onRestore: () => void;
};

export function HistoryHeader({
	docId,
	displayTitle,
	isCurrent,
	updates,
	selectedId,
	groups,
	isPlaying,
	speedIndex,
	onTogglePlay,
	onCycleSpeed,
	onRestore,
}: Readonly<HistoryHeaderProps>) {
	const { t, i18n } = useTranslation();
	const selectedUpdate = updates.find((u) => u.id === selectedId);
	const statusText = isCurrent
		? t('history.current')
		: t('history.viewing', {
				date: selectedUpdate ? new Date(selectedUpdate.created_at).toLocaleString(i18n.language) : '',
			});

	return (
		<div className="editor-header">
			<IconLinkButton to={routes.document(docId)} label={t('editor.backToVault')}>
				<ArrowLeft size={17} />
			</IconLinkButton>
			<div className="leading-tight">
				<div className="editor-header__title">{displayTitle}</div>
				<div className="editor-header__status">{statusText}</div>
			</div>
			<div className="editor-header__spacer">
				{groups.length > 1 ? (
					<HistoryPlaybackControls isPlaying={isPlaying} speedIndex={speedIndex} onTogglePlay={onTogglePlay} onCycleSpeed={onCycleSpeed} />
				) : null}
				{isCurrent ? null : (
					<LinkButton to={routes.document(docId)} variant="ghost" size="sm">
						{t('history.backToCurrent')}
					</LinkButton>
				)}
				<Button size="sm" onClick={onRestore} disabled={isCurrent}>
					{t('history.restore')}
				</Button>
			</div>
		</div>
	);
}
