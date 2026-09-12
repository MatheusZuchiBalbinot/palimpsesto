import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { toDocumentId, type CommentId } from '../api/ids';
import { getSession } from '../auth/session';
import type { CommentsPanelProps } from '../components/document/CommentsPanel';
import { DisconnectBanner } from '../components/document/DisconnectBanner';
import { DocumentPageModals, type DocumentModal } from '../components/document/DocumentPageModals';
import { EditorContent } from '../components/document/EditorContent';
import { EditorHeader } from '../components/document/EditorHeader';
import { KeyWaitScreen } from '../components/document/KeyWaitScreen';
import { SidePanel, type PanelTab } from '../components/document/SidePanel';
import { clearDEKCache } from '../crypto/documentDek';
import { useDisconnectBanner } from '../hooks/useDisconnectBanner';
import { useDisplayTitle } from '../hooks/useDisplayTitle';
import { useDocumentConnection, type UseDocumentConnectionParams } from '../hooks/useDocumentConnection';
import { useDocumentCopyActions, type UseDocumentCopyActionsParams } from '../hooks/useDocumentCopyActions';
import { useDocumentKeyRing } from '../hooks/useDocumentKeyRing';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFindInTextarea } from '../hooks/useFindInTextarea';
import { useGlobalShortcuts, type UseGlobalShortcutsParams } from '../hooks/useGlobalShortcuts';
import { useKeyConflicts, type UseKeyConflictsParams } from '../hooks/useKeyConflicts';
import { copyCurrentLink } from '../lib/clipboard';
import { syncStatusLabel, syncStatusTone } from '../lib/collaborationStatus';
import { createDocInfoActions, type CreateDocInfoActionsParams } from '../lib/documentActions';
import { createCommentActions, resolveAllComments, type CreateCommentActionsParams } from '../lib/documentComments';
import { registerPaletteActions, type PaletteAction } from '../lib/paletteActions';
import { createPeopleActions, type CreatePeopleActionsParams } from '../lib/peopleActions';
import { goToEnd, goToStart } from '../lib/textareaNavigation';
import { routes } from '../routes';

