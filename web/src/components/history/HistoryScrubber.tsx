import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { VersionGroup } from '../../lib/yjsHistory';
import { SCRUBBER_TIME_FORMAT } from './constants';

type HistoryScrubberProps = {
	groups: VersionGroup[];
	selectedIndex: number;
	scrubberProgress: number;
	onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
	onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
	onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
};

export function HistoryScrubber({
	groups,
	selectedIndex,
	scrubberProgress,
	onPointerDown,
	onPointerMove,
	onKeyDown,
}: Readonly<HistoryScrubberProps>) {
	const { t, i18n } = useTranslation();
	const startLabel = groups.length > 0 ? new Date(groups[0].createdAt).toLocaleDateString(i18n.language) : '';
	const selectedGroup = groups[selectedIndex];
	const valueText = selectedGroup ? new Date(selectedGroup.createdAt).toLocaleString(i18n.language, SCRUBBER_TIME_FORMAT) : '';

	return (
		<div className="history-scrubber">
			<div className="history-scrubber__row">
				<span className="history-scrubber__label">{startLabel}</span>
				<div
					className="history-scrubber__track"
					style={{ '--progress': scrubberProgress } as CSSProperties}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onKeyDown={onKeyDown}
					role="slider"
					tabIndex={0}
					aria-label={t('history.scrubberLabel')}
					aria-valuemin={0}
					aria-valuemax={Math.max(0, groups.length - 1)}
					aria-valuenow={Math.max(0, selectedIndex)}
					aria-valuetext={valueText}
				>
					<div className="history-scrubber__track-bg" />
					<div className="history-scrubber__track-fill" />
					<div className="history-scrubber__handle" />
				</div>
				<span className="history-scrubber__label">{t('history.current')}</span>
			</div>
		</div>
	);
}
