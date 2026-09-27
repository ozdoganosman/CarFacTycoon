import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import { applyTheme } from './ui/screens/Settings';

try {
  const t = localStorage.getItem('carfactycoon.theme');
  if (t === 'light' || t === 'dark') applyTheme(t);
} catch {
  /* storage unavailable: follow the OS theme */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
