import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const EXTRAS = 'virtual:app-extras';

/**
 * The Android app build (`--mode app`, wrapped by Capacitor): fonts bundled instead of
 * loaded from Google, no pinch zoom, drawn edge to edge, and the app-only styles
 * (src/native). In the other builds the virtual module is empty.
 */
function appExtras(app: boolean): Plugin {
  return {
    name: 'app-extras',
    resolveId: (id) => (id === EXTRAS ? `\0${EXTRAS}` : null),
    load: (id) => (id === `\0${EXTRAS}` ? (app ? "import '/src/native/fonts.css';\nimport '/src/native/native.css';\n" : 'export {};\n') : null),
    transformIndexHtml: app
      ? (html) =>
          html
            .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>/g, '')
            .replace(/\s*<link\s+href="https:\/\/fonts\.googleapis\.com\/css2[^>]*>/, '')
            .replace(
              'content="width=device-width, initial-scale=1.0"',
              'content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"',
            )
      : undefined,
  };
}

// `--mode single` builds one self-contained HTML file (easy to share / host anywhere).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), appExtras(mode === 'app'), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : mode === 'app' ? 'dist-app' : 'dist',
    // Older phones and browsers too (the default asks for 2022-23 browsers): Android 7 WebViews
    // that were never updated, Safari 14. New browser functions are avoided in the code itself
    // (tests/oldBrowsers.test.ts).
    target: ['es2020', 'chrome87', 'edge88', 'firefox78', 'safari14'],
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
