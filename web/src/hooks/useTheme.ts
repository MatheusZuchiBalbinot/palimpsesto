import { useSyncExternalStore } from 'react';

import { getThemePreference, setThemePreference, subscribeTheme, type ThemePreference } from '../lib/theme';

export function useTheme(): [ThemePreference, (preference: ThemePreference) => void] {
	const preference = useSyncExternalStore(subscribeTheme, getThemePreference);
	return [preference, setThemePreference];
}
