import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CommentDTO } from '../../api/docTypes';
import { useComposeTextarea } from '../../hooks/useComposeTextarea';
import { formatRelativeTime } from '../../lib/relativeTime';
import { Avatar } from '../Avatar';
import { Tooltip } from '../Tooltip';

type CommentCardEditFormProps = {
	initialBody: string;
	onSave: (body: string) => void;
	onCancel: () => void;
};

function CommentCardEditForm({ initialBody, onSave, onCancel }: Readonly<CommentCardEditFormProps>) {
	const { t } = useTranslation();
	const [draft, setDraft] = useState(initialBody);

	function commit() {
		const trimmed = draft.trim();
		if (trimmed && trimmed !== initialBody) {
			onSave(trimmed);
		} else {
			onCancel();
		}
	}

	const { textareaRef, handleKeyDown } = useComposeTextarea(draft, commit);

	return (
		<div className="comment-card__edit">
			<textarea
				ref={textareaRef}
				rows={1}
				autoFocus
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Escape') {
						onCancel();
						return;
					}
					handleKeyDown(e);
				}}
				aria-label={t('editor.commentEditLabel')}
			/>
			<div className="comment-card__edit-actions">
				<button type="button" onClick={onCancel}>
					{t('editor.commentEditCancel')}
				</button>
				<button type="button" onClick={commit}>
					{t('editor.commentEditSave')}
				</button>
			</div>
		</div>
	);
}

type CommentCardProps = {
	locale: string;
	comment: CommentDTO;
	authorName: string;
	canManage: boolean;
	isAuthor: boolean;
	onEdit: (body: string) => void;
	onResolve: () => void;
	onDeleteRequest: () => void;
};

export function CommentCard({ locale, comment, authorName, canManage, isAuthor, onEdit, onResolve, onDeleteRequest }: Readonly<CommentCardProps>) {
	const { t } = useTranslation();
	const [isEditing, setIsEditing] = useState(false);

	function handleSave(body: string) {
		onEdit(body);
		setIsEditing(false);
	}

	return (
		<div className={`comment-card${comment.resolved_at ? ' comment-card--resolved' : ''}`}>
			<div className="comment-card__head">
				<Avatar id={comment.author_id} name={authorName} size={22} decorative />
				<span className="comment-card__author">{authorName}</span>
				<Tooltip content={new Date(comment.created_at).toLocaleString(locale)}>
					<span className="comment-card__time">{formatRelativeTime(comment.created_at, locale)}</span>
				</Tooltip>
				{comment.edited_at ? <span className="comment-card__edited">{t('editor.commentEdited')}</span> : null}
			</div>
			{isEditing ? (
				<CommentCardEditForm initialBody={comment.body_ciphertext} onSave={handleSave} onCancel={() => setIsEditing(false)} />
			) : (
				<p className="comment-card__body">{comment.body_ciphertext}</p>
			)}
			{canManage && !isEditing ? (
				<div className="comment-card__actions">
					{isAuthor ? (
						<button type="button" onClick={() => setIsEditing(true)}>
							{t('editor.commentEdit')}
						</button>
					) : null}
					{comment.resolved_at ? (
						<span>{t('editor.resolved')}</span>
					) : (
						<button type="button" onClick={onResolve}>
							{t('editor.resolve')}
						</button>
					)}
					<button type="button" onClick={onDeleteRequest}>
						{t('editor.deleteComment')}
					</button>
				</div>
			) : null}
		</div>
	);
}
