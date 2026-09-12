import { Navigate, Route, Routes } from 'react-router-dom';

import { ErrorBoundary } from './components/ErrorBoundary';
import { LockScreen } from './components/LockScreen';
import { RequireSession } from './components/RequireSession';
import { SkipLink } from './components/SkipLink';
import { ToastHost } from './components/ToastHost';
import { TooltipProvider } from './components/Tooltip';
import { useAutoLock } from './hooks/useAutoLock';
import { useAutoLockWatcher } from './hooks/useAutoLockWatcher';
import { DocumentPage } from './pages/DocumentPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { HistoryPage } from './pages/HistoryPage';
import { InvitePage } from './pages/InvitePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SettingsPage } from './pages/SettingsPage';
import { routePatterns, routes } from './routes';

import './App.css';

function App() {
	useAutoLockWatcher();
	const { isLocked } = useAutoLock();

	return (
		<ErrorBoundary>
			<TooltipProvider>
				<SkipLink />
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
				<ToastHost />
				{isLocked ? <LockScreen /> : null}
			</TooltipProvider>
		</ErrorBoundary>
	);
}

export default App;
