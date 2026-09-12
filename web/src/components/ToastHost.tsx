import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useToasts } from '../hooks/useToasts';
import { dismissToast, type Toast } from '../lib/toast';

const VARIANT_ICON = {
	error: AlertCircle,
	success: CheckCircle2,
	info: Info,
};

function handleActionClick(toast: Toast) {
	dismissToast(toast.id);
	toast.action?.onClick();
}

/** Mounted once, near the root — every showToast() call anywhere in the app
 * renders here, so an action deep inside a modal or a background retry can
 * report success/failure without needing a provider wrapping it. */
export function ToastHost() {
	const { t } = useTranslation();
	const toasts = useToasts();

	// Rendered unconditionally, even when empty — a live region has to
	// already exist in the DOM before content lands in it. A screen reader
	// registers regions it can find on the page; one that appears in the
	// same commit as its first message typically doesn't get announced,
	// since there was nothing to have registered yet.
	return (
		<div className="toast-host" role="status" aria-live="polite">
			{toasts.map((toast) => {
				const Icon = VARIANT_ICON[toast.variant];
				return (
					<div key={toast.id} className={`toast toast--${toast.variant}`}>
						<Icon size={16} />
						<span className="toast__message">{toast.message}</span>
						{toast.action ? (
							<button type="button" className="toast__action" onClick={() => handleActionClick(toast)}>
								{toast.action.label}
							</button>
						) : null}
						<button type="button" className="toast__dismiss" onClick={() => dismissToast(toast.id)} aria-label={t('toast.dismiss')}>
							<X size={14} />
						</button>
					</div>
				);
			})}
		</div>
	);
}
