import { Archive, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { DocumentSummaryDTO } from '../../api/docTypes';
import { metaLine } from '../../lib/vaultDocuments';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { DocListSkeleton } from './DocListSkeleton';

type ArchivedDocumentRowProps = {
	title: string;
	metaText: string;
	onRestore: () => void;
	isRestoring: boolean;
};

function ArchivedDocumentRow({ title, metaText, onRestore, isRestoring }: Readonly<ArchivedDocumentRowProps>) {
	const { t } = useTranslation();
	return (
		<li className="doc-card doc-card--static" aria-label={title}>
			<div className="doc-card__main">
				<span className="doc-card__title">{title}</span>
				<div className="doc-card__meta">{metaText}</div>
			</div>
			<Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} disabled={isRestoring} onClick={onRestore}>
				{t('vault.restore')}
			</Button>
		</li>
	);
}

type ArchivedDocumentListProps = {
	isLoading: boolean;
	documents: DocumentSummaryDTO[];
	titleFor: (doc: DocumentSummaryDTO) => string;
	ownName: string;
	locale: string;
	onRestore: (doc: DocumentSummaryDTO) => void;
	restoringId: string | null;
};

/** The vault's "Arquivados" view — the caller's own deleted documents,
 * each restorable in place (reuses the same restore endpoint the vault
 * list's "undo delete" toast already calls). Deliberately its own small
 * component rather than reusing DocumentList/DocumentRow: an archived doc
 * has no pin, no folder, no live presence, no share/duplicate/export menu
 * — "restore" is the one thing you can do with it. */
export function ArchivedDocumentList({
	isLoading,
	documents,
	titleFor,
	ownName,
	locale,
	onRestore,
	restoringId,
}: Readonly<ArchivedDocumentListProps>) {
	const { t } = useTranslation();

	if (isLoading) {
		return (
			<div aria-busy="true">
				<p className="sr-only" role="status">
					{t('vault.loading')}
				</p>
				<DocListSkeleton />
			</div>
		);
	}

	if (documents.length === 0) {
		return <EmptyState icon={<Archive size={22} />} title={t('vault.archivedEmptyTitle')} body={t('vault.archivedEmpty')} />;
	}

	return (
		<ul className="doc-list">
			{documents.map((doc) => (
				<ArchivedDocumentRow
					key={doc.id}
					title={titleFor(doc)}
					metaText={metaLine({ doc, t, locale, ownName })}
					onRestore={() => onRestore(doc)}
					isRestoring={restoringId === doc.id}
				/>
			))}
		</ul>
	);
}
