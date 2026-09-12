import type { TFunction } from 'i18next';
import { FileText, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { listDocuments } from '../api/docs';
import type { DocumentSummaryDTO } from '../api/docTypes';
import type { DocumentId } from '../api/ids';
import type { DocumentDEK } from '../crypto/documentDek';
import { tryDecryptTitle } from '../crypto/documentTitle';
import { useDocumentKeyRings } from '../hooks/useDocumentKeyRings';
import { usePaletteActions } from '../hooks/usePaletteActions';
import { useSession } from '../hooks/useSession';
import { hasAnyLayer } from '../lib/floatingLayers';
import { routes } from '../routes';
import { Modal } from './Modal';

type PaletteEntry = {
	id: string;
	label: string;
	sublabel?: string;
	onRun: () => void;
};

type BuildPaletteEntriesParams = {
	documents: DocumentSummaryDTO[];
	docKeyRings: Map<DocumentId, DocumentDEK[]>;
	pageActions: ReturnType<typeof usePaletteActions>;
	query: string;
	t: TFunction;
	navigate: ReturnType<typeof useNavigate>;
};

function buildPaletteEntries(params: BuildPaletteEntriesParams): PaletteEntry[] {
	const { documents, docKeyRings, pageActions, query, t, navigate } = params;
	const navigationEntries: PaletteEntry[] = [
		{
			id: 'nav:vault',
			label: t('commandPalette.goToVault'),
			onRun: () => void navigate(routes.vault),
		},
		{
			id: 'nav:settings',
			label: t('commandPalette.goToSettings'),
			onRun: () => void navigate(routes.settings),
		},
		...documents.map((doc) => {
			const ring = docKeyRings.get(doc.id);
			return {
				id: `doc:${doc.id}`,
				label: (ring && tryDecryptTitle(ring, doc.id, doc.title_ciphertext)) ?? t('vault.titlePending'),
				sublabel: t('commandPalette.openDocument'),
				onRun: () => void navigate(routes.document(doc.id)),
			};
		}),
	];

	const actionEntries: PaletteEntry[] = pageActions.map((action) => ({
		id: `action:${action.id}`,
		label: action.label,
		onRun: action.onRun,
	}));

	const all = [...actionEntries, ...navigationEntries];
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return all;
	}
	return all.filter((entry) => entry.label.toLowerCase().includes(normalizedQuery));
}

type HandlePaletteKeyDownParams = {
	e: ReactKeyboardEvent;
	entries: PaletteEntry[];
	selectedIndex: number;
	setSelectedIndex: (update: (i: number) => number) => void;
	runEntry: (entry: PaletteEntry) => void;
};

function handlePaletteKeyDown({ e, entries, selectedIndex, setSelectedIndex, runEntry }: HandlePaletteKeyDownParams): void {
	if (e.key === 'ArrowDown') {
		e.preventDefault();
		setSelectedIndex((i) => Math.min(i + 1, entries.length - 1));
	} else if (e.key === 'ArrowUp') {
		e.preventDefault();
		setSelectedIndex((i) => Math.max(i - 1, 0));
	} else if (e.key === 'Enter') {
		e.preventDefault();
		const entry = entries[selectedIndex];
		if (entry) {
			runEntry(entry);
		}
	}
}

/** id="{listboxId}-option-{index}" — stable per render (index-based, not
 * entry.id-based) so aria-activedescendant always names an id that's
 * actually present in the currently-filtered list. */
function optionId(listboxId: string, index: number): string {
	return `${listboxId}-option-${index}`;
}

type CommandPaletteItemProps = {
	id: string;
	entry: PaletteEntry;
	isSelected: boolean;
	onHover: () => void;
	onRun: () => void;
};

type CommandPaletteListProps = {
	listboxId: string;
	entries: PaletteEntry[];
	emptyLabel: string;
	selectedIndex: number;
	onHover: (index: number) => void;
	onRun: (entry: PaletteEntry) => void;
	listRef: RefObject<HTMLDivElement | null>;
};

function CommandPaletteList({ listboxId, entries, emptyLabel, selectedIndex, onHover, onRun, listRef }: Readonly<CommandPaletteListProps>) {
	if (entries.length === 0) {
		return (
			<div id={listboxId} role="listbox" ref={listRef}>
				<p className="command-palette__empty">{emptyLabel}</p>
			</div>
		);
	}
	return (
		<div id={listboxId} role="listbox" ref={listRef}>
			{entries.map((entry, index) => (
				<CommandPaletteItem
					key={entry.id}
					id={optionId(listboxId, index)}
					entry={entry}
					isSelected={index === selectedIndex}
					onHover={() => onHover(index)}
					onRun={() => onRun(entry)}
				/>
			))}
		</div>
	);
}

type CommandPaletteSearchInputProps = {
	inputRef: RefObject<HTMLInputElement | null>;
	query: string;
	onQueryChange: (value: string) => void;
	onKeyDown: (e: ReactKeyboardEvent) => void;
	placeholder: string;
	listboxId: string;
	activeOptionId: string | undefined;
	isExpanded: boolean;
};

