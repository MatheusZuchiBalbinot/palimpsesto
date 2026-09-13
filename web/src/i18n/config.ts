// i18next configuration. Imported once, for the side effect, before the
// app renders (see main.tsx) — nothing here is meant to be imported from
// its exports except by SettingsPage, which needs the storage key to
// persist the user's language choice, and loadLanguageResources to fetch
// a language on demand before switching to it.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import pt from '../locales/pt/translation.json';

export const defaultLanguage = 'pt';
export const languageStorageKey = 'palimpsesto:lang';

function detectInitialLanguage(): string {
	try {
		return localStorage.getItem(languageStorageKey) ?? defaultLanguage;
	} catch {
		return defaultLanguage;
	}
}

const initialLanguage = detectInitialLanguage();

// Only the default language ships in the initial bundle — the other one
// (currently just 'en') is ~16KB of JSON that every pt-BR visitor (the
// overwhelming majority) would otherwise download and parse for nothing.
// loadLanguageResources fetches it lazily: once here if a returning
// visitor's stored preference is already non-default, and again from
// SettingsPage.tsx whenever someone actively switches language.
const loadedLanguages = new Set<string>([defaultLanguage]);

export async function loadLanguageResources(language: string): Promise<void> {
	if (loadedLanguages.has(language)) {
		return;
	}
	if (language !== 'en') {
		return;
	}
	const { default: en } = await import('../locales/en/translation.json');
	i18n.addResourceBundle('en', 'translation', en, true, true);
	loadedLanguages.add(language);
}

void i18n
	.use(initReactI18next)
	.init({
		resources: {
			pt: { translation: pt },
		},
		lng: initialLanguage,
		fallbackLng: defaultLanguage,
		interpolation: { escapeValue: false },
	})
	.then(() => loadLanguageResources(initialLanguage));

// <html lang> determines how assistive technology pronounces the page —
// it needs to track the content's actual language, not stay fixed at
// whatever index.html shipped with. Applied on startup and on every
// language change in SettingsPage (i18next.changeLanguage always fires
// this event, even for the already-active language).
function syncDocumentLanguage(language: string): void {
	document.documentElement.lang = language;
}
syncDocumentLanguage(i18n.language);
i18n.on('languageChanged', syncDocumentLanguage);

export default i18n;
