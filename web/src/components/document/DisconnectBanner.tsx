import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Shown once the realtime connection has been down long enough to matter
 * (UX_REVIEW.md 3.7) — the header's status dot alone is easy to miss while
 * heads-down writing, and a dropped connection means new keystrokes exist
 * only in this tab until it reconnects. */
export function DisconnectBanner() {
	const { t } = useTranslation();
	return (
		<div className="disconnect-banner" role="alert">
			<WifiOff size={14} />
			{t('editor.disconnectedBanner')}
		</div>
	);
}