export function DocumentPage() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const { id: routeDocId } = useParams<{ id: string }>();
	// The route only ever hands this page a bare string — this is the one
	// point that trusts it as a real DocumentId, so every hook and helper
	// below it gets the branded type instead of re-trusting a raw string
	// at each of their own call sites.
	const id = routeDocId ? toDocumentId(routeDocId) : undefined;
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const session = getSession();

	const { docInfo, setDocInfo, members, comments, setComments, refreshMembers, refreshComments } = useDocumentMeta(id);
	const [isPanelOpen, setIsPanelOpen] = useState(true);
	const [panelTab, setPanelTab] = useState<PanelTab>('comments');
	// Every modal this page can show lives in this one field — see
	// DocumentModal's own comment for why that (not one boolean/nullable
	// field per modal) is what keeps "at most one open at a time" true by
	// construction rather than by convention.
	const [activeModal, setActiveModal] = useState<DocumentModal | null>(null);
	const [commentDraft, setCommentDraft] = useState('');
	const [isResolvedCommentsShown, setIsResolvedCommentsShown] = useState(false);
	const { isFindOpen, setIsFindOpen, findBar } = useFindInTextarea(textareaRef);
	const { documentKey, documentKeyRing, keyStatus, bumpKeyRefresh } = useDocumentKeyRing(id, session);

	const deleteCommentTarget = activeModal?.type === 'delete-comment' ? activeModal.commentId : null;

	function setIsShareOpen(open: boolean) {
		setActiveModal(open ? { type: 'share' } : null);
	}
	function setIsShortcutsHelpOpen(open: boolean) {
		setActiveModal(open ? { type: 'shortcuts-help' } : null);
	}
	function setIsDeleteDocumentOpen(open: boolean) {
		setActiveModal(open ? { type: 'delete-document' } : null);
	}
	function setDeleteCommentTarget(commentId: CommentId | null) {
		setActiveModal(commentId ? { type: 'delete-comment', commentId } : null);
	}

	const ownMember = members.find((m) => m.user_id === session?.user.user_id);
	const isReadOnly = ownMember?.role === 'reader';
	const unresolvedComments = useMemo(() => comments.filter((c) => !c.resolved_at), [comments]);
	const visibleComments = isResolvedCommentsShown ? comments : unresolvedComments;
	// docInfo.title_ciphertext is the encrypted transport form — this is
	// what each render actually displays.
	const displayTitle = useDisplayTitle(docInfo, documentKeyRing, t('editor.titleUndecryptable'));
	useDocumentTitle(displayTitle);

	const keyConflictsInput: UseKeyConflictsParams = { id, keyStatus, documentKey, members };
	const { keyConflicts, handleTrustKeyConflict, handleDismissKeyConflict } = useKeyConflicts(keyConflictsInput);

	const documentConnectionInput: UseDocumentConnectionParams = { id, session, documentKey, documentKeyRing, textareaRef, t };
	const { onlineUserIds, awayUserIds, typingUserIds, status, pendingCount, charCount, wordCountValue } =
		useDocumentConnection(documentConnectionInput);
	const isDisconnectBannerShown = useDisconnectBanner(status);

	const globalShortcutsInput: UseGlobalShortcutsParams = {
		id,
		navigate,
		findInputRef: findBar.findInputRef,
		setIsPanelOpen,
		setIsShortcutsHelpOpen,
		setIsFindOpen,
		setIsShareOpen,
	};
	useGlobalShortcuts(globalShortcutsInput);

	const handleCopyLink = useCallback(() => copyCurrentLink(t), [t]);

	const copyActionsInput: UseDocumentCopyActionsParams = { id, session, displayTitle, documentKeyRing, navigate, t };
	const { handleDuplicate, handleExport } = useDocumentCopyActions(copyActionsInput);

	const commentActionsInput: CreateCommentActionsParams = {
		id,
		commentDraft,
		setCommentDraft,
		setComments,
		deleteCommentTarget,
		setDeleteCommentTarget,
		refreshComments,
		t,
	};
	const { handleAddComment, handleEditComment, handleResolveComment, handleConfirmDeleteComment } = createCommentActions(commentActionsInput);

	const peopleActionsInput: CreatePeopleActionsParams = { docId: id, refreshMembers, t };
	const { handleChangeRole: handlePeopleChangeRole } = createPeopleActions(peopleActionsInput);

	const handleResolveAllComments = useCallback(
		() => resolveAllComments({ id, unresolvedComments, setComments, refreshComments, t }),
		[id, unresolvedComments, setComments, refreshComments, t],
	);

	useEffect(() => {
		if (!id) {
			return;
		}

		const paletteActions: PaletteAction[] = [
			{ id: 'share', label: t('commandPalette.share'), onRun: () => setIsShareOpen(true) },
			{ id: 'history', label: t('commandPalette.history'), onRun: () => void navigate(routes.documentHistory(id)) },
			{ id: 'copy-link', label: t('commandPalette.copyLink'), onRun: handleCopyLink },
			{ id: 'resolve-all-comments', label: t('commandPalette.resolveAllComments'), onRun: handleResolveAllComments },
			{ id: 'duplicate', label: t('vault.menu.duplicate'), onRun: () => void handleDuplicate() },
			{ id: 'export', label: t('vault.menu.export'), onRun: () => void handleExport() },
		];

		return registerPaletteActions(paletteActions);
	}, [id, t, navigate, handleCopyLink, handleResolveAllComments, handleDuplicate, handleExport]);

	const docInfoActionsInput: CreateDocInfoActionsParams = { id, documentKey, setDocInfo, navigate, t, setIsDeleteDocumentOpen };
	const { handleRename, handleConfirmDeleteDocument } = createDocInfoActions(docInfoActionsInput);

	function handleShareKeyRotated() {
		if (id) {
			clearDEKCache(id);
		}
		bumpKeyRefresh();
	}

	function handleLeaveDocument() {
		setActiveModal(null);
		void navigate(routes.vault);
	}

	// The share modal is the one case where "closed" needs a follow-up:
	// membership (roles, who's on the document) can have changed while it
	// was open, whether the caller made the change or someone else did.
	function handleCloseModal() {
		if (activeModal?.type === 'share') {
			refreshMembers();
		}

		setActiveModal(null);
	}

	// The router guarantees :id is present for this route — this is just
	// narrowing the type all the hooks above already accepted as optional,
	// not a runtime possibility this page actually needs to handle.
	if (!id) {
		return <Navigate to={routes.vault} replace />;
	}

	// Nothing can be shown or edited without the DEK. 'pending' is the
	// expected, not-broken state right after joining via invite link — some
	// existing member's client resolves this the next time they open this
	// document (see the reconciliation effect above); there's nothing this
	// account can do on its own to speed that up.
	if (keyStatus === 'pending' || keyStatus === 'error') {
		return <KeyWaitScreen keyStatus={keyStatus} />;
	}

	const commentsPanelProps: Omit<CommentsPanelProps, 'unresolvedComments'> = {
		locale: i18n.language,
		session,
		docInfo,
		members,
		visibleComments,
		isResolvedCommentsShown,
		onToggleResolvedShown: () => setIsResolvedCommentsShown((v) => !v),
		onResolveAll: handleResolveAllComments,
		commentDraft,
		onDraftChange: setCommentDraft,
		onSubmitDraft: handleAddComment,
		onEditComment: handleEditComment,
		onResolveComment: handleResolveComment,
		onDeleteCommentRequest: setDeleteCommentTarget,
	};

	return (
		<div className="editor-page">
			<EditorHeader
				docInfo={docInfo}
				documentKey={documentKey}
				displayTitle={displayTitle}
				onRename={handleRename}
				statusLabel={syncStatusLabel({ status, pendingCount, t })}
				statusTone={syncStatusTone(status, pendingCount)}
				isReadOnly={isReadOnly}
				members={members}
				onlineUserIds={onlineUserIds}
				awayUserIds={awayUserIds}
				onHistory={() => void navigate(routes.documentHistory(id))}
				onCopyLink={handleCopyLink}
				onShare={() => setIsShareOpen(true)}
				onDuplicate={() => void handleDuplicate()}
				onExport={() => void handleExport()}
				onTogglePanel={() => setIsPanelOpen((v) => !v)}
				onDelete={() => setIsDeleteDocumentOpen(true)}
				onHelp={() => setIsShortcutsHelpOpen(true)}
			/>

			{isDisconnectBannerShown ? <DisconnectBanner /> : null}

			<main id="main-content" className="editor-body">
				<EditorContent
					isFindOpen={isFindOpen}
					findBar={findBar}
					docInfo={docInfo}
					documentKey={documentKey}
					displayTitle={displayTitle}
					wordCountValue={wordCountValue}
					charCount={charCount}
					isReadOnly={isReadOnly}
					textareaRef={textareaRef}
					onGoToStart={() => goToStart(textareaRef.current)}
					onGoToEnd={() => goToEnd(textareaRef.current)}
				/>

				<SidePanel
					isPanelOpen={isPanelOpen}
					panelTab={panelTab}
					onTabChange={setPanelTab}
					unresolvedComments={unresolvedComments}
					commentsPanelProps={commentsPanelProps}
					peoplePanelProps={{
						members,
						onlineUserIds,
						awayUserIds,
						typingUserIds,
						ownUserId: session?.user.user_id,
						onInvite: () => setIsShareOpen(true),
						onChangeRole: (member, role) => void handlePeopleChangeRole(member, role),
					}}
				/>
			</main>

			<DocumentPageModals
				modal={activeModal}
				onClose={handleCloseModal}
				docInfo={docInfo}
				documentKey={documentKey}
				session={session}
				displayTitle={displayTitle}
				onShareKeyRotated={handleShareKeyRotated}
				onLeaveDocument={handleLeaveDocument}
				onConfirmDeleteDocument={handleConfirmDeleteDocument}
				onConfirmDeleteComment={handleConfirmDeleteComment}
				keyConflict={keyConflicts[0]}
				onTrustKeyConflict={(conflict) => void handleTrustKeyConflict(conflict)}
				onDismissKeyConflict={handleDismissKeyConflict}
			/>
		</div>
	);
}
