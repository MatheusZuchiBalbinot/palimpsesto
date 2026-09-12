// In-memory session state, shared between React components (via
// useSession, a useSyncExternalStore hook) and the fetch interceptor in
// api/http.ts. Deliberately not persisted to localStorage — an access
// token surviving a page reload isn't worth the extra XSS exposure; the
// httpOnly refresh cookie is what actually survives a reload, via a
// silent refresh.
import type { AuthUser } from '../api/authTypes';

export type Session = {
	accessToken: string;
	user: AuthUser;
};

type Listener = () => void;

let current: Session | null = null;
const listeners = new Set<Listener>();

export function getSession(): Session | null {
	return current;
}

export function setSession(session: Session): void {
	current = session;
	notify();
}

export function clearSession(): void {
	current = null;
	notify();
}

export function subscribeSession(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function notify(): void {
	for (const listener of listeners) {
		listener();
	}
}
