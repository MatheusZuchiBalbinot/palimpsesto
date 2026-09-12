import { ArrowDown, ArrowUp } from 'lucide-react';
import { useId, type RefObject } from 'react';
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
	wordCountValue: number;
	charCount: number;
	isReadOnly: boolean;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	onGoToStart: () => void;
	onGoToEnd: () => void;
};

export function EditorContent({
	isFindOpen,
	findBar,
	docInfo,
	documentKey,
	displayTitle,
	wordCountValue,
	charCount,
	isReadOnly,
	textareaRef,
	onGoToStart,
	onGoToEnd,
}: Readonly<EditorContentProps>) {
	const { t } = useTranslation();
	const titleId = useId();
	const statsId = useId();
	const hasTitle = docInfo && documentKey;
	return (
		<div className="editor-content">
			{isFindOpen ? <EditorFindBar {...findBar} /> : null}

			<div className="editor-content__page paper-stack">
				{hasTitle ? <h1 id={titleId}>{displayTitle}</h1> : null}
				<p className="editor-content__meta" id={statsId}>
					{t('editor.draftStats', { words: wordCountValue, chars: charCount })}
				</p>
				<textarea
					ref={textareaRef}
					className="editor-textarea"
					placeholder={t('editor.editorPlaceholder')}
					aria-label={hasTitle ? undefined : t('editor.editorPlaceholder')}
					aria-labelledby={hasTitle ? titleId : undefined}
					aria-describedby={statsId}
					readOnly={isReadOnly}
				/>
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
	);
}
