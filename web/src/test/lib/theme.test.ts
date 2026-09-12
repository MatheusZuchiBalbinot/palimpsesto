import { afterEach, describe, expect, it } from 'vitest';

import { getThemePreference, setThemePreference, subscribeTheme } from '../../lib/theme';

afterEach(() => {
	setThemePreference('system');
});

describe('theme store', () => {
	it('defaults to system when nothing is stored', () => {
		expect(getThemePreference()).toBe('system');
		expect(document.documentElement.dataset.theme).toBeUndefined();
	});

	it('applies an explicit preference to the document and persists it', () => {
		setThemePreference('dark');

		expect(getThemePreference()).toBe('dark');
		expect(document.documentElement.dataset.theme).toBe('dark');
		expect(localStorage.getItem('palimpsesto:theme')).toBe('dark');
	});

	it('clears the attribute when switching back to system', () => {
		setThemePreference('light');
		setThemePreference('system');

		expect(document.documentElement.dataset.theme).toBeUndefined();
	});

	it('notifies subscribers on change', () => {
		let didNotify = false;
		const unsubscribe = subscribeTheme(() => {
			didNotify = true;
		});

		setThemePreference('dark');
		unsubscribe();

		expect(didNotify).toBe(true);
	});
});
