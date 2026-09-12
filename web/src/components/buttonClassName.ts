export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

/** Separated from Button.tsx so that file only exports components — mixing
 * a plain function export into a component file breaks React Fast
 * Refresh. */
export function buttonClassName(variant: ButtonVariant, size: ButtonSize, extra?: string): string {
	return ['btn', `btn--${variant}`, size === 'sm' ? 'btn--sm' : '', extra].filter(Boolean).join(' ');
}
