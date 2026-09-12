import { createContext, useContext } from 'react';

export const ModalTitleContext = createContext<string | undefined>(undefined);

/** The id Modal generated for this dialog's `aria-labelledby` — put it on
 * whatever element renders the modal's `.modal-title` text, so the dialog
 * has an accessible name instead of announcing as an unlabeled "dialog".
 *
 * Separated from Modal.tsx so that file only exports components — mixing a
 * plain hook export into a component file breaks React Fast Refresh. */
export function useModalTitleId(): string | undefined {
	return useContext(ModalTitleContext);
}
