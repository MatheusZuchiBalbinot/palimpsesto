import { forwardRef, useImperativeHandle, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip } from './Tooltip';

type DocumentTitleProps = {
	title: string;
	onRename: (title: string) => void;
	viewClassName?: string;
	editClassName?: string;
	/** Overrides for callers reusing this "click text to edit it inline"
	 * pattern for something other than a document title (e.g. a profile
	 * display name) — default to the document-title wording. */
	renameLabel?: string;
	editLabel?: string;
};

/** Lets a caller that also offers a "Rename" menu item (the vault list's
 * "⋯" menu) trigger the exact same inline edit this component already
 * does on click, instead of duplicating the editing UI. */
export type DocumentTitleHandle = {
	startEditing: () => void;
};

/** Click the title to edit it inline; Enter or blur commits, Escape cancels. */
export const DocumentTitle = forwardRef<DocumentTitleHandle, DocumentTitleProps>(function DocumentTitle(
	{ title, onRename, viewClassName = 'editor-header__title', editClassName = 'editor-header__title-input', renameLabel, editLabel },
	ref,
) {
	const { t } = useTranslation();
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(title);

	function startEditing() {
		setDraft(title);
		setIsEditing(true);
	}

	useImperativeHandle(ref, () => ({ startEditing }));

	function commit() {
		setIsEditing(false);
		const trimmed = draft.trim();
		if (trimmed && trimmed !== title) {
			onRename(trimmed);
		}
	}

	function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
		if (e.key === 'Enter') {
			e.currentTarget.blur();
		}
		if (e.key === 'Escape') {
			setDraft(title);
			setIsEditing(false);
		}
	}

	if (!isEditing) {
		const label = renameLabel ?? t('documentTitle.renameLabel', { title });
		return (
			<Tooltip content={label}>
				<button
					type="button"
					className={viewClassName}
					style={{
						background: 'none',
						border: 'none',
						padding: 0,
						textAlign: 'left',
						cursor: 'text',
					}}
					onClick={startEditing}
					aria-label={label}
				>
					{title}
				</button>
			</Tooltip>
		);
	}

	return (
		<input
			className={editClassName}
			value={draft}
			autoFocus
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={handleKeyDown}
			aria-label={editLabel ?? t('documentTitle.editLabel')}
		/>
	);
});
