import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { restoreDocument } from '../api/docs';
import type { DocumentSummaryDTO } from '../api/docTypes';
import type { DocumentId, FolderId } from '../api/ids';
import { ArchivedDocumentList } from '../components/vault/ArchivedDocumentList';
import { DocumentList } from '../components/vault/DocumentList';
import type { TitleState } from '../components/vault/DocumentRow';
import { InviteList } from '../components/vault/InviteList';
import { VaultModals, type VaultModal } from '../components/vault/VaultModals';
import { VaultSidebar, type FolderManagementProps } from '../components/vault/VaultSidebar';
import { VaultToolbar } from '../components/vault/VaultToolbar';
import type { DocumentDEK } from '../crypto/documentDek';
import { tryDecryptTitle } from '../crypto/documentTitle';
import { useActiveDocumentUsers } from '../hooks/useActiveDocumentUsers';
import { useArchivedDocuments } from '../hooks/useArchivedDocuments';
import { useDocumentKeyRings } from '../hooks/useDocumentKeyRings';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFolders } from '../hooks/useFolders';
import { useInvites } from '../hooks/useInvites';
import { usePinnedDocuments } from '../hooks/usePinnedDocuments';
import { useSession } from '../hooks/useSession';
import { useVaultDocuments } from '../hooks/useVaultDocuments';
import { translateError } from '../i18n/errors';
import { createCopyActions, type CreateCopyActionsParams } from '../lib/documentCopyActions';
import { createListActions, type CreateListActionsParams } from '../lib/documentListActions';
import { registerPaletteActions, type PaletteAction } from '../lib/paletteActions';
import { rotateShareKey } from '../lib/shareKeyRotation';
import { showToast } from '../lib/toast';
import { dedupeOnlineUsers, matchesScope, resolveOwnName, sortDocuments, VAULT_SCOPE, type SortMode, type VaultScope } from '../lib/vaultDocuments';
import { routes } from '../routes';

