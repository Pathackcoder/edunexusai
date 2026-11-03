import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev server proxies /api to the EdunexusAI backend, so the browser makes same-origin
 * requests and CORS is not in the way during development. The API base URL can still be
 * overridden with VITE_API_BASE_URL (see .env.example) when pointing at a deployed API.
 */
/**
 * Dependencies imported only from lazily loaded code (Studio editor, rich text, Markdown
 * conversion). Pre-bundling them at startup stops Vite from discovering them mid-session and
 * re-optimizing with a new hash, which would load a second copy of React into an open page
 * ("Invalid hook call" / "Cannot read properties of null (reading 'useContext')").
 */
const LAZY_DEPS = [
  '@puckeditor/core',
  '@emotion/cache',
  'react-markdown',
  'react-dom/server',
  '@tiptap/core',
  '@tiptap/pm/history',
  '@tiptap/extension-document',
  '@tiptap/extension-paragraph',
  '@tiptap/extension-text',
  '@tiptap/extension-heading',
  '@tiptap/extension-bold',
  '@tiptap/extension-italic',
  '@tiptap/extension-underline',
  '@tiptap/extension-strike',
  '@tiptap/extension-link',
  '@tiptap/extension-list',
  '@tiptap/extension-blockquote',
  '@tiptap/extension-hard-break',
  '@tiptap/extension-horizontal-rule',
  '@tiptap/extension-text-align',
  // Used only by the lazily loaded public site (/visit).
  '@mui/material/Accordion',
  '@mui/material/AccordionSummary',
  '@mui/material/AccordionDetails',
];

export default defineConfig({
  plugins: [react()],
  // A second dev server (e.g. on another port) can use its own cache so the two never
  // rewrite each other's pre-bundled dependencies: VITE_CACHE_DIR=node_modules/.vite-5181
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  optimizeDeps: {
    include: LAZY_DEPS,
  },
  server: {
    port: 5173,
    host: true,
    // The repository-level `shared/` folder (presets used by both the API and the UI).
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../shared'] },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5001',
        changeOrigin: true,
      },
      // Portal chat: Socket.IO on the same backend (WebSocket upgrade, with long-polling fallback).
      '/socket.io': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5001',
        changeOrigin: true,
        ws: true,
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
