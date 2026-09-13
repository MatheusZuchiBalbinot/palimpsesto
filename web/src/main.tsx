import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Self-hosted (not Google Fonts' CDN) so the font payload ships from the
// same origin as everything else — no separate DNS/TLS/request round trip
// to fonts.googleapis.com + fonts.gstatic.com before text can render.
// EB Garamond isn't offered as a variable font, so only the specific
// weights/styles the app actually uses (see App.css's var(--font-serif)
// usages) are imported instead of every cut.
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/600.css';
import '@fontsource-variable/manrope/wght.css';
import './i18n/config';
import './lib/theme';
import './index.css';

import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</StrictMode>,
);
