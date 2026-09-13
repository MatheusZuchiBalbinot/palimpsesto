import { Check, ShieldAlert } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { register } from '../auth/actions';
import { Button } from '../components/Button';
import { DerivationProgress } from '../components/DerivationProgress';
import { TextField } from '../components/Input';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { PASSWORD_MIN_LENGTH } from '../constants';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { translateError } from '../i18n/errors';
import { isPasswordStrong } from '../lib/passwordStrength';
import { routes, withRedirectParam } from '../routes';

const CHECKMARK_STROKE_WIDTH = 3;
const CHECKMARK_SIZE = 11;
const NO_RECOVERY_ICON_SIZE = 20;

export function RegisterPage() {
	const { t } = useTranslation();
	useDocumentTitle(t('register.title'));
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [step, setStep] = useState<1 | 2>(1);
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [isConfirmed, setIsConfirmed] = useState(false);
	const [derivationProgress, setDerivationProgress] = useState<number>();

	const [{ isPending, error }, submit] = useAsyncAction(async () => {
		setDerivationProgress(0);
		try {
			await register({ email, password, displayName: name }, setDerivationProgress);
		} finally {
			setDerivationProgress(undefined);
		}
		// Arrived here from an invite link (?redirect=...)? Continue on to the
		// document instead of landing on the empty vault.
		void navigate(searchParams.get('redirect') || routes.vault);
	});

	const isPasswordMismatch = confirmPassword !== '' && password !== confirmPassword;
	const canContinue = isPasswordStrong(password) && password === confirmPassword;

	function handleStep1Submit(e: SubmitEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!canContinue) {
			return;
		}
		setStep(2);
	}

	function handleFinish() {
		submit();
	}

	return (
		<div className="auth-standalone">
			<RegisterBrandHeader />

			<main id="main-content" tabIndex={-1} className="auth-standalone__content">
				<ProgressSteps currentStep={step} />

				{step === 1 ? (
					<RegisterStep1
						name={name}
						onNameChange={setName}
						email={email}
						onEmailChange={setEmail}
						password={password}
						onPasswordChange={setPassword}
						confirmPassword={confirmPassword}
						onConfirmPasswordChange={setConfirmPassword}
						isPasswordMismatch={isPasswordMismatch}
						canContinue={canContinue}
						onSubmit={handleStep1Submit}
						loginHref={withRedirectParam(routes.login, searchParams)}
					/>
				) : (
					<RegisterStep2
						isConfirmed={isConfirmed}
						onConfirmedChange={setIsConfirmed}
						isPending={isPending}
						error={error}
						derivationProgress={derivationProgress}
						onBack={() => setStep(1)}
						onFinish={handleFinish}
					/>
				)}
			</main>
		</div>
	);
}

type RegisterStep1Props = {
	name: string;
	onNameChange: (value: string) => void;
	email: string;
	onEmailChange: (value: string) => void;
	password: string;
	onPasswordChange: (value: string) => void;
	confirmPassword: string;
	onConfirmPasswordChange: (value: string) => void;
	isPasswordMismatch: boolean;
	canContinue: boolean;
	onSubmit: (e: SubmitEvent<HTMLFormElement>) => void;
	loginHref: string;
};

function RegisterStep1({
	name,
	onNameChange,
	email,
	onEmailChange,
	password,
	onPasswordChange,
	confirmPassword,
	onConfirmPasswordChange,
	isPasswordMismatch,
	canContinue,
	onSubmit,
	loginHref,
}: Readonly<RegisterStep1Props>) {
	const { t } = useTranslation();
	return (
		<form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
			<div>
				<h1 className="text-2xl">{t('register.title')}</h1>
				<p className="auth-form__subtitle">{t('register.subtitle')}</p>
			</div>
			<div className="auth-form__fields">
				<TextField label={t('register.nameLabel')} required value={name} onChange={(e) => onNameChange(e.target.value)} />
				<TextField
					label={t('register.emailLabel')}
					type="email"
					required
					autoComplete="email"
					value={email}
					onChange={(e) => onEmailChange(e.target.value)}
				/>
				<TextField
					label={t('register.passwordLabel')}
					type="password"
					required
					minLength={PASSWORD_MIN_LENGTH}
					autoComplete="new-password"
					value={password}
					onChange={(e) => onPasswordChange(e.target.value)}
				/>
				<PasswordRequirements password={password} />
				<TextField
					label={t('auth.confirmPasswordLabel')}
					type="password"
					required
					autoComplete="new-password"
					value={confirmPassword}
					onChange={(e) => onConfirmPasswordChange(e.target.value)}
					error={isPasswordMismatch ? t('auth.passwordMismatch') : undefined}
				/>
			</div>
			<Button type="submit" disabled={!canContinue}>
				{t('register.continue')}
			</Button>
			<p className="auth-footnote">
				{t('register.hasAccount')}{' '}
				<Link to={loginHref} className="text-link">
					{t('register.login')}
				</Link>
			</p>
		</form>
	);
}

type RegisterStep2Props = {
	isConfirmed: boolean;
	onConfirmedChange: (value: boolean) => void;
	isPending: boolean;
	error: unknown;
	derivationProgress: number | undefined;
	onBack: () => void;
	onFinish: () => void;
};

function RegisterStep2({ isConfirmed, onConfirmedChange, isPending, error, derivationProgress, onBack, onFinish }: Readonly<RegisterStep2Props>) {
	const { t } = useTranslation();
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
			<div>
				<h1 className="text-2xl">{t('auth.noRecoveryTitle')}</h1>
			</div>

			<div className="no-recovery-warning">
				<ShieldAlert size={NO_RECOVERY_ICON_SIZE} className="no-recovery-warning__icon" />
				<p>{t('auth.noRecoveryBody')}</p>
			</div>

			<label className="check-row">
				<input type="checkbox" className="sr-only" checked={isConfirmed} onChange={(e) => onConfirmedChange(e.target.checked)} />
				<span className={`check-row__box${isConfirmed ? ' checked' : ''}`} aria-hidden="true">
					{isConfirmed ? <Check size={CHECKMARK_SIZE} strokeWidth={CHECKMARK_STROKE_WIDTH} /> : null}
				</span>
				<span>{t('auth.noRecoveryConfirm')}</span>
			</label>

			{error ? (
				<p className="form-error" role="alert">
					{translateError(t, error)}
				</p>
			) : null}

			{derivationProgress === undefined ? null : <DerivationProgress fraction={derivationProgress} />}

			<div style={{ display: 'flex', gap: 10 }}>
				<Button type="button" variant="secondary" onClick={onBack}>
					{t('register.back')}
				</Button>
				<Button type="button" style={{ flex: 1 }} disabled={!isConfirmed || isPending} onClick={onFinish}>
					{isPending ? t('register.opening') : t('register.openVault')}
				</Button>
			</div>
		</div>
	);
}

function RegisterBrandHeader() {
	return (
		<Link to={routes.login} className="brand-mark brand-mark--dark auth-standalone__brand">
			<span className="brand-mark__logo" />
			<span className="brand-mark__name">Palimpsesto</span>
		</Link>
	);
}

type ProgressStepsProps = {
	currentStep: 1 | 2;
};

function ProgressSteps({ currentStep }: Readonly<ProgressStepsProps>) {
	return (
		<div className="progress-steps">
			<span className="done" />
			<span className={currentStep === 2 ? 'done' : ''} />
			<span />
		</div>
	);
}
