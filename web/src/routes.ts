// Every route in the app, in one place. Pages import from here instead of
// hardcoding path strings — a path is typed once, so renaming a route or
// changing its shape can't slip past unnoticed at any call site.
const VAULT = '/docs';

/** Path patterns, for <Route path=...> definitions (react-router's `:id`
 * placeholder syntax). */
export const routePatterns = {
	root: '/',
	login: '/login',
	register: '/register',
	vault: VAULT,
	document: `${VAULT}/:id`,
	documentHistory: `${VAULT}/:id/history`,
	settings: '/settings',
	invite: '/invite/:token',
} as const;

/** Concrete paths and builders, for navigate()/<Link to=.../<LinkButton to=...>. */
export const routes = {
	login: routePatterns.login,
	register: routePatterns.register,
	vault: routePatterns.vault,
	settings: routePatterns.settings,
	document: (id: string) => `${VAULT}/${id}`,
	documentHistory: (id: string) => `${VAULT}/${id}/history`,
	invite: (token: string) => `/invite/${token}`,
} as const;

/** Carries the `?redirect=` param from a login/register page over to the
 * other auth page — so someone who arrived via an invite link and doesn't
 * have an account yet lands back on the invite after registering, not on
 * the empty vault. */
export function withRedirectParam(path: string, searchParams: URLSearchParams): string {
	const redirect = searchParams.get('redirect');
	if (!redirect) {
		return path;
	}
	return `${path}?redirect=${encodeURIComponent(redirect)}`;
}