export function DocumentsPage() {
	const { t, i18n } = useTranslation();
	useDocumentTitle(t('vault.documents'));
	const session = useSession();
	const navigate = useNavigate();
	const userId = session?.user.user_id;

	const { documents, setDocuments, status: documentsStatus, refresh } = useVaultDocuments();
	const { pinnedIds, togglePin } = usePinnedDocuments(userId);
	const activeUsersByDoc = useActiveDocumentUsers();
	const { docKeyRings, setDocKeyRings } = useDocumentKeyRings(session, documents);

	// Every modal this page can show lives in this one field — see
	// VaultModal's own comment for why that (not one nullable field per
	// modal) is what keeps "at most one open at a time" actually true.
	const [activeModal, setActiveModal] = useState<VaultModal | null>(null);
	const [sortMode, setSortMode] = useState<SortMode>('recent');
	const [search, setSearch] = useState('');
	const [scope, setScope] = useState<VaultScope>(VAULT_SCOPE.ALL);
	const [selectedFolderId, setSelectedFolderId] = useState<FolderId | null>(null);
	const { folders, handleCreateFolder, handleUpdateFolder, handleDeleteFolder, handleMoveToFolder } = useFolders({ t, onDocumentMoved: refresh });

	const deleteTarget = activeModal?.type === 'delete-document' ? activeModal.doc : null;
	const deleteFolderTarget = activeModal?.type === 'delete-folder' ? activeModal.folder : null;

	function handleOpenDeleteFolder(folderId: FolderId) {
		const folder = folders.find((f) => f.id === folderId) ?? null;
		setActiveModal(folder ? { type: 'delete-folder', folder } : null);
	}

	function handleConfirmDeleteFolder() {
		if (!deleteFolderTarget) {
			return;
		}
		if (selectedFolderId === deleteFolderTarget.id) {
			setSelectedFolderId(null);
		}
		handleDeleteFolder(deleteFolderTarget.id);
		setActiveModal(null);
	}

	function handleScopeChange(nextScope: VaultScope) {
		setScope(nextScope);
		setSelectedFolderId(null);
	}

	function handleKeyRotated(docId: DocumentId) {
		if (!userId) {
			return;
		}
		void rotateShareKey(docId, userId, setDocKeyRings);
	}

	function handleLeftDocument() {
		setActiveModal(null);
		refresh();
	}

	const isArchivedView = scope === VAULT_SCOPE.ARCHIVED;
	const { documents: archivedDocuments, isLoading: isArchivedLoading, refresh: refreshArchived } = useArchivedDocuments(isArchivedView);
	const { docKeyRings: archivedKeyRings } = useDocumentKeyRings(session, archivedDocuments);
	const [restoringId, setRestoringId] = useState<string | null>(null);

	const isInvitesView = scope === VAULT_SCOPE.INVITES;
	// Always active, not just while isInvitesView — the sidebar badge needs
	// the count regardless of which tab is currently open.
	const { invites, isLoading: isInvitesLoading, respondingId, onAccept, onDecline } = useInvites(true, t, refresh);

	useEffect(() => {
		const paletteActions: PaletteAction[] = [
			{ id: 'new-document', label: t('commandPalette.newDocument'), onRun: () => setActiveModal({ type: 'new-document' }) },
		];
		return registerPaletteActions(paletteActions);
	}, [t]);

	const ownName = resolveOwnName(session);

	const titleForUsing = useCallback(
		(keyRings: Map<DocumentId, DocumentDEK[]>, doc: DocumentSummaryDTO): string => {
			const ring = keyRings.get(doc.id);
			if (!ring) {
				return t('vault.titlePending');
			}
			return tryDecryptTitle(ring, doc.id, doc.title_ciphertext) ?? t('vault.titlePending');
		},
		[t],
	);

	const titleFor = useCallback((doc: DocumentSummaryDTO): string => titleForUsing(docKeyRings, doc), [docKeyRings, titleForUsing]);

	// Split from titleFor's placeholder text (UX_REVIEW.md 2.3) — "the
	// key ring hasn't arrived yet" (resolves on its own, shown as a
	// skeleton) and "decryption actually failed" (won't resolve by
	// waiting, shown as an error) look the same in titleFor's string but
	// need different treatment in the row.
	const titleStateFor = useCallback(
		(doc: DocumentSummaryDTO): TitleState => {
			const ring = docKeyRings.get(doc.id);
			if (!ring) {
				return 'loading';
			}
			return tryDecryptTitle(ring, doc.id, doc.title_ciphertext) === null ? 'error' : 'ready';
		},
		[docKeyRings],
	);

	const archivedTitleFor = useCallback((doc: DocumentSummaryDTO): string => titleForUsing(archivedKeyRings, doc), [archivedKeyRings, titleForUsing]);

	async function handleRestore(doc: DocumentSummaryDTO) {
		setRestoringId(doc.id);
		try {
			await restoreDocument(doc.id);
			refreshArchived();
		} catch (e) {
			showToast(translateError(t, e), 'error');
		} finally {
			setRestoringId(null);
		}
	}

	const filteredArchivedDocuments = useMemo(
		() => archivedDocuments.filter((d) => archivedTitleFor(d).toLowerCase().includes(search.toLowerCase())),
		[archivedDocuments, search, archivedTitleFor],
	);

	const onlineUsers = useMemo(() => dedupeOnlineUsers(activeUsersByDoc, userId), [activeUsersByDoc, userId]);

	const orderedDocuments = useMemo(() => {
		function matchesCurrentView(doc: DocumentSummaryDTO): boolean {
			const isInSelectedScope = selectedFolderId === null ? matchesScope(doc, scope, userId) : doc.folder_id === selectedFolderId;
			const matchesSearch = titleFor(doc).toLowerCase().includes(search.toLowerCase());
			return isInSelectedScope && matchesSearch;
		}

		const filtered = documents.filter(matchesCurrentView);
		const pinned = sortDocuments(
			filtered.filter((d) => pinnedIds.has(d.id)),
			titleFor,
			sortMode,
		);
		const rest = sortDocuments(
			filtered.filter((d) => !pinnedIds.has(d.id)),
			titleFor,
			sortMode,
		);
		return [...pinned, ...rest];
	}, [documents, scope, selectedFolderId, userId, search, sortMode, pinnedIds, titleFor]);

	const listActionsInput: CreateListActionsParams = {
		docKeyRings,
		setDocuments,
		refresh,
		t,
		deleteTarget,
		setDeleteTarget: (doc) => setActiveModal(doc ? { type: 'delete-document', doc } : null),
		setSortMode,
	};
	const { handleRename, handleConfirmDelete, handleCycleSort } = createListActions(listActionsInput);

	const copyActionsInput: CreateCopyActionsParams = { session, docKeyRings, titleFor, refresh, navigate, t };
	const { handleDuplicate, handleExport } = createCopyActions(copyActionsInput);

	function resolveBodyHeader(): { title: string; count: number } {
		if (isArchivedView) {
			return { title: t('vault.archived'), count: filteredArchivedDocuments.length };
		}
		if (isInvitesView) {
			return { title: t('vault.invites'), count: invites.length };
		}
		return { title: t('vault.documents'), count: orderedDocuments.length };
	}
	const { title: bodyTitle, count: bodyCount } = resolveBodyHeader();

	const folderManagement: FolderManagementProps = {
		folders,
		selectedFolderId,
		onFolderSelect: setSelectedFolderId,
		onOpenCreateFolder: () => setActiveModal({ type: 'folder', mode: 'create' }),
		onOpenEditFolder: (folder) => setActiveModal({ type: 'folder', mode: folder }),
		onDeleteFolder: handleOpenDeleteFolder,
	};

	return (
		<div className="vault">
			<VaultSidebar
				ownName={ownName}
				userId={userId ?? ''}
				scope={scope}
				onScopeChange={handleScopeChange}
				{...folderManagement}
				onlineUsers={onlineUsers}
				onNewDocument={() => setActiveModal({ type: 'new-document' })}
				onProfileClick={() => void navigate(routes.settings)}
				pendingInvitesCount={invites.length}
			/>

			<main id="main-content" tabIndex={-1} className="vault-main">
				<VaultToolbar search={search} onSearchChange={setSearch} sortMode={sortMode} onCycleSort={handleCycleSort} />

				<div className="vault-body">
					<div className="vault-body__header">
						<h1 className="text-xl">{bodyTitle}</h1>
						<span className="vault-body__count">{t('vault.documentsCount', { count: bodyCount })}</span>
					</div>

					{isArchivedView ? (
						<ArchivedDocumentList
							isLoading={isArchivedLoading}
							documents={filteredArchivedDocuments}
							titleFor={archivedTitleFor}
							ownName={ownName}
							locale={i18n.language}
							onRestore={(doc) => void handleRestore(doc)}
							restoringId={restoringId}
						/>
					) : null}
					{isInvitesView ? (
						<InviteList
							isLoading={isInvitesLoading}
							invites={invites}
							locale={i18n.language}
							respondingId={respondingId}
							onAccept={onAccept}
							onDecline={onDecline}
						/>
					) : null}
					{!isArchivedView && !isInvitesView ? (
						<DocumentList
							status={documentsStatus}
							onRetryLoad={refresh}
							documents={orderedDocuments}
							pinnedIds={pinnedIds}
							activeUsersByDoc={activeUsersByDoc}
							ownName={ownName}
							ownUserId={userId}
							titleFor={titleFor}
							titleStateFor={titleStateFor}
							onTogglePin={togglePin}
							onRename={handleRename}
							onShare={(doc) => setActiveModal({ type: 'share', doc })}
							onHistory={(doc) => void navigate(routes.documentHistory(doc.id))}
							onDuplicate={(doc) => void handleDuplicate(doc)}
							onExport={(doc) => void handleExport(doc)}
							onDelete={(doc) => setActiveModal({ type: 'delete-document', doc })}
							onNewDocument={() => setActiveModal({ type: 'new-document' })}
							searchTerm={search}
							onClearSearch={() => setSearch('')}
							folders={folders}
							onMoveToFolder={handleMoveToFolder}
						/>
					) : null}
				</div>
			</main>

			<VaultModals
				modal={activeModal}
				onClose={() => setActiveModal(null)}
				onCreated={(id) => void navigate(routes.document(id))}
				docKeyRings={docKeyRings}
				userId={userId}
				titleFor={titleFor}
				onKeyRotated={handleKeyRotated}
				onLeftDocument={handleLeftDocument}
				onConfirmDelete={handleConfirmDelete}
				onCreateFolder={handleCreateFolder}
				onUpdateFolder={handleUpdateFolder}
				onConfirmDeleteFolder={handleConfirmDeleteFolder}
			/>
		</div>
	);
}
