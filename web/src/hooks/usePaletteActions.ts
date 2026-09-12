import { useSyncExternalStore } from 'react';

import { getPaletteActions, subscribePaletteActions, type PaletteAction } from '../lib/paletteActions';

export function usePaletteActions(): PaletteAction[] {
	return useSyncExternalStore(subscribePaletteActions, getPaletteActions);
}
