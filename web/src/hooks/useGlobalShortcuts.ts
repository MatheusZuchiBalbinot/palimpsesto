import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { useNavigate } from 'react-router-dom';

import type { DocumentId } from '../api/ids';
import { hasAnyLayer } from '../lib/floatingLayers';
import { routes } from '../routes';

type GlobalShortcut = { test: (e: KeyboardEvent) => boolean; run: () => void };

export type UseGlobalShortcutsParams = {
	id: DocumentId | undefined;
	navigate: ReturnType<typeof useNavigate>;
	findInputRef: RefObject<HTMLInputElement | null>;
	setIsPanelOpen: Dispatch<SetStateAction<boolean>>;
	setIsShortcutsHelpOpen: (open: boolean) => void;
	setIsFindOpen: Dispatch<SetStateAction<boolean>>;
	setIsShareOpen: (open: boolean) => void;
};

// Keyboard shortcuts for the whole DocumentPage screen — share/history/
// panel/help. Ctrl+Z/Ctrl+Shift+Z are handled inside the editor itself
// (y-codemirror.next's yUndoManagerKeymap, wired in codemirrorEditor.ts),
// since they only make sense with focus in the editor.
export function useGlobalShortcuts({
	id,
	navigate,
	findInputRef,
	setIsPanelOpen,
	setIsShortcutsHelpOpen,
	setIsFindOpen,
	setIsShareOpen,
}: UseGlobalShortcutsParams) {
	useEffect(() => {
		// '/', 'f' and Shift+S each open something that would sit on top of
		// (or, for 'f', steal focus out of — see hooks/useDialogFocusTrap.ts)
		// an already-open Modal, the same stacking problem Ctrl+K's guard in
		// CommandPalette.tsx solves — so each checks hasAnyLayer() first.
		// '.' just toggles a permanent layout panel (not an overlay) and
		// Shift+H navigates away entirely, so neither needs the same guard.
		const shortcuts: GlobalShortcut[] = [
			{ test: (e) => e.key === '.', run: () => setIsPanelOpen((v) => !v) },
			{ test: (e) => e.key === '/' && !hasAnyLayer(), run: () => setIsShortcutsHelpOpen(true) },
			{
				test: (e) => e.key.toLowerCase() === 'f' && !e.shiftKey && !hasAnyLayer(),
				run: () => {
					setIsFindOpen(true);
					setTimeout(() => findInputRef.current?.focus(), 0);
				},
			},
			{
				test: (e) => e.shiftKey && e.key.toLowerCase() === 'h',
				run: () => {
					if (id) {
						void navigate(routes.documentHistory(id));
					}
				},
			},
			{
				test: (e) => e.shiftKey && e.key.toLowerCase() === 's' && !hasAnyLayer(),
				run: () => setIsShareOpen(true),
			},
		];

		function handleGlobalKeyDown(e: KeyboardEvent) {
			const isModifierPressed = e.ctrlKey || e.metaKey;
			if (!isModifierPressed) {
				return;
			}
			const shortcut = shortcuts.find((s) => s.test(e));
			if (shortcut) {
				e.preventDefault();
				shortcut.run();
			}
		}
		window.addEventListener('keydown', handleGlobalKeyDown);
		return () => window.removeEventListener('keydown', handleGlobalKeyDown);
	}, [id, navigate, findInputRef, setIsPanelOpen, setIsShortcutsHelpOpen, setIsFindOpen, setIsShareOpen]);
}
