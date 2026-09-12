import { TOAST_DURATION_MS, UNDO_TOAST_DURATION_MS } from '../constants';

// A minimal global toast store — module-level state + subscribers, same
// shape as auth/session.ts, so any component can show one without a
// context provider wrapping half the tree.
export type ToastAction = {
	label: string;
	onClick: () => void;
};

export type Toast = {
	id: string;
	message: string;
	variant: 'error' | 'success' | 'info';
	action?: ToastAction;
};

export type ShowToastOptions = {
	variant?: Toast['variant'];
	/** An optional "Undo"-style button — see restoreDocument's use in
	 * DocumentsPage.tsx/DocumentPage.tsx for the motivating case (undo
	 * delete). Clicking it dismisses the toast immediately, without waiting
	 * for durationMs. */
	action?: ToastAction;
	/** Defaults to TOAST_DURATION_MS; a toast with an action gets
	 * UNDO_TOAST_DURATION_MS instead, unless overridden here — undoing
	 * something needs more time to react to than reading a plain message. */
	durationMs?: number;
};

type Listener = () => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();

/** `variantOrOptions` accepts either a plain variant string (the common
 * case — `showToast(message, 'error')`) or a full ShowToastOptions object
 * when a toast also needs an undo action. */
export function showToast(message: string, variantOrOptions?: Toast['variant'] | ShowToastOptions): void {
	const options: ShowToastOptions = typeof variantOrOptions === 'string' ? { variant: variantOrOptions } : (variantOrOptions ?? {});

	const toast: Toast = { id: crypto.randomUUID(), message, variant: options.variant ?? 'info', action: options.action };
	toasts = [...toasts, toast];
	notify();

	const durationMs = options.durationMs ?? (options.action ? UNDO_TOAST_DURATION_MS : TOAST_DURATION_MS);
	setTimeout(() => dismissToast(toast.id), durationMs);
}

export function dismissToast(id: string): void {
	toasts = toasts.filter((toast) => toast.id !== id);
	notify();
}

export function getToasts(): Toast[] {
	return toasts;
}

export function subscribeToasts(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function notify(): void {
	for (const listener of listeners) {
		listener();
	}
}
