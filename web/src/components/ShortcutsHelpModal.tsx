import { useTranslation } from 'react-i18next';

import { Modal } from './Modal';
import { useModalTitleId } from './modalTitleContext';

type ShortcutsHelpModalProps = {
	onClose: () => void;
};

const SHORTCUTS: Array<{ keys: string; labelKey: string }> = [
	{ keys: 'Ctrl+Z', labelKey: 'shortcutsHelp.undo' },
	{ keys: 'Ctrl+Shift+Z', labelKey: 'shortcutsHelp.redo' },
	{ keys: 'Ctrl+F', labelKey: 'shortcutsHelp.find' },
	{ keys: 'Ctrl+.', labelKey: 'shortcutsHelp.togglePanel' },
	{ keys: 'Ctrl+Shift+H', labelKey: 'shortcutsHelp.history' },
	{ keys: 'Ctrl+Shift+S', labelKey: 'shortcutsHelp.share' },
	{ keys: 'Ctrl+K', labelKey: 'shortcutsHelp.commandPalette' },
	{ keys: 'Ctrl+/', labelKey: 'shortcutsHelp.help' },
];

export function ShortcutsHelpModal({ onClose }: Readonly<ShortcutsHelpModalProps>) {
	return (
		<Modal onClose={onClose} maxWidth={360}>
			<ShortcutsHelpModalContent />
		</Modal>
	);
}

// Separated from ShortcutsHelpModal so useModalTitleId() resolves to *this*
// modal's own generated id — only works when called from inside the
// Modal's own children, not from the component that renders <Modal> in
// the first place (see modalTitleContext.ts).
function ShortcutsHelpModalContent() {
	const { t } = useTranslation();
	const titleId = useModalTitleId();

	return (
		<>
			<div className="modal-title" id={titleId}>
				{t('shortcutsHelp.title')}
			</div>
			<div className="shortcuts-help__list">
				{SHORTCUTS.map((s) => (
					<div key={s.keys} className="shortcuts-help__row">
						<span>{t(s.labelKey)}</span>
						<kbd>{s.keys}</kbd>
					</div>
				))}
			</div>
		</>
	);
}
