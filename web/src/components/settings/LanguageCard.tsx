import { useTranslation } from 'react-i18next';

const LANGUAGES = [
	{ code: 'pt', label: 'PT' },
	{ code: 'en', label: 'EN' },
];

type LanguageCardProps = {
	language: string;
	onLanguageChange: (code: string) => void;
};

export function LanguageCard({ language, onLanguageChange }: Readonly<LanguageCardProps>) {
	const { t } = useTranslation();
	return (
		<div className="settings-card">
			<h2 className="settings-card__section-title">{t('settings.language')}</h2>
			<div className="settings-row">
				<div className="settings-lang-options" role="radiogroup" aria-label={t('settings.language')}>
					{LANGUAGES.map((lang) => (
						<button
							key={lang.code}
							type="button"
							role="radio"
							aria-checked={lang.code === language}
							className={`settings-lang-option${lang.code === language ? ' active' : ''}`}
							onClick={() => onLanguageChange(lang.code)}
						>
							{lang.label}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
