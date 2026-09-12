import { useTranslation } from 'react-i18next';

import type { ThemePreference } from '../../lib/theme';

const THEME_OPTIONS: Array<{ value: ThemePreference; labelKey: string }> = [
	{ value: 'light', labelKey: 'settings.themeLight' },
	{ value: 'dark', labelKey: 'settings.themeDark' },
	{ value: 'system', labelKey: 'settings.themeSystem' },
];

type AppearanceCardProps = {
	themePreference: ThemePreference;
	onThemeChange: (value: ThemePreference) => void;
};

export function AppearanceCard({ themePreference, onThemeChange }: Readonly<AppearanceCardProps>) {
	const { t } = useTranslation();
	return (
		<div className="settings-card">
			<h2 className="settings-card__section-title">{t('settings.appearance')}</h2>
			<div className="settings-row">
				<div className="settings-lang-options" role="radiogroup" aria-label={t('settings.appearance')}>
					{THEME_OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							role="radio"
							aria-checked={option.value === themePreference}
							className={`settings-lang-option${option.value === themePreference ? ' active' : ''}`}
							onClick={() => onThemeChange(option.value)}
						>
							{t(option.labelKey)}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
