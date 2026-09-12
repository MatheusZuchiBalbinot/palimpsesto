import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { changePassword } from '../auth/actions';
import { PASSWORD_MIN_LENGTH } from '../constants';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { translateError } from '../i18n/errors';
import { showToast } from '../lib/toast';
import { Button } from './Button';
import { DerivationProgress } from './DerivationProgress';
import { TextField } from './Input';
import { Modal } from './Modal';
import { useModalClose } from './modalCloseContext';
import { useModalTitleId } from './modalTitleContext';

type ChangePasswordModalProps = {
	email: string;
	onClose: () => void;
};

export function ChangePasswordModal({ email, onClose }: Readonly<ChangePasswordModalProps>) {
	return (
		<Modal onClose={onClose} maxWidth={420}>
			<ChangePasswordForm email={email} />
		</Modal>
	);
}

function ChangePasswordForm({ email }: Readonly<{ email: string }>) {
	const { t } = useTranslation();
	const requestClose = useModalClose();
	const titleId = useModalTitleId();
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [derivationProgress, setDerivationProgress] = useState<number>();

	const isPasswordsMatch = newPassword === confirmPassword;

	const [{ isPending, error }, submit] = useAsyncAction(async () => {
		setDerivationProgress(0);
		try {
			await changePassword({ email, currentPassword, newPassword }, setDerivationProgress);
		} finally {
			setDerivationProgress(undefined);
		}
		showToast(t('settings.passwordChanged'), 'success');
		requestClose();
	});

	function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!isPasswordsMatch) {
			return;
		}
		submit();
	}

	return (
		<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
			<div className="modal-title" id={titleId}>
				{t('settings.changePhrase')}
			</div>
			<ChangePasswordFields
				currentPassword={currentPassword}
				onCurrentPasswordChange={setCurrentPassword}
				newPassword={newPassword}
				onNewPasswordChange={setNewPassword}
				confirmPassword={confirmPassword}
				onConfirmPasswordChange={setConfirmPassword}
				isPasswordsMatch={isPasswordsMatch}
				error={error}
				derivationProgress={derivationProgress}
			/>
			<div className="modal-actions">
				<Button type="button" variant="secondary" onClick={requestClose} disabled={isPending}>
					{t('confirmModal.cancel')}
				</Button>
				<Button type="submit" disabled={isPending || !isPasswordsMatch}>
					{isPending ? t('settings.changing') : t('settings.change')}
				</Button>
			</div>
		</form>
	);
}

type ChangePasswordFieldsProps = {
	currentPassword: string;
	onCurrentPasswordChange: (value: string) => void;
	newPassword: string;
	onNewPasswordChange: (value: string) => void;
	confirmPassword: string;
	onConfirmPasswordChange: (value: string) => void;
	isPasswordsMatch: boolean;
	error: unknown;
	derivationProgress: number | undefined;
};

function ChangePasswordFields({
	currentPassword,
	onCurrentPasswordChange,
	newPassword,
	onNewPasswordChange,
	confirmPassword,
	onConfirmPasswordChange,
	isPasswordsMatch,
	error,
	derivationProgress,
}: Readonly<ChangePasswordFieldsProps>) {
	const { t } = useTranslation();
	return (
		<>
			<TextField
				label={t('settings.currentPasswordLabel')}
				type="password"
				required
				autoComplete="current-password"
				value={currentPassword}
				onChange={(e) => onCurrentPasswordChange(e.target.value)}
			/>
			<TextField
				label={t('settings.newPasswordLabel')}
				type="password"
				required
				minLength={PASSWORD_MIN_LENGTH}
				autoComplete="new-password"
				value={newPassword}
				onChange={(e) => onNewPasswordChange(e.target.value)}
			/>
			<TextField
				label={t('settings.confirmNewPasswordLabel')}
				type="password"
				required
				minLength={PASSWORD_MIN_LENGTH}
				autoComplete="new-password"
				value={confirmPassword}
				onChange={(e) => onConfirmPasswordChange(e.target.value)}
			/>
			{!isPasswordsMatch && confirmPassword.length > 0 ? (
				<p className="form-error" role="alert">
					{t('settings.passwordsDontMatch')}
				</p>
			) : null}

			{error ? (
				<p className="form-error" role="alert">
					{translateError(t, error)}
				</p>
			) : null}

			{derivationProgress === undefined ? null : <DerivationProgress fraction={derivationProgress} />}
		</>
	);
}
