import { useTranslation } from 'react-i18next';

import { AVATAR_SIZE_HISTORY_VERSION } from '../../constants';
import { dayKey, dayLabel } from '../../lib/relativeTime';
import type { GroupDelta, VersionGroup } from '../../lib/yjsHistory';
import { Avatar } from '../Avatar';
import { SCRUBBER_TIME_FORMAT } from './constants';

type VersionDeltaProps = {
	delta: GroupDelta | undefined;
};

function VersionDelta({ delta }: Readonly<VersionDeltaProps>) {
	if (!delta || (delta.added === 0 && delta.removed === 0)) {
		return null;
	}
	return (
		<span className="version-item__delta">
			{delta.added > 0 ? <span className="version-item__delta-added">+{delta.added}</span> : null}
			{delta.removed > 0 ? <span className="version-item__delta-removed">−{delta.removed}</span> : null}
		</span>
	);
}

type HistoryVersionListProps = {
	groups: VersionGroup[];
	groupDeltas: Map<number, GroupDelta>;
	selectedId: number | null;
	currentId: number | null;
	memberName: (authorId: string) => string;
	onSelect: (updateId: number) => void;
};

export function HistoryVersionList({ groups, groupDeltas, selectedId, currentId, memberName, onSelect }: Readonly<HistoryVersionListProps>) {
	const { t, i18n } = useTranslation();
	const reversedGroups = groups.slice().reverse();

	return (
		<div className="version-list">
			<div className="version-list__header">
				<span>{t('history.versions')}</span>
				<span className="text-muted">{groups.length}</span>
			</div>
			<ul className="version-list__body">
				{reversedGroups.map((group, index) => {
					const isSelected = group.lastUpdateId === selectedId;
					const previousGroup = reversedGroups[index - 1];
					const isNewDay = !previousGroup || dayKey(group.createdAt) !== dayKey(previousGroup.createdAt);

					return (
						<li key={group.lastUpdateId}>
							{isNewDay ? <div className="version-list__day-header">{dayLabel(group.createdAt, i18n.language)}</div> : null}
							<button
								type="button"
								className={`version-item${isSelected ? ' selected' : ''}`}
								aria-current={isSelected ? 'true' : undefined}
								onClick={() => onSelect(group.lastUpdateId)}
							>
								<div className="version-item__row">
									<Avatar id={group.authorId} name={memberName(group.authorId)} size={AVATAR_SIZE_HISTORY_VERSION} decorative />
									<span className="version-item__time">{new Date(group.createdAt).toLocaleString(i18n.language, SCRUBBER_TIME_FORMAT)}</span>
									{group.lastUpdateId === currentId ? <span className="version-item__current">{t('history.current')}</span> : null}
								</div>
								<div className="version-item__meta">
									{memberName(group.authorId)}
									<VersionDelta delta={groupDeltas.get(group.lastUpdateId)} />
								</div>
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
