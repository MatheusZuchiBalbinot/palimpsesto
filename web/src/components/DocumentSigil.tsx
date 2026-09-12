import { useTranslation } from 'react-i18next';

import { documentDEKHash } from '../crypto/documentCipher';
import { useDelayedVisibility } from '../hooks/useDelayedVisibility';
import { Sigil } from './Sigil';

type DocumentSigilProps = {
	dek: Uint8Array;
};

/** The document's own sigil (docs/CRYPTO.md: SHA-256(DEK), the same glyph
 * renderer as a user's identity sigil) — replaces the old static "Private"
 * badge with something two collaborators can actually compare to confirm
 * they both hold the same key. */
export function DocumentSigil({ dek }: Readonly<DocumentSigilProps>) {
	const { t } = useTranslation();
	const { isOpen, isRendered, open: openPopover, close: closePopover } = useDelayedVisibility();

	const hash = documentDEKHash(dek);

	return (
		<div className="document-sigil" onMouseEnter={openPopover} onMouseLeave={closePopover}>
			<span className="badge badge--accent">
				<span className="dot dot--accent" />
				{t('editor.private')}
			</span>

			{isRendered ? (
				<div className={`document-sigil__panel${isOpen ? ' open' : ''}`}>
					<Sigil hash={hash} size={64} />
					<p className="document-sigil__hint">{t('editor.sigilHint')}</p>
				</div>
			) : null}
		</div>
	);
}
