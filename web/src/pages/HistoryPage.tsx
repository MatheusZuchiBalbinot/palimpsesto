import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { toDocumentId } from '../api/ids';
import { getSession } from '../auth/session';
import type { HistoryDocRef } from '../components/history/historyDocRef';
import { HistoryEmptyState } from '../components/history/HistoryEmptyState';
import { HistoryHeader } from '../components/history/HistoryHeader';
import { HistoryLoadingState } from '../components/history/HistoryLoadingState';
import { HistoryScrubber } from '../components/history/HistoryScrubber';
import { HistoryTextView } from '../components/history/HistoryTextView';
import { HistoryVersionList } from '../components/history/HistoryVersionList';
import { RestoreModal } from '../components/RestoreModal';
import { useDisplayTitle } from '../hooks/useDisplayTitle';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useGroupDeltas, type UseGroupDeltasParams } from '../hooks/useGroupDeltas';
import { useHistoryDocument } from '../hooks/useHistoryDocument';
import { useHistoryHighlight } from '../hooks/useHistoryHighlight';
import { useHistoryPlayback } from '../hooks/useHistoryPlayback';
import { useReconstructedText, type UseReconstructedTextParams } from '../hooks/useReconstructedText';
import { useScrubberControls } from '../hooks/useScrubberControls';
import { restoreHistoryText, type RestoreHistoryTextParams } from '../lib/historyRestore';
import { shortId } from '../lib/shortId';
import { groupUpdates } from '../lib/yjsHistory';
import { routes } from '../routes';

export function HistoryPage() {
	const navigate = useNavigate();
	const { id: routeDocId } = useParams<{ id: string }>();
	const id = routeDocId ? toDocumentId(routeDocId) : undefined;
	const session = getSession();

	const [isRestoreOpen, setIsRestoreOpen] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);

	const { docInfo, members, updates, isLoading, selectedId, setSelectedId, documentKeyRing, authorSigningKeys, snapshotPlaintext } =
		useHistoryDocument(id, session);

	const groups = useMemo(() => groupUpdates(updates), [updates]);
	const groupDeltasInput: UseGroupDeltasParams = { updates, groups, docId: id, documentKeyRing, authorSigningKeys, snapshotPlaintext };
	const groupDeltas = useGroupDeltas(groupDeltasInput);
	const currentId = updates.length > 0 ? updates[updates.length - 1].id : null;
	const isCurrent = selectedId === currentId;

	const reconstructedTextInput: UseReconstructedTextParams = {
		updates,
		selectedId,
		docId: id,
		documentKeyRing,
		authorSigningKeys,
		snapshotPlaintext,
	};
	const text = useReconstructedText(reconstructedTextInput);
	const displayTitle = useDisplayTitle(docInfo, documentKeyRing);
	useDocumentTitle(displayTitle);
	const selectedIndex = groups.findIndex((g) => g.lastUpdateId === selectedId);
	// Drives the scrubber track's fill/handle position (--progress custom
	// property, App.css) — a single group has nothing to scrub between, so
	// this simply reads as "all the way at the end".
	const scrubberProgress = groups.length > 1 ? selectedIndex / (groups.length - 1) : 1;

	const { setIsPlaying, playbackControls } = useHistoryPlayback({
		groups,
		selectedIndex,
		isCurrent,
		setSelectedId,
	});
	const highlight = useHistoryHighlight(text, selectedId, updates);

	function memberName(authorId: string): string {
		const member = members.find((m) => m.user_id === authorId);
		return member?.display_name || member?.email || shortId(authorId);
	}

	const { onPointerDown, onPointerMove, onKeyDown } = useScrubberControls({ groups, selectedIndex, setIsPlaying, setSelectedId });

	async function handleRestore() {
		setIsRestoring(true);
		try {
			const restoreInput: RestoreHistoryTextParams = { docId: id, session, selectedId, documentKeyRing, text };
			const didRestore = await restoreHistoryText(restoreInput);
			if (didRestore && id) {
				void navigate(routes.document(id));
			}
		} finally {
			setIsRestoring(false);
			setIsRestoreOpen(false);
		}
	}

	function handleSelectVersion(updateId: number) {
		setIsPlaying(false);
		setSelectedId(updateId);
	}

	// The router guarantees :id is present for this route — this is just
	// narrowing the type all the hooks above already accepted as optional,
	// not a runtime possibility this page actually needs to handle.
	if (!id) {
		return <Navigate to={routes.vault} replace />;
	}

	const historyDocRef: HistoryDocRef = { docId: id, displayTitle };

	if (isLoading) {
		return <HistoryLoadingState {...historyDocRef} />;
	}

	if (updates.length === 0) {
		return <HistoryEmptyState {...historyDocRef} />;
	}

	return (
		<div className="history-page">
			<HistoryHeader
				{...historyDocRef}
				isCurrent={isCurrent}
				updates={updates}
				selectedId={selectedId}
				groups={groups}
				{...playbackControls}
				onRestore={() => setIsRestoreOpen(true)}
			/>

			<main id="main-content" className="editor-body">
				<div className="history-content">
					<HistoryTextView title={docInfo ? displayTitle : null} text={text} highlight={highlight} memberName={memberName} />
					<HistoryScrubber
						groups={groups}
						selectedIndex={selectedIndex}
						scrubberProgress={scrubberProgress}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onKeyDown={onKeyDown}
					/>
				</div>

				<HistoryVersionList
					groups={groups}
					groupDeltas={groupDeltas}
					selectedId={selectedId}
					currentId={currentId}
					memberName={memberName}
					onSelect={handleSelectVersion}
				/>
			</main>

			{isRestoreOpen ? <RestoreModal onClose={() => setIsRestoreOpen(false)} onConfirm={() => void handleRestore()} pending={isRestoring} /> : null}
		</div>
	);
}
