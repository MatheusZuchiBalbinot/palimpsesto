import { SIGIL_SIZE_DEFAULT } from '../constants';
import { sigilFromHash } from '../crypto/sigil';

type SigilProps = {
	/** The raw hash to derive the glyph from — the output of identityHash for
	 * a user sigil, or SHA-256(DEK_epoch) for a document sigil
	 * (docs/CRYPTO.md). Not the formatted fingerprint string. */
	hash: Uint8Array;
	size?: number;
};

const GRID_SIZE = 5;
const CELL_GAP = 0.08;

/** Renders the deterministic glyph that docs/CRYPTO.md calls "the sigil" —
 * see crypto/sigil.ts for how the grid is derived. Purely a visual
 * comparison aid (two people eyeball whether their sigils match) — the
 * equivalent identity info is always given as text right next to it (the
 * fingerprint in IdentityCard/KeyChangeWarning, the hint copy in
 * DocumentSigil), so this is hidden from screen readers instead of
 * announcing a hardcoded Portuguese "sigilo" that never went through
 * i18n and described nothing useful on its own. */
export function Sigil({ hash, size = SIGIL_SIZE_DEFAULT }: Readonly<SigilProps>) {
	const { cells, color } = sigilFromHash(hash);
	const cellSize = 1 / GRID_SIZE;

	return (
		<svg width={size} height={size} viewBox="0 0 1 1" aria-hidden="true" className="sigil">
			<rect width="1" height="1" fill="var(--bg-hover-strong)" rx="0.06" />
			{cells.map((row, rowIndex) =>
				row.map((filled, colIndex) =>
					filled ? (
						<rect
							key={`${rowIndex}-${colIndex}`}
							x={colIndex * cellSize + CELL_GAP / 2}
							y={rowIndex * cellSize + CELL_GAP / 2}
							width={cellSize - CELL_GAP}
							height={cellSize - CELL_GAP}
							fill={color}
						/>
					) : null,
				),
			)}
		</svg>
	);
}
