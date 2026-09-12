// i18next configuration. Imported once, for the side effect, before the
// app renders (see main.tsx) — nothing here is meant to be imported from
// its exports except by SettingsPage, which needs the storage key to
// persist the user's language choice across reloads.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../locales/en/translation.json';
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

void i18n.use(initReactI18next).init({
	resources: {
		pt: { translation: pt },
		en: { translation: en },
	},
	lng: detectInitialLanguage(),
	fallbackLng: defaultLanguage,
	interpolation: { escapeValue: false },
});

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
