import { useTranslation } from 'react-i18next';

const PERCENT_MULTIPLIER = 100;

type DerivationProgressProps = {
	/** 0..1, or undefined before the first progress tick arrives. */
	fraction: number | undefined;
};

/** Shown while Argon2id derives the master key (auth/actions.ts) — this
 * genuinely and intentionally takes ~1s, so the UI should say what's
 * happening instead of just appearing frozen. */
export function DerivationProgress({ fraction }: Readonly<DerivationProgressProps>) {
	const { t } = useTranslation();
	const percent = Math.round((fraction ?? 0) * PERCENT_MULTIPLIER);

	return (
		<div className="derivation-progress" role="status" aria-live="polite">
			<div className="derivation-progress__label">{t('auth.derivingKey')}</div>
			<div className="derivation-progress__track">
				<div className="derivation-progress__fill" style={{ width: `${percent}%` }} />
			</div>
		</div>
	);
}
