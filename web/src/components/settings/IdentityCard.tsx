import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { COPIED_FEEDBACK_MS, SIGIL_SIZE_IDENTITY } from '../../constants';
import type { SettingsIdentity } from '../../hooks/useSettingsIdentity';
import { showToast } from '../../lib/toast';
import { IconButton } from '../Button';
import { Sigil } from '../Sigil';

type CopyFingerprintButtonProps = {
	fingerprint: string;
};

/** Without this, the fingerprint is decoration — it exists to be compared
 * with someone else over a different channel (UX_REVIEW.md 6.2), and
 * retyping 12 groups of 5 digits by hand isn't a real option. */
function CopyFingerprintButton({ fingerprint }: Readonly<CopyFingerprintButtonProps>) {
	const { t } = useTranslation();
	const [isCopied, setIsCopied] = useState(false);

	function handleCopy() {
		navigator.clipboard
			.writeText(fingerprint)
			.then(() => {
				setIsCopied(true);
				setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS);
			})
			.catch(() => showToast(t('settings.fingerprintCopyFailed'), 'error'));
	}

	return (
		<IconButton label={isCopied ? t('settings.fingerprintCopied') : t('settings.fingerprintCopy')} onClick={handleCopy}>
			{isCopied ? <Check size={14} /> : <Copy size={14} />}
		</IconButton>
	);
}

export function IdentityCard({ identity }: Readonly<{ identity: SettingsIdentity | null }>) {
	const { t } = useTranslation();
	return (
		<div className="settings-card">
			<h2 className="settings-card__section-title">{t('settings.identity')}</h2>
			{identity ? (
				<div className="settings-row settings-row--identity">
					<Sigil hash={identity.hash} size={SIGIL_SIZE_IDENTITY} />
					<div style={{ flex: 1, minWidth: 0 }}>
						<div className="settings-row__title">{t('settings.fingerprint')}</div>
						<div className="settings-fingerprint">{identity.fingerprint}</div>
					</div>
					<CopyFingerprintButton fingerprint={identity.fingerprint} />
				</div>
			) : (
				<p className="settings-row__sub settings-row__sub--card-note">{t('settings.identityPending')}</p>
			)}
			<p className="settings-row__sub settings-row__sub--card-note">{t('settings.identityHint')}</p>
		</div>
	);
}
