import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { updateProfile } from '../api/auth';
import { logout } from '../auth/actions';
import { setSession } from '../auth/session';
import { Button } from '../components/Button';
import { AppearanceCard } from '../components/settings/AppearanceCard';
import { DevicesCard } from '../components/settings/DevicesCard';
import { IdentityCard } from '../components/settings/IdentityCard';
import { LanguageCard } from '../components/settings/LanguageCard';
import { ProfileCard } from '../components/settings/ProfileCard';
import { SecurityCard } from '../components/settings/SecurityCard';
import { SettingsHeader } from '../components/settings/SettingsHeader';
import { SettingsModals } from '../components/settings/SettingsModals';
import { useDevices } from '../hooks/useDevices';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSession } from '../hooks/useSession';
import { useSettingsIdentity } from '../hooks/useSettingsIdentity';
import { useTheme } from '../hooks/useTheme';
import { languageStorageKey } from '../i18n/config';
import { translateError } from '../i18n/errors';
import { showToast } from '../lib/toast';
import { routes } from '../routes';

export function SettingsPage() {
	const { t, i18n } = useTranslation();
	useDocumentTitle(t('settings.back'));
	const navigate = useNavigate();
	const session = useSession();
	const [themePreference, setThemePreference] = useTheme();
	const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
	const { list, revoke, revokeOthers } = useDevices();
	const identity = useSettingsIdentity(session);

	const userId = session?.user.user_id ?? '';
	const userEmail = session?.user.email;
	const userDisplayName = session?.user.display_name;
	const name = userDisplayName || userEmail || '';

	function handleLanguageChange(code: string) {
		void i18n.changeLanguage(code);
		try {
			localStorage.setItem(languageStorageKey, code);
		} catch {
			// Private mode / storage disabled: the choice just doesn't survive
			// a reload — not worth failing the language switch over.
		}
	}

	async function handleLogout() {
		await logout();
		void navigate(routes.login);
	}

	async function handleRenameProfile(displayName: string) {
		try {
			await updateProfile({ display_name: displayName });
			if (session) {
				setSession({ ...session, user: { ...session.user, display_name: displayName } });
			}
		} catch (e) {
			showToast(translateError(t, e), 'error');
		}
	}

	return (
		<div className="settings-page">
			<SettingsHeader />

			<main id="main-content" className="settings-body">
				<div className="settings-content">
					<ProfileCard userId={userId} name={name} email={userEmail} onRenameProfile={(v) => void handleRenameProfile(v)} />
					<IdentityCard identity={identity} />
					<DevicesCard {...list} onRequestRevoke={revoke.onRequest} onRequestRevokeOthers={revokeOthers.onRequest} />
					<SecurityCard session={session} onChangePassword={() => setIsChangePasswordOpen(true)} />
					<AppearanceCard themePreference={themePreference} onThemeChange={setThemePreference} />
					<LanguageCard language={i18n.language} onLanguageChange={handleLanguageChange} />

					<Button variant="danger" onClick={() => void handleLogout()}>
						{t('settings.logout')}
					</Button>
				</div>
			</main>

			<SettingsModals
				isChangePasswordOpen={isChangePasswordOpen}
				sessionEmail={userEmail}
				onCloseChangePassword={() => setIsChangePasswordOpen(false)}
				revoke={revoke}
				revokeOthers={revokeOthers}
			/>
		</div>
	);
}
