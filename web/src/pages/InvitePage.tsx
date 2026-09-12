import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { joinInviteLink } from '../api/docs';
import { toInviteToken } from '../api/ids';
import { LinkButton } from '../components/Button';
import { useSession } from '../hooks/useSession';
import { translateError } from '../i18n/errors';
import { routes } from '../routes';

/** Landing page for a document's share link (`/invite/:token`): joins the
 * visitor as a member and redirects to the document. Requires a session —
 * an anonymous visitor is sent to /login first, with this same URL as the
 * redirect target, so they land back here right after. */
export function InvitePage() {
	const { t } = useTranslation();
	const { token } = useParams<{ token: string }>();
	const navigate = useNavigate();
	const session = useSession();
	const [error, setError] = useState<unknown>(null);
	const hasStartedJoin = useRef(false);

	useEffect(() => {
		if (!session || !token || hasStartedJoin.current) {
			return;
		}
		hasStartedJoin.current = true;

		joinInviteLink(toInviteToken(token))
			.then((doc) => navigate(routes.document(doc.id), { replace: true }))
			.catch(setError);
	}, [session, token, navigate]);

	// The router guarantees :token is present for this route.
	if (!token) {
		return <Navigate to={routes.vault} replace />;
	}

	if (!session) {
		const redirectTarget = `${routes.login}?redirect=${encodeURIComponent(routes.invite(token))}`;
		return <Navigate to={redirectTarget} replace />;
	}

	return (
		<div className="invite-landing" role="status">
			{error ? (
				<>
					<p className="form-error" role="alert">
						{translateError(t, error)}
					</p>
					<LinkButton to={routes.vault}>{t('invite.backToVault')}</LinkButton>
				</>
			) : (
				<p>{t('invite.joining')}</p>
			)}
		</div>
	);
}
