import { CheckCheck, MessageSquare, Send } from 'lucide-react';
import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import type { CommentDTO, DocumentDTO, MemberDTO } from '../../api/docTypes';
import type { CommentId } from '../../api/ids';
import type { Session } from '../../auth/session';
import { useComposeTextarea } from '../../hooks/useComposeTextarea';
import { canManageComment, commentAuthorName } from '../../lib/documentComments';
import { IconButton } from '../Button';
import { EmptyState } from '../EmptyState';
import { CommentCard } from './CommentCard';

type CommentsFilterRowProps = {
	unresolvedComments: CommentDTO[];
	isResolvedCommentsShown: boolean;
	onToggleResolvedShown: () => void;
	onResolveAll: () => void;
};

function CommentsFilterRow({ unresolvedComments, isResolvedCommentsShown, onToggleResolvedShown, onResolveAll }: Readonly<CommentsFilterRowProps>) {
	const { t } = useTranslation();
	return (
		<div className="side-panel__filter">
			<button type="button" onClick={onToggleResolvedShown}>
				{isResolvedCommentsShown ? t('editor.hideResolved') : t('editor.showResolved')}
			</button>
			{unresolvedComments.length > 0 ? (
				<button type="button" onClick={onResolveAll}>
					<CheckCheck size={13} />
					{t('editor.resolveAll')}
				</button>
			) : null}
		</div>
	);
}

export type CommentsPanelProps = {
	locale: string;
	session: Session | null;
	docInfo: DocumentDTO | null;
	members: MemberDTO[];
	unresolvedComments: CommentDTO[];
	visibleComments: CommentDTO[];
	isResolvedCommentsShown: boolean;
	onToggleResolvedShown: () => void;
	onResolveAll: () => void;
	commentDraft: string;
	onDraftChange: (value: string) => void;
	onSubmitDraft: () => void;
	onEditComment: (commentId: CommentId, body: string) => void;
	onResolveComment: (commentId: CommentId) => void;
	onDeleteCommentRequest: (commentId: CommentId) => void;
};

export function CommentsPanel({
	locale,
	session,
	docInfo,
	members,
	unresolvedComments,
	visibleComments,
	isResolvedCommentsShown,
	onToggleResolvedShown,
	onResolveAll,
	commentDraft,
	onDraftChange,
	onSubmitDraft,
	onEditComment,
	onResolveComment,
	onDeleteCommentRequest,
}: Readonly<CommentsPanelProps>) {
	const { t } = useTranslation();
	const { textareaRef, handleKeyDown } = useComposeTextarea(commentDraft, onSubmitDraft);
	return (
		<>
			<CommentsFilterRow
				unresolvedComments={unresolvedComments}
				isResolvedCommentsShown={isResolvedCommentsShown}
				onToggleResolvedShown={onToggleResolvedShown}
				onResolveAll={onResolveAll}
			/>
			<div className="side-panel__body" aria-live="polite">
				{visibleComments.length === 0 ? (
					<EmptyState icon={<MessageSquare size={22} />} title={t('editor.commentsEmpty')} />
				) : (
					visibleComments.map((c) => (
						<CommentCard
							key={c.id}
							locale={locale}
							comment={c}
							authorName={commentAuthorName({ authorId: c.author_id, session, members })}
							canManage={canManageComment({ comment: c, session, docInfo })}
							isAuthor={session?.user.user_id === c.author_id}
							onEdit={(body) => onEditComment(c.id, body)}
							onResolve={() => onResolveComment(c.id)}
							onDeleteRequest={() => onDeleteCommentRequest(c.id)}
						/>
					))
				)}
			</div>
			<form
				className="side-panel__compose"
				onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
					e.preventDefault();
					onSubmitDraft();
				}}
			>
				<textarea
					ref={textareaRef}
					rows={1}
					value={commentDraft}
					onChange={(e) => onDraftChange(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={t('editor.commentPlaceholder')}
					aria-label={t('editor.commentPlaceholder')}
				/>
				<IconButton type="submit" label={t('editor.commentSend')}>
					<Send size={15} />
				</IconButton>
			</form>
		</>
	);
}
