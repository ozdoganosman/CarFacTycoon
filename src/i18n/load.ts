import { LANGS, langDef, langOf, setLanguage, type Catalog, type Lang } from './index';

// Which language the game opens in, and loading its catalog (each language is its own chunk).

const LOADERS = import.meta.glob<{ default: Catalog }>('./locales/*.json');
const KEY = 'carfactycoon.lang';

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** `?lang=` in the address (checks, screenshots), then the player's choice, then the device's language. */
export function chosenLang(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (langOf(q)) return q as Lang;
  } catch {
    /* no address */
  }
  const s = stored(KEY);
  if (langOf(s)) return s as Lang;
  // Someone already playing before the game had languages played it in Turkish.
  if (stored('carfactycoon.save.v1')) return 'tr';
  const device = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]);
  for (const d of device) {
    const found = LANGS.find((l) => !l.hidden && l.id === d?.toLowerCase().split('-')[0]);
    if (found) return found.id;
  }
  return 'en';
}

/** Remember the player's choice (the game reloads to switch). */
export function saveLang(id: Lang) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable: this session only */
  }
}

export async function loadLanguage(id: Lang): Promise<void> {
  let cat: Catalog | null = null;
  const load = LOADERS[`./locales/${id}.json`];
  if (load && id !== 'tr' && id !== 'qps') {
    try {
      cat = (await load()).default;
    } catch {
      cat = null;
    }
  }
  setLanguage(id, cat);
  if (typeof document !== 'undefined') {
    const d = langDef();
    document.documentElement.lang = d.id === 'qps' ? 'en' : d.id;
    document.documentElement.dir = d.rtl ? 'rtl' : 'ltr';
    document.documentElement.classList.toggle('rtl', !!d.rtl);
  }
}
