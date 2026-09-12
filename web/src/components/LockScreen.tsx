import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { logout, verifyPassword } from '../auth/actions';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useSession } from '../hooks/useSession';
import { unlockNow } from '../lib/autoLock';
import { routes } from '../routes';
import { Button } from './Button';
import { DerivationProgress } from './DerivationProgress';
import { TextField } from './Input';

/** Thrown by the submit action below to mean "the password itself was
 * wrong" — distinct from a real error (network, server down), which
 * translateError (i18n/errors.ts) already knows how to word. Nothing else
 * throws this, so `instanceof` alone tells the two apart at render time. */
class WrongPasswordError extends Error {}

function LockScreenHeading({ name }: Readonly<{ name: string }>) {
	const { t } = useTranslation();
	return (
		<>
			<div className="brand-mark brand-mark--dark lock-screen__brand">
				<span className="brand-mark__logo" />
				<span className="brand-mark__name">{t('vault.brand')}</span>
			</div>
			<div>
				<h1 className="text-2xl">{t('lockScreen.title')}</h1>
				<p className="auth-form__subtitle">{t('lockScreen.subtitle', { name })}</p>
			</div>
		</>
	);
}

type LockScreenFooterProps = {
	error: unknown;
	derivationProgress: number | undefined;
	isPending: boolean;
	onLogoutInstead: () => void;
};

function LockScreenFooter({ error, derivationProgress, isPending, onLogoutInstead }: Readonly<LockScreenFooterProps>) {
	const { t } = useTranslation();
	return (
		<>
			{error ? (
				<p className="form-error" role="alert">
					{error instanceof WrongPasswordError ? t('lockScreen.wrongPassword') : t('errors.unexpected')}
				</p>
			) : null}
			{derivationProgress === undefined ? null : <DerivationProgress fraction={derivationProgress} />}
			<Button type="submit" disabled={isPending}>
				{isPending ? t('lockScreen.unlocking') : t('lockScreen.unlock')}
			</Button>
			<button type="button" className="text-link lock-screen__logout" onClick={onLogoutInstead}>
				{t('lockScreen.logoutInstead')}
			</button>
		</>
	);
}

/** Covers the whole app, opaque, whenever lib/autoLock.ts says the idle
 * timeout has passed — session and any open document/WebSocket stay
 * exactly as they were (this is a privacy screen, not a logout); nothing
 * behind it is visible or reachable until the real password is typed
 * again. Unlocking re-derives the key and re-fetches+unwraps the
 * server's copy (verifyPassword) — a wrong guess genuinely fails here,
 * it doesn't just hide an overlay. */
export function LockScreen() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const session = useSession();
	const [password, setPassword] = useState('');
	const [derivationProgress, setDerivationProgress] = useState<number>();

	const [{ isPending, error }, submit] = useAsyncAction(async () => {
		if (!session) {
			return;
		}
		setDerivationProgress(0);
		try {
			const isCorrect = await verifyPassword(session.user.email, password, setDerivationProgress);
			if (!isCorrect) {
				throw new WrongPasswordError();
			}
			unlockNow();
			setPassword('');
		} finally {
			setDerivationProgress(undefined);
		}
	});

	async function handleLogoutInstead() {
		await logout();
		void navigate(routes.login);
	}

	function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
		e.preventDefault();
		submit();
	}

	if (!session) {
		return null;
	}

	return (
		<div className="lock-screen" role="dialog" aria-modal="true" aria-label={t('lockScreen.title')}>
			<form className="lock-screen__card" onSubmit={handleSubmit}>
				<LockScreenHeading name={session.user.display_name || session.user.email} />

				<TextField
					label={t('lockScreen.passwordLabel')}
					type="password"
					autoFocus
					required
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>

				<LockScreenFooter
					error={error}
					derivationProgress={derivationProgress}
					isPending={isPending}
					onLogoutInstead={() => void handleLogoutInstead()}
				/>
			</form>
		</div>
	);
}
