import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ErrorBoundary } from './components/ErrorBoundary';
import { LockScreen } from './components/LockScreen';
import { RequireSession } from './components/RequireSession';
import { SkipLink } from './components/SkipLink';
import { ToastHost } from './components/ToastHost';
import { TooltipProvider } from './components/Tooltip';
import { useAutoLock } from './hooks/useAutoLock';
import { useAutoLockWatcher } from './hooks/useAutoLockWatcher';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { routePatterns, routes } from './routes';

import './App.css';

// Code-split everything behind a session — DocumentPage alone pulls in
// CodeMirror + Yjs, by far the heaviest part of the bundle. Login/Register
// stay eager: they're the first thing an unauthenticated visitor needs, and
// splitting them from each other wouldn't meaningfully shrink that initial
// load anyway.
const DocumentPage = lazy(() => import('./pages/DocumentPage').then((m) => ({ default: m.DocumentPage })));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const InvitePage = lazy(() => import('./pages/InvitePage').then((m) => ({ default: m.InvitePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function App() {
	useAutoLockWatcher();
	const { isLocked } = useAutoLock();

	return (
		<ErrorBoundary>
			<TooltipProvider>
				<SkipLink />
				<Suspense fallback={null}>
					<Routes>
						<Route path={routePatterns.root} element={<Navigate to={routes.vault} replace />} />
						<Route path={routePatterns.login} element={<LoginPage />} />
						<Route path={routePatterns.register} element={<RegisterPage />} />
						<Route path={routePatterns.invite} element={<InvitePage />} />
						<Route element={<RequireSession />}>
							<Route path={routePatterns.vault} element={<DocumentsPage />} />
							<Route path={routePatterns.document} element={<DocumentPage />} />
							<Route path={routePatterns.documentHistory} element={<HistoryPage />} />
							<Route path={routePatterns.settings} element={<SettingsPage />} />
						</Route>
					</Routes>
				</Suspense>

				<ToastHost />
				{isLocked ? <LockScreen /> : null}
			</TooltipProvider>
		</ErrorBoundary>
	);
}

export default App;
