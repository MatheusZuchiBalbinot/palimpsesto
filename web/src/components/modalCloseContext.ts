import { createContext, useContext } from 'react';

export const ModalCloseContext = createContext<() => void>(() => {});

/** Read from inside a modal's content — call it from a Cancel/Done button so
 * it closes with the same fade-out as clicking outside or pressing Escape,
 * instead of vanishing instantly.
 *
 * Separated from Modal.tsx so that file only exports components — mixing a
 * plain hook export into a component file breaks React Fast Refresh. */
export function useModalClose(): () => void {
	return useContext(ModalCloseContext);
}
