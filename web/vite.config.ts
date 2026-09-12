import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Inside the dev container the backend is reached by its service name
// (compose handles internal DNS resolution); outside it, localhost.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],
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
});
