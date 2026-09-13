import { ArrowDown, ArrowUp } from 'lucide-react';
import { type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import type { DocumentDTO } from '../../api/docTypes';
import type { DocumentDEK } from '../../crypto/documentDek';
import { IconButton } from '../Button';
import { EditorFindBar, type EditorFindBarProps } from './EditorFindBar';

type EditorContentProps = {
	isFindOpen: boolean;
	findBar: EditorFindBarProps;
	docInfo: DocumentDTO | null;
	documentKey: DocumentDEK | null;
	displayTitle: string;
	titleId: string;
	statsId: string;
	wordCountValue: number;
	charCount: number;
	containerRef: RefObject<HTMLDivElement | null>;
	onGoToStart: () => void;
	onGoToEnd: () => void;
};

export function EditorContent({
	isFindOpen,
	findBar,
	docInfo,
	documentKey,
	displayTitle,
	titleId,
	statsId,
	wordCountValue,
	charCount,
	containerRef,
	onGoToStart,
	onGoToEnd,
}: Readonly<EditorContentProps>) {
	const { t } = useTranslation();
	const hasTitle = docInfo && documentKey;
	return (
		<div className="editor-content">
			{isFindOpen ? <EditorFindBar {...findBar} /> : null}

			<div className="editor-content__scroll">
				<div className="editor-content__page paper-stack">
					{hasTitle ? <h1 id={titleId}>{displayTitle}</h1> : null}
					<p className="editor-content__meta" id={statsId}>
						{t('editor.draftStats', { words: wordCountValue, chars: charCount })}
					</p>
					<div className="editor-content__divider" role="presentation" />
					<div ref={containerRef} className="editor-codemirror" />
				</div>

				<div className="editor-jump">
					<IconButton label={t('editor.goToStart')} onClick={onGoToStart}>
						<ArrowUp size={15} />
					</IconButton>
					<IconButton label={t('editor.goToEnd')} onClick={onGoToEnd}>
						<ArrowDown size={15} />
					</IconButton>
				</div>
			</div>
		</div>
	);
}
