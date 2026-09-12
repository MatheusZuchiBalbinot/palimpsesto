export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'palimpsesto:theme';
const VALID_PREFERENCES: ThemePreference[] = ['light', 'dark', 'system'];

let current: ThemePreference = readStored();
const listeners = new Set<() => void>();

function readStored(): ThemePreference {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored && (VALID_PREFERENCES as string[]).includes(stored)) {
			return stored as ThemePreference;
		}
	} catch {
		// Private mode / storage disabled: falls back to system.
	}
	return 'system';
}

function applyToDocument(preference: ThemePreference) {
	const root = document.documentElement;
	if (preference === 'system') {
		delete root.dataset.theme;
	} else {
		root.dataset.theme = preference;
	}
}

// Applied immediately on module load (not from a React effect) so there's
// no flash of the wrong theme while the app starts up.
applyToDocument(current);

export function getThemePreference(): ThemePreference {
	return current;
}

export function setThemePreference(preference: ThemePreference) {
	current = preference;
	applyToDocument(preference);
	try {
		localStorage.setItem(STORAGE_KEY, preference);
	} catch {
		// The choice just doesn't survive a reload — not worth failing over.
	}
	listeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
