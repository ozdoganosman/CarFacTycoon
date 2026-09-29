// The game's languages. Turkish is the source: every text is written in Turkish in the code and
// looked up in the chosen language's catalog (src/i18n/locales/<lang>.json) by a short hash of the
// Turkish text. A text missing from a catalog shows in Turkish.
//
//   t('Kasa')                                  → "Cash"
//   t('{n} araç sattın', { n: num(x) })        → "You sold 1,204 cars"
//   msg('Tasarım')                             marks a text in a table for translation; show it with t(value)
//
// Placeholders are {name}. A catalog entry can give plural forms instead of one text
// ({ one: "{n} car", other: "{n} cars" }); the form is chosen by the `n` parameter.
// Rich text (bold, colours) for the screens is in src/ui/i18n.tsx.

export type Lang = 'tr' | 'en' | 'de' | 'es' | 'hi' | 'ar' | 'qps';

export interface LangDef {
  id: Lang;
  /** The language's own name. */
  name: string;
  /** For numbers, dates and plural rules. */
  locale: string;
  rtl?: boolean;
  /** Only for checking the translation work (`?lang=qps`): every translated text shows in ⟦ ⟧. */
  hidden?: boolean;
}

export const LANGS: LangDef[] = [
  { id: 'tr', name: 'Türkçe', locale: 'tr-TR' },
  { id: 'en', name: 'English', locale: 'en-US' },
  { id: 'de', name: 'Deutsch', locale: 'de-DE' },
  { id: 'es', name: 'Español', locale: 'es-ES' },
  { id: 'hi', name: 'हिन्दी', locale: 'hi-IN' },
  { id: 'ar', name: 'العربية', locale: 'ar-u-nu-latn', rtl: true },
  { id: 'qps', name: 'Pseudo', locale: 'en-US', hidden: true },
];

export type Plural = Partial<Record<Intl.LDMLPluralRule, string>>;
export type Catalog = Record<string, string | Plural>;
export type Params = Record<string, string | number>;

let current: LangDef = LANGS[0];
let catalog: Catalog | null = null;
let plurals = new Intl.PluralRules(current.locale);

export const lang = (): Lang => current.id;
export const langDef = (): LangDef => current;
export const locale = (): string => current.locale;
export const isTurkish = () => current.id === 'tr';

export function langOf(id: string | null | undefined): LangDef | undefined {
  return LANGS.find((l) => l.id === id);
}

/** Switch language (the catalog comes from loadCatalog; none for Turkish). */
export function setLanguage(id: Lang, cat: Catalog | null) {
  current = langOf(id) ?? LANGS[0];
  catalog = current.id === 'tr' ? null : cat;
  plurals = new Intl.PluralRules(current.locale);
}

const keys = new Map<string, string>();

/** The catalog key of a Turkish text: FNV-1a (32 bit) in base 36. */
export function keyOf(src: string): string {
  let k = keys.get(src);
  if (k) return k;
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  k = (h >>> 0).toString(36);
  keys.set(src, k);
  return k;
}

function fill(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** The translated form of a catalog entry (plural forms by the `n` parameter). */
function pick(entry: string | Plural, params?: Params): string {
  if (typeof entry === 'string') return entry;
  const n = Number(params?.n ?? NaN);
  const form = Number.isFinite(n) ? plurals.select(n) : 'other';
  return entry[form] ?? entry.other ?? Object.values(entry)[0] ?? '';
}

/** The text in the player's language, with its {placeholders} filled in. */
export function t(src: string, params?: Params): string {
  if (current.id === 'tr' || !src) return fill(src, params);
  if (current.id === 'qps') return `⟦${fill(src, params)}⟧`;
  const entry = catalog?.[keyOf(src)];
  return fill(entry === undefined ? src : pick(entry, params), params);
}

/** The raw translated template (before placeholders), for rich text. */
export function template(src: string, params?: Params): string {
  if (current.id === 'tr' || !src) return src;
  if (current.id === 'qps') return `⟦${src}⟧`;
  const entry = catalog?.[keyOf(src)];
  return entry === undefined ? src : pick(entry, params);
}

/** Marks a literal for translation where it is written (a table); show it later with t(value). */
export const msg = <T extends string>(src: T): T => src;

/** A list read naturally in the language: "a, b ve c" / "a, b and c". */
export function list(items: string[]): string {
  if (items.length < 2) return items.join('');
  if (current.id === 'tr') return `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`;
  try {
    return new Intl.ListFormat(current.locale, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}
