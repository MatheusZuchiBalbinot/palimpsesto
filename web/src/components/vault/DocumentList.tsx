import { Inbox, Plus, RefreshCw, SearchX, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { DocumentSummaryDTO, FolderDTO, MemberDTO } from '../../api/docTypes';
import type { DocumentId, FolderId, UserId } from '../../api/ids';
import { buildMenuItems, type BuildMenuItemsParams } from '../../lib/documentMenu';
import type { LoadStatus } from '../../lib/loadStatus';
import { metaLine } from '../../lib/vaultDocuments';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { DocListSkeleton } from './DocListSkeleton';
import { DocumentHeroCard } from './DocumentHeroCard';
import { DocumentRow, type TitleState } from './DocumentRow';

type DocumentListProps = {
	status: LoadStatus;
	onRetryLoad: () => void;
	documents: DocumentSummaryDTO[];
	pinnedIds: Set<DocumentId>;
	activeUsersByDoc: Map<DocumentId, MemberDTO[]>;
	ownName: string;
	ownUserId: UserId | undefined;
	titleFor: (doc: DocumentSummaryDTO) => string;
	titleStateFor: (doc: DocumentSummaryDTO) => TitleState;
	onTogglePin: (docId: DocumentId) => void;
	onRename: (doc: DocumentSummaryDTO, title: string) => void;
	onShare: (doc: DocumentSummaryDTO) => void;
	onHistory: (doc: DocumentSummaryDTO) => void;
	onDuplicate: (doc: DocumentSummaryDTO) => void;
	onExport: (doc: DocumentSummaryDTO) => void;
	onDelete: (doc: DocumentSummaryDTO) => void;
	onNewDocument: () => void;
	searchTerm: string;
	onClearSearch: () => void;
	folders: FolderDTO[];
	onMoveToFolder: (docId: DocumentId, folderId: FolderId | null) => void;
};

function DocumentListEmptyState({ onNewDocument }: Readonly<{ onNewDocument: () => void }>) {
	const { t } = useTranslation();
	return (
		<EmptyState
			icon={<Inbox size={22} />}
			title={t('vault.emptyTitle')}
			body={t('vault.empty')}
			action={
				<Button size="sm" icon={<Plus size={15} />} onClick={onNewDocument}>
					{t('vault.newDocument')}
				</Button>
			}
		/>
	);
}

function DocumentListNoResultsState({ searchTerm, onClearSearch }: Readonly<{ searchTerm: string; onClearSearch: () => void }>) {
	const { t } = useTranslation();
	return (
		<EmptyState
			icon={<SearchX size={22} />}
			title={t('vault.searchEmptyTitle', { term: searchTerm })}
			action={
				<Button size="sm" variant="secondary" onClick={onClearSearch}>
					{t('vault.searchClear')}
				</Button>
			}
		/>
	);
}

/** Distinct from DocumentListEmptyState on purpose (UX_REVIEW.md 2.1) — a
 * failed request and a genuinely empty vault look identical without this,
 * and offering "New document" when the server is unreachable just fails a
 * second time. */
function DocumentListErrorState({ onRetryLoad }: Readonly<{ onRetryLoad: () => void }>) {
	const { t } = useTranslation();
	return (
		<EmptyState
			role="alert"
			icon={<WifiOff size={22} />}
			title={t('vault.loadErrorTitle')}
			body={t('vault.loadErrorBody')}
			action={
				<Button size="sm" icon={<RefreshCw size={15} />} onClick={onRetryLoad}>
					{t('vault.loadErrorRetry')}
				</Button>
			}
		/>
	);
}

export function DocumentList({
	status,
	onRetryLoad,
	documents,
	pinnedIds,
	activeUsersByDoc,
	ownName,
	ownUserId,
	titleFor,
	titleStateFor,
	onTogglePin,
	onRename,
	onShare,
	onHistory,
	onDuplicate,
	onExport,
	onDelete,
	onNewDocument,
	searchTerm,
	onClearSearch,
	folders,
	onMoveToFolder,
}: Readonly<DocumentListProps>) {
	const { t, i18n } = useTranslation();

	if (status === 'loading') {
		return (
			<div aria-busy="true">
				<p className="sr-only" role="status">
					{t('vault.loading')}
				</p>
				<DocListSkeleton />
			</div>
		);
	}

	if (status === 'error') {
		return <DocumentListErrorState onRetryLoad={onRetryLoad} />;
	}

	if (documents.length === 0) {
		const hasActiveSearch = searchTerm.trim() !== '';
		return hasActiveSearch ? (
			<DocumentListNoResultsState searchTerm={searchTerm} onClearSearch={onClearSearch} />
		) : (
			<DocumentListEmptyState onNewDocument={onNewDocument} />
		);
	}

	function menuItemsFor(doc: DocumentSummaryDTO) {
		const menuItemsInput: BuildMenuItemsParams = {
			t,
			isPinned: pinnedIds.has(doc.id),
			onShare: () => onShare(doc),
			onHistory: () => onHistory(doc),
			onTogglePin: () => onTogglePin(doc.id),
			onDuplicate: () => onDuplicate(doc),
			onExport: () => onExport(doc),
			onDelete: () => onDelete(doc),
			folders: doc.owner_id === ownUserId ? folders : [],
			currentFolderId: doc.folder_id,
			onMoveToFolder: (folderId) => onMoveToFolder(doc.id, folderId),
		};
		return buildMenuItems(menuItemsInput);
	}

	// The first document with someone else actively in it becomes the
	// vault's "currently editing" hero (DocumentHeroCard) — everything
	// else stays a plain row below an "Anteriores" divider.
	const heroDoc = documents.find((doc) => (activeUsersByDoc.get(doc.id) ?? []).length > 0);
	const restDocs = heroDoc ? documents.filter((doc) => doc.id !== heroDoc.id) : documents;

	return (
		<>
			{heroDoc ? (
				<DocumentHeroCard
					doc={heroDoc}
					title={titleFor(heroDoc)}
					activeUsers={activeUsersByDoc.get(heroDoc.id) ?? []}
					menuItems={menuItemsFor(heroDoc)}
					onRename={(title) => onRename(heroDoc, title)}
				/>
			) : null}
			{heroDoc && restDocs.length > 0 ? <div className="vault-section-divider">{t('vault.previous')}</div> : null}
			<ul className="doc-list">
				{restDocs.map((doc) => (
					<DocumentRow
						key={doc.id}
						doc={doc}
						title={titleFor(doc)}
						titleState={titleStateFor(doc)}
						isPinned={pinnedIds.has(doc.id)}
						isShared={doc.owner_id !== ownUserId}
						metaText={metaLine({ doc, t, locale: i18n.language, ownName })}
						activeUsers={activeUsersByDoc.get(doc.id) ?? []}
						onTogglePin={() => onTogglePin(doc.id)}
						onRename={(title) => onRename(doc, title)}
						menuItems={menuItemsFor(doc)}
					/>
				))}
			</ul>
		</>
	);
}
