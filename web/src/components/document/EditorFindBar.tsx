import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '../Button';

export type EditorFindBarProps = {
	findInputRef: RefObject<HTMLInputElement | null>;
	findQuery: string;
	onQueryChange: (value: string) => void;
	onFindNext: (direction: 1 | -1) => void;
	onClose: () => void;
	matchCount: number;
	matchOrdinal: number;
};

export function EditorFindBar({
	findInputRef,
	findQuery,
	onQueryChange,
	onFindNext,
	onClose,
	matchCount,
	matchOrdinal,
}: Readonly<EditorFindBarProps>) {
	const { t } = useTranslation();
	const hasQuery = findQuery !== '';
	return (
		<div className={`editor-find${hasQuery && matchCount === 0 ? ' editor-find--no-match' : ''}`}>
			<Search size={14} className="editor-find__icon" />
			<input
				ref={findInputRef}
				value={findQuery}
				onChange={(e) => onQueryChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						onFindNext(e.shiftKey ? -1 : 1);
					} else if (e.key === 'Escape') {
						onClose();
					}
				}}
				placeholder={t('editor.findPlaceholder')}
			/>
			{hasQuery ? (
				<span className="editor-find__count" role="status">
					{matchOrdinal > 0 ? t('editor.findMatchCount', { current: matchOrdinal, total: matchCount }) : t('editor.findNoResults')}
				</span>
			) : null}
			<IconButton label={t('editor.findPrevious')} onClick={() => onFindNext(-1)}>
				<ArrowUp size={14} />
			</IconButton>
			<IconButton label={t('editor.findNext')} onClick={() => onFindNext(1)}>
				<ArrowDown size={14} />
			</IconButton>
			<IconButton label={t('editor.findClose')} onClick={onClose}>
				<X size={14} />
			</IconButton>
		</div>
	);
}
