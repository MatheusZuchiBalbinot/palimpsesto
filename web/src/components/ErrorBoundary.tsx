import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from './Button';

/** Split out as its own function component so it can use useTranslation()
 * (a class component can't) and, more importantly, move focus onto itself
 * when it mounts — without this, whatever had focus when the tree crashed
 * no longer exists, and a screen reader's virtual cursor stays parked on a
 * now-removed node instead of landing on the fallback that replaced it. */
function ErrorBoundaryFallback({ onReload }: Readonly<{ onReload: () => void }>) {
	const { t } = useTranslation();
	const cardRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		cardRef.current?.focus();
	}, []);

	return (
		<div className="error-boundary">
			<div className="error-boundary__card" ref={cardRef} tabIndex={-1}>
				<h1 className="text-lg">{t('errorBoundary.title')}</h1>
				<p className="text-sm text-secondary">{t('errorBoundary.body')}</p>
				<Button type="button" onClick={onReload}>
					{t('errorBoundary.reload')}
				</Button>
			</div>
		</div>
	);
}

type ErrorBoundaryProps = {
	children: ReactNode;
};

type ErrorBoundaryState = {
	hasCaughtError: boolean;
};

/** Catches a render-time crash anywhere in the tree below it and shows a
 * recoverable fallback instead of a blank page — the one thing a try/catch
 * can't do for React, since render errors don't propagate as normal
 * exceptions. Needs to be a class component: that's the one task function
 * components still can't do (there's no hook equivalent for
 * getDerivedStateFromError/componentDidCatch). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasCaughtError: false };

	static getDerivedStateFromError(): ErrorBoundaryState {
		return { hasCaughtError: true };
	}

	componentDidCatch(error: unknown, info: ErrorInfo): void {
		// There's no error-reporting backend yet — the console is the
		// honest, current ceiling for this.
		console.error('Uncaught render error', error, info.componentStack);
	}

	private handleReload = (): void => {
		window.location.reload();
	};

	// sonarjs/function-return-type flags returning `this.props.children` (a
	// broad ReactNode) alongside a JSX element as "inconsistent" — this is
	// the normal, correct shape of any React error boundary
	// render()/fallback pattern, not a bug to fix.
	// eslint-disable-next-line sonarjs/function-return-type
	render(): ReactNode {
		if (!this.state.hasCaughtError) {
			return this.props.children;
		}

		return <ErrorBoundaryFallback onReload={this.handleReload} />;
	}
}
