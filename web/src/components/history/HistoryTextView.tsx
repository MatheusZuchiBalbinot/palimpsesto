import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import type { HistoryHighlight } from '../../hooks/useHistoryHighlight';
import { cursorColorForId, rgbString } from '../../lib/presenceColor';

type HistoryTextViewProps = {
	title: string | null;
	text: string;
	highlight: HistoryHighlight | null;
	memberName: (authorId: string) => string;
};

export function HistoryTextView({ title, text, highlight, memberName }: Readonly<HistoryTextViewProps>) {
	const { t } = useTranslation();
	const highlightAuthorName = highlight ? memberName(highlight.authorId) : null;
	return (
		<div className="history-content__page paper-stack">
			{title ? <h1>{title}</h1> : null}
			<p style={{ whiteSpace: 'pre-wrap' }}>
				{highlight && highlightAuthorName ? (
					<>
						{text.slice(0, highlight.start)}
						<mark
							className="history-highlight"
							title={t('history.changedBy', { name: highlightAuthorName })}
							style={
								{
									'--highlight-color': rgbString(cursorColorForId(highlight.authorId)),
								} as CSSProperties
							}
						>
							{text.slice(highlight.start, highlight.end)}
						</mark>
						{text.slice(highlight.end)}
					</>
				) : (
					text
				)}
			</p>
			<p className="sr-only" role="status">
				{highlightAuthorName ? t('history.changeAnnounce', { name: highlightAuthorName }) : ''}
			</p>
		</div>
	);
}
