import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bundles web/index.html (the SPA entry) into web/dist via `vite build`.
//
// The browser talks to the SPA and the api on ONE origin: `/api/*` is forwarded
// by vite to the api. `server.proxy` serves `npm run dev`; `preview.proxy` serves
// the web container (`vite preview`). Both read the same target, so dev and the
// composed stack agree (sprint 001 QA-01). The default is the api on the host
// port; docker-compose sets API_PROXY_TARGET=http://api:3000 for the in-network name.
const apiProxy = {
  '/api': {
    target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
