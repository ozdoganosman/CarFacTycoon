import { StrictMode } from 'react';
import { Capacitor } from '@capacitor/core';
import 'virtual:app-extras';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import { applyTheme } from './ui/screens/Settings';
import { store } from './ui/store';
import { deserialize, serialize } from './core/save';
import { recordError } from './core/util';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { initSync } from './ui/claudeLink';

try {
  const t = localStorage.getItem('carfactycoon.theme');
  if (t === 'light' || t === 'dark') applyTheme(t);
} catch {
  /* storage unavailable: follow the OS theme */
}

// When the page is hosted where it can be updated while open, hand the running
// game over to the new version instead of dropping the player back to the menu.
interface HotHost {
  snapshot?: (fn: () => unknown) => void;
  ready?: (start: (data: unknown) => void) => void;
  data?: unknown;
}
const hot = (window as unknown as { claude?: { hot?: HotHost } }).claude?.hot;
hot?.snapshot?.(() => (store.state ? { save: serialize(store.state) } : {}));

// Keep errors that escape the game loop for the bug report.
window.addEventListener('error', (e) => store.state && recordError(store.state, 'window', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => store.state && recordError(store.state, 'promise', e.reason));

function start(data: unknown) {
  const save = (data as { save?: string } | undefined)?.save;
  if (save) {
    try {
      store.load(deserialize(save));
    } catch {
      /* incompatible snapshot: start from the menu */
    }
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
void initSync();
// Inside the Android app: back button, background pause, splash (src/native).
if (Capacitor.isNativePlatform()) void import('./native/native').then((m) => m.initNative());
