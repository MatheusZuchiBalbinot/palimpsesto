import { Check, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PASSWORD_MIN_LENGTH } from '../constants';
import { checkPasswordRequirements, type PasswordRequirementKey } from '../lib/passwordStrength';

const REQUIREMENT_ICON_SIZE = 12;

const REQUIREMENT_LABEL_KEY: Record<PasswordRequirementKey, string> = {
	length: 'auth.passwordReqLength',
	lowercase: 'auth.passwordReqLowercase',
	uppercase: 'auth.passwordReqUppercase',
	number: 'auth.passwordReqNumber',
	symbol: 'auth.passwordReqSymbol',
};

type PasswordRequirementsProps = {
	password: string;
};

/** Live checklist under the password field on account creation — the only
 * place a password's strength can ever be checked, since the server never
 * receives the raw password to validate it itself (see docs/CRYPTO.md). */
export function PasswordRequirements({ password }: Readonly<PasswordRequirementsProps>) {
	const { t } = useTranslation();
	const requirements = checkPasswordRequirements(password);
	return (
		<ul className="password-requirements">
			{requirements.map((requirement) => (
				<li
					key={requirement.key}
					className={`password-requirements__item${requirement.satisfied ? ' password-requirements__item--met' : ''}`}
				>
					{requirement.satisfied ? <Check size={REQUIREMENT_ICON_SIZE} /> : <Circle size={REQUIREMENT_ICON_SIZE} />}
					{t(REQUIREMENT_LABEL_KEY[requirement.key], { count: PASSWORD_MIN_LENGTH })}
				</li>
			))}
		</ul>
	);
}
