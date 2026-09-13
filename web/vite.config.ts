import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Inside the dev container the backend is reached by its service name
// (compose handles internal DNS resolution); outside it, localhost.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],
	build: {
		// Separate .map files, fetched by a browser's devtools only when
		// open — never inlined into what ships to a normal visitor. Without
		// this, a production error is unreadable minified output instead of
		// the real file/line (Lighthouse's best-practices audit flags the
		// absence of source maps for exactly this reason).
		sourcemap: true,
		rollupOptions: {
			output: {
				// Without this, React/ReactDOM/React Router/i18next end up
				// bundled into the same chunk as the app's own code — a commit
				// that only touches app code still forces every visitor to
				// re-download all of it, since it's one file with one content
				// hash. These barely change between our own releases, so
				// splitting them out lets a returning visitor's browser keep
				// serving them from cache across a deploy that only actually
				// changed app code (see VITE_BUILD_PLAN.md).
				//
				// Deliberately narrow — only the packages every route already
				// needs eagerly (App.tsx itself). CodeMirror/Yjs/the crypto
				// libs stay out: Rollup already scopes those correctly into
				// DocumentPage's own lazy chunk (see App.tsx's React.lazy calls),
				// and a blanket "everything in node_modules" rule would undo
				// that by forcing them into this always-loaded chunk instead.
				manualChunks(id: string) {
					const eagerVendor = ['/react/', '/react-dom/', '/react-router-dom/', '/i18next/', '/react-i18next/'];
					if (eagerVendor.some((pkg) => id.includes(`/node_modules${pkg}`))) {
						return 'vendor';
					}
				},
			},
		},
	},
	server: {
		host: true, // listens on 0.0.0.0 — needed to be reachable from outside the container
		// 'web' is this container's service name on the compose network — other
		// containers on the same network (e.g. a headless browser doing visual
		// verification) can only reach this dev server through that hostname,
		// and Vite's default DNS-rebinding guard would reject the Host header
		// for not recognizing the name. Safe to add: it's only resolvable
		// inside the compose network, never exposed outside it.
		allowedHosts: ['web'],
		proxy: {
			// Shorthand string form only proxies plain HTTP — a WebSocket upgrade
			// request (GET /api/ws) falls through un-proxied and the browser sees
			// the connection close instantly. `ws: true` makes this same proxy
			// also forward the Upgrade handshake to the backend.
			'/api': { target: apiTarget, ws: true },
			'/healthz': apiTarget,
		},
	},
	// `vite preview` serves the real production build (minified, bundled) —
	// unlike the dev server, whose thousands of unbundled ES module requests
	// make tools like Lighthouse report meaningless multi-second paint times.
	// Mirrors `server` above (same host/allowedHosts/proxy need) so a
	// production build can be smoke-tested or audited the same way, on its
	// own port so it can run alongside the dev server.
	preview: {
		host: true,
		port: 4173,
		allowedHosts: ['web'],
		proxy: {
			'/api': { target: apiTarget, ws: true },
			'/healthz': apiTarget,
		},
	},
});
