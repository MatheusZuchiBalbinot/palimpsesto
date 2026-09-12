import { useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { login } from '../auth/actions';
import { Button, LinkButton } from '../components/Button';
import { DerivationProgress } from '../components/DerivationProgress';
import { TextField } from '../components/Input';
import { PASSWORD_MIN_LENGTH } from '../constants';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { translateError } from '../i18n/errors';
import { routes, withRedirectParam } from '../routes';

export function LoginPage() {
	const { t } = useTranslation();
	useDocumentTitle(t('login.title'));
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [derivationProgress, setDerivationProgress] = useState<number>();
	const [isNoRecoveryOpen, setIsNoRecoveryOpen] = useState(false);

	const [{ isPending, error }, submit] = useAsyncAction(async () => {
		setDerivationProgress(0);
		try {
			await login({ email, password }, setDerivationProgress);
		} finally {
			setDerivationProgress(undefined);
		}
		// An invite link sends an anonymous visitor to login with ?redirect=...
		// — without this, they'd land on the vault instead of continuing on
		// into the document that opened the link.
		void navigate(searchParams.get('redirect') || routes.vault);
	});

	function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
		e.preventDefault();
		submit();
	}

	return (
		<div className="auth-split">
			<LoginBrandPanel quote={t('login.quote')} subquote={t('login.subquote')} />

			<main id="main-content" className="auth-panel">
				<form className="auth-form" onSubmit={handleSubmit}>
					<div>
						<h1>{t('login.title')}</h1>
						<p className="auth-form__subtitle">{t('login.subtitle')}</p>
					</div>

					<LoginFormFields
						email={email}
						onEmailChange={setEmail}
						password={password}
						onPasswordChange={setPassword}
						isNoRecoveryOpen={isNoRecoveryOpen}
						onToggleNoRecovery={() => setIsNoRecoveryOpen((v) => !v)}
					/>

					{error ? (
						<p className="form-error" role="alert">
							{translateError(t, error)}
						</p>
					) : null}

					{derivationProgress === undefined ? null : <DerivationProgress fraction={derivationProgress} />}

					<Button type="submit" disabled={isPending}>
						{isPending ? t('login.submitting') : t('login.submit')}
					</Button>

					<LoginFormFooter registerHref={withRedirectParam(routes.register, searchParams)} />
				</form>
			</main>
		</div>
	);
}

function LoginFormFooter({ registerHref }: Readonly<{ registerHref: string }>) {
	const { t } = useTranslation();
	return (
		<>
			<div className="auth-divider">
				<span />
				<em>{t('login.or')}</em>
				<span />
			</div>

			<LinkButton to={registerHref} variant="secondary">
				{t('login.createAccount')}
			</LinkButton>

			<div className="auth-hint">
				<span className="dot dot--accent" />
				<span>{t('login.keysHint')}</span>
			</div>
		</>
	);
}

type LoginBrandPanelProps = {
	quote: string;
	subquote: string;
};

function LoginBrandPanel({ quote, subquote }: Readonly<LoginBrandPanelProps>) {
	return (
		<div className="auth-split__brand">
			<div className="brand-mark">
				<span className="brand-mark__logo" />
				<span className="brand-mark__name">Palimpsesto</span>
			</div>
			<div className="auth-split__decor" aria-hidden="true">
				<span />
				<span />
				<span />
			</div>
			<div className="auth-split__quote">
				<p>{quote}</p>
				<p className="auth-split__subquote">{subquote}</p>
			</div>
		</div>
	);
}

type LoginFormFieldsProps = {
	email: string;
	onEmailChange: (value: string) => void;
	password: string;
	onPasswordChange: (value: string) => void;
	isNoRecoveryOpen: boolean;
	onToggleNoRecovery: () => void;
};

function LoginFormFields({ email, onEmailChange, password, onPasswordChange, isNoRecoveryOpen, onToggleNoRecovery }: Readonly<LoginFormFieldsProps>) {
	const { t } = useTranslation();
	const noRecoveryNoteId = useId();
	return (
		<div className="auth-form__fields">
			<TextField
				label={t('login.emailLabel')}
				type="email"
				required
				autoComplete="email"
				value={email}
				onChange={(e) => onEmailChange(e.target.value)}
			/>
			<TextField
				label={t('login.passwordLabel')}
				hint={
					<button
						type="button"
						className="form-field__hint form-field__hint--button"
						onClick={onToggleNoRecovery}
						aria-expanded={isNoRecoveryOpen}
						aria-controls={noRecoveryNoteId}
					>
						{t('login.forgot')}
					</button>
				}
				type="password"
				required
				minLength={PASSWORD_MIN_LENGTH}
				autoComplete="current-password"
				value={password}
				onChange={(e) => onPasswordChange(e.target.value)}
			/>
			{isNoRecoveryOpen ? (
				<p className="auth-no-recovery-note" id={noRecoveryNoteId}>
					{t('auth.noRecoveryBody')}
				</p>
			) : null}
		</div>
	);
}