function CommandPaletteSearchInput({
	inputRef,
	query,
	onQueryChange,
	onKeyDown,
	placeholder,
	listboxId,
	activeOptionId,
	isExpanded,
}: Readonly<CommandPaletteSearchInputProps>) {
	return (
		<div className="command-palette__search">
			<Search size={16} className="command-palette__search-icon" />
			<input
				ref={inputRef}
				role="combobox"
				aria-expanded={isExpanded}
				aria-controls={listboxId}
				aria-activedescendant={activeOptionId}
				aria-autocomplete="list"
				aria-label={placeholder}
				value={query}
				onChange={(e) => onQueryChange(e.target.value)}
				onKeyDown={onKeyDown}
				placeholder={placeholder}
			/>
		</div>
	);
}

function CommandPaletteItem({ id, entry, isSelected, onHover, onRun }: Readonly<CommandPaletteItemProps>) {
	return (
		<button
			id={id}
			type="button"
			role="option"
			aria-selected={isSelected}
			className={`command-palette__item${isSelected ? ' selected' : ''}`}
			onMouseEnter={onHover}
			onClick={onRun}
		>
			<FileText size={14} className="command-palette__item-icon" aria-hidden="true" />
			<span className="command-palette__item-label">{entry.label}</span>
			{entry.sublabel ? <span className="command-palette__item-sub">{entry.sublabel}</span> : null}
		</button>
	);
}

/** Global Ctrl+K/Cmd+K palette — jumps to any document by title, or runs
 * whatever the current page registered via lib/paletteActions.ts (share,
 * history, resolve all comments, ...). Mounted once in RequireSession, so
 * it only exists when there's a session to list documents for.
 *
 * Split between this thin wrapper (just the global shortcut + open/closed)
 * and CommandPaletteContent below: the content only exists while open, so
 * its search/selection/document-list state starts clean on every open just
 * from mounting, without needing an effect to reset it. */
export function CommandPalette() {
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const isPaletteShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
			if (!isPaletteShortcut) {
				return;
			}
			e.preventDefault();
			// Toggling closed always works (it's this palette's own Modal on
			// top); toggling open only when nothing else is already on top —
			// without that check, Ctrl+K opened the palette over whatever
			// Modal the current page already had open, stacking two overlays
			// (see lib/floatingLayers.ts).
			setIsOpen((current) => (current ? false : !hasAnyLayer()));
		}
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	if (!isOpen) {
		return null;
	}
	return <CommandPaletteContent onClose={() => setIsOpen(false)} />;
}

function CommandPaletteContent({ onClose }: Readonly<{ onClose: () => void }>) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const session = useSession();
	const pageActions = usePaletteActions();
	const [query, setQuery] = useState('');
	const [documents, setDocuments] = useState<DocumentSummaryDTO[]>([]);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const listboxId = useId();
	const { docKeyRings } = useDocumentKeyRings(session, documents);

	useEffect(() => {
		listDocuments()
			.then(setDocuments)
			.catch(() => setDocuments([]));
		inputRef.current?.focus();
	}, []);

	const entries = useMemo(() => {
		const paletteEntriesInput: BuildPaletteEntriesParams = { documents, docKeyRings, pageActions, query, t, navigate };
		return buildPaletteEntries(paletteEntriesInput);
	}, [documents, docKeyRings, pageActions, query, t, navigate]);

	// Keeps the highlighted option in view when the arrow keys move
	// selectedIndex past the edge of the scrollable list — without this, the
	// visual highlight (and, for a sighted keyboard user, the only signal of
	// where they are) could scroll out of the visible area.
	useEffect(() => {
		const option = listRef.current?.querySelector(`#${CSS.escape(optionId(listboxId, selectedIndex))}`);
		option?.scrollIntoView({ block: 'nearest' });
	}, [selectedIndex, listboxId]);

	function runEntry(entry: PaletteEntry) {
		onClose();
		entry.onRun();
	}

	function handleKeyDown(e: ReactKeyboardEvent) {
		handlePaletteKeyDown({ e, entries, selectedIndex, setSelectedIndex, runEntry });
	}

	function handleQueryChange(value: string) {
		setQuery(value);
		setSelectedIndex(0);
	}

	return (
		<Modal onClose={onClose} maxWidth={560} flush>
			<div className="command-palette">
				<CommandPaletteSearchInput
					inputRef={inputRef}
					query={query}
					onQueryChange={handleQueryChange}
					onKeyDown={handleKeyDown}
					placeholder={t('commandPalette.placeholder')}
					listboxId={listboxId}
					activeOptionId={entries.length > 0 ? optionId(listboxId, selectedIndex) : undefined}
					isExpanded={entries.length > 0}
				/>
				<p className="sr-only" role="status">
					{t('commandPalette.resultCount', { count: entries.length })}
				</p>
				<div className="command-palette__list">
					<CommandPaletteList
						listboxId={listboxId}
						entries={entries}
						emptyLabel={t('commandPalette.empty')}
						selectedIndex={selectedIndex}
						onHover={setSelectedIndex}
						onRun={runEntry}
						listRef={listRef}
					/>
				</div>
			</div>
		</Modal>
	);
}
