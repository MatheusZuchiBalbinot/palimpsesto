import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type TextFieldProps = {
	label: string;
	/** Small element at the end of the label row — e.g. the "Forgot" link next
	 * to "Password". */
	hint?: ReactNode;
	error?: string;
} & InputHTMLAttributes<HTMLInputElement>;

type PasswordToggleButtonProps = {
	isVisible: boolean;
	onToggle: () => void;
};

function PasswordToggleButton({ isVisible, onToggle }: Readonly<PasswordToggleButtonProps>) {
	const { t } = useTranslation();
	return (
		<button
			type="button"
			className="password-field__toggle"
			aria-label={isVisible ? t('auth.hidePassword') : t('auth.showPassword')}
			aria-pressed={isVisible}
			onClick={onToggle}
		>
			{isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
		</button>
	);
}

/** Label + input + optional error, the only shape every form field in the
 * app uses. Explicit association via htmlFor/id (not a simple wrapping
 * <label>) because `hint` can itself be an interactive element (the
 * "Forgot" button on LoginPage) — nesting a second focusable control inside
 * the same <label> as the input made its accessible name leak into the
 * input's (a screen reader announced the password field as "Password
 * Forgot"), and broke naive label-based lookups like Playwright's
 * getByLabel, which resolved to the button instead of the input.
 *
 * type="password" gets a show/hide toggle for free (UX_REVIEW.md 1.1) — in
 * an account with no password recovery, letting someone see what they just
 * typed is cheaper insurance than a confirmation field. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, hint, error, className, id, type, ...rest }, ref) {
	const generatedId = useId();
	const inputId = id ?? generatedId;
	const errorId = useId();
	const [isPasswordVisible, setIsPasswordVisible] = useState(false);
	const isPasswordField = type === 'password';

	const input = (
		<input
			ref={ref}
			id={inputId}
			type={isPasswordField && isPasswordVisible ? 'text' : type}
			className={['input', isPasswordField ? 'input--with-toggle' : '', className].filter(Boolean).join(' ')}
			{...rest}
			aria-invalid={error ? true : undefined}
			aria-describedby={error ? errorId : undefined}
		/>
	);

	return (
		<div className="form-field">
			{hint ? (
				<div className="form-field__row">
					<label htmlFor={inputId}>{label}</label>
					{hint}
				</div>
			) : (
				<label htmlFor={inputId}>{label}</label>
			)}
			{isPasswordField ? (
				<div className="password-field">
					{input}
					<PasswordToggleButton isVisible={isPasswordVisible} onToggle={() => setIsPasswordVisible((v) => !v)} />
				</div>
			) : (
				input
			)}
			{error ? (
				<p className="form-error" role="alert" id={errorId}>
					{error}
				</p>
			) : null}
		</div>
	);
});
