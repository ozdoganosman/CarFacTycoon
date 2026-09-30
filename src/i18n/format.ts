import { lang, langDef, locale } from './index';

// Numbers, money, shares and dates in the player's language. Turkish keeps the game's short forms
// ("$1,25 mn", "$41 bin", "%12,5") with the Turkish decimal comma; the other languages use their own conventions.

/** Short money units: thousand, million, billion. */
const UNITS: Record<string, [string, string, string]> = {
  tr: [' bin', ' mn', ' mr'],
  en: ['K', 'M', 'B'],
  qps: ['K', 'M', 'B'],
  de: [' Tsd.', ' Mio.', ' Mrd.'],
  es: [' mil', ' M', ' mil M'],
  // Hindi: the Latin units Indian apps use for dollars; "मिलियन" does not fit the game's cards.
  hi: ['K', 'M', 'B'],
  // Arabic: the Latin units, kept left-to-right as one piece inside the right-to-left text.
  ar: ['K', 'M', 'B'],
};

/** Left-to-right isolate around money in right-to-left languages, so "+$841K" never turns into "$841+K". */
const ltr = (s: string) => (langDef().rtl ? `\u2066${s}\u2069` : s);

const formatters = new Map<string, Intl.NumberFormat>();
function nf(digits: number, style: 'decimal' | 'percent' = 'decimal'): Intl.NumberFormat {
  const key = `${locale()}|${digits}|${style}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale(), { style, minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(key, f);
  }
  return f;
}

/** A number with the language's digit grouping and decimal mark. */
export function fmtNumber(v: number, digits = 0): string {
  return nf(digits).format(digits ? v : Math.round(v));
}

/** A number with a fixed count of decimals, in the language's own form ("89,0" in Turkish and German, "89.0" in English). */
export const dec = (v: number, digits = 1): string => fmtNumber(v, digits);

/** Dollars, shortened: $2,600 · $41K · $1.25M · $3.10B. */
export function fmtMoney(v: number): string {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  const l = lang();
  const [k, m, b] = UNITS[l] ?? UNITS.en;
  if (l === 'tr') {
    if (a >= 1e9) return `${sign}$${fmtNumber(a / 1e9, 2)}${b}`;
    if (a >= 1e6) return `${sign}$${fmtNumber(a / 1e6, 2)}${m}`;
    if (a >= 1e4) return `${sign}$${Math.round(a / 1000)}${k}`;
    return `${sign}$${Math.round(a).toLocaleString('tr-TR')}`;
  }
  if (a >= 1e9) return ltr(`${sign}$${fmtNumber(a / 1e9, 2)}${b}`);
  if (a >= 1e6) return ltr(`${sign}$${fmtNumber(a / 1e6, 2)}${m}`);
  if (a >= 1e4) return ltr(`${sign}$${fmtNumber(a / 1000)}${k}`);
  return ltr(`${sign}$${fmtNumber(a)}`);
}

/** A share as a percentage: 0.125 → "%12,5" (Turkish), "12.5%" (English), "12,5 %" (German). */
export function fmtPercent(share: number, digits = 1): string {
  if (lang() === 'tr') return `%${fmtNumber(share * 100, digits)}`;
  return nf(digits, 'percent').format(share);
}

const months = new Map<string, string[]>();
/** The month names of the language. */
export function monthNames(): string[] {
  const l = locale();
  let list = months.get(l);
  if (!list) {
    const f = new Intl.DateTimeFormat(l, { month: 'long', timeZone: 'UTC' });
    list = Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2001, i, 15))));
    list = list.map((s) => s.charAt(0).toLocaleUpperCase(l) + s.slice(1));
    months.set(l, list);
  }
  return list;
}

/** "July 1928", "Juli 1928", "julio de 1928"... */
export function fmtMonthYear(month: number, year: number): string {
  const f = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
  // Years before 1970 as plain calendar dates; the day does not matter.
  const d = new Date(Date.UTC(2001, month, 15));
  d.setUTCFullYear(year);
  const s = f.format(d);
  return s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1);
}

/** Axis label: "Mar '08". */
export function fmtShortMonth(month: number, year: number): string {
  const f = new Intl.DateTimeFormat(locale(), { month: 'short', timeZone: 'UTC' });
  const m = f.format(new Date(Date.UTC(2001, month, 15))).replace(/\.$/, '');
  return `${m} '${String(year).slice(2)}`;
}
