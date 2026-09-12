import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';

export type SelectProps = {
	label?: string;
} & SelectHTMLAttributes<HTMLSelectElement>;

/** A native <select>, styled to match .input, with a chevron indicator —
 * native so it stays keyboard- and screen-reader-accessible without extra
 * effort. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, className, children, ...rest }, ref) {
	const control = (
		<div className="select-wrapper">
			<select ref={ref} className={['select', className].filter(Boolean).join(' ')} {...rest}>
				{children}
			</select>
			<ChevronDown size={14} className="select-wrapper__chevron" aria-hidden="true" />
		</div>
	);

	if (!label) {
		return control;
	}

	return (
		<label className="form-field">
			<span>{label}</span>
			{control}
		</label>
	);
});
