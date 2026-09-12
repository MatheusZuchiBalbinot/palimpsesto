import type { TFunction } from 'i18next';

import { showToast } from './toast';

export function copyCurrentLink(t: TFunction) {
	navigator.clipboard
		.writeText(window.location.href)
		.then(() => showToast(t('editor.linkCopied'), 'success'))
		.catch(() => showToast(t('editor.linkCopyFailed'), 'error'));
}
