import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev server proxies /api to the EdunexusAI backend, so the browser makes same-origin
 * requests and CORS is not in the way during development. The API base URL can still be
 * overridden with VITE_API_BASE_URL (see .env.example) when pointing at a deployed API.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5001',
        changeOrigin: true,
      },
    },
    allowedHosts: [
      '7a30-2401-4900-bbaf-974f-690e-f9bc-c63b-88f1.ngrok-free.app',
      '55a5-2401-4900-8854-7817-838-afdf-2c6e-fd62.ngrok-free.app',
    ],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
