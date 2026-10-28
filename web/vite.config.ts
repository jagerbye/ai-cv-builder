import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bundles web/index.html (the SPA entry) into web/dist via `vite build`.
export default defineConfig({
  plugins: [react()],
});
