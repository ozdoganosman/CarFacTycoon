import { useEffect, useState } from 'react';

/** Colors that canvas-based visuals need. Read from CSS custom properties so light/dark themes stay in sync. */
export interface ThemeColors {
  bg: string;
  panel: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accent2: string;
  good: string;
  warn: string;
  bad: string;
  bp: string;
  bpLine: string;
  bpInk: string;
  metal: string;
  fire: string;
}

const KEYS: Record<keyof ThemeColors, string> = {
  bg: '--bg',
  panel: '--panel',
  ink: '--ink',
  muted: '--muted',
  line: '--line',
  accent: '--accent',
  accent2: '--accent2',
  good: '--good',
  warn: '--warn',
  bad: '--bad',
  bp: '--bp',
  bpLine: '--bp-line',
  bpInk: '--bp-ink',
  metal: '--metal',
  fire: '--fire',
};

export function readThemeColors(): ThemeColors {
  const out = {} as ThemeColors;
  const cs = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  for (const k of Object.keys(KEYS) as (keyof ThemeColors)[]) {
    out[k] = cs?.getPropertyValue(KEYS[k]).trim() || '#888';
  }
  return out;
}

/** Re-reads theme colors when the OS color scheme or the data-theme attribute changes. */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(() => readThemeColors());
  useEffect(() => {
    const update = () => setColors(readThemeColors());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', update);
      mo.disconnect();
    };
  }, []);
  return colors;
}
