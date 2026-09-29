import { money, num } from '../core/util';
import { pctWith } from '../core/turkish';
import { isTurkish, langDef, msg, t } from '../i18n';
import { dec, fmtPercent } from '../i18n/format';
import type { FinanceWeek, GameState } from '../core/types';

export { dec, money, num };

export const pct = (v: number, digits = 1) => fmtPercent(v, digits);

/** A share with the possessive suffix, read as Turkish: pctOf(0.06) → "%6’sı", pctOf(0.025, 1) → "%2,5’i". */
export const pctOf = (v: number, digits = 0) => pctWith(v, 'poss', digits);

export function signedMoney(v: number) {
  const s = `${v >= 0 ? '+' : ''}${money(v)}`;
  // Keep the sign with the amount in right-to-left text.
  return langDef().rtl ? `\u2066${s.replace(/[\u2066\u2069]/g, '')}\u2069` : s;
}

/** Profit over the last n recorded weeks. */
export function recentProfit(s: GameState, weeks = 4): number {
  const f = s.finance.slice(-weeks);
  if (!f.length) return 0;
  const total = f.reduce(
    (a, w) => a + w.revenue - w.materials - w.labor - w.salaries - w.dealers - w.marketing - w.rnd - w.warranty - w.interest - w.other,
    0,
  );
  return total / f.length;
}

export const kmh = (v: number) => t('{v} km/s', { v: Math.round(v) });
export const secs = (v: number | null) => (v === null || v >= 99 ? '—' : t('{v} sn', { v: dec(v, 1) }));
export const litres = (v: number) => t('{v} L/100km', { v: dec(v, 1) });

/** Turkish locative for a year, with vowel harmony and consonant assimilation: 1905’te, 1910’da, 1921’de. */
export function inYear(year: number): string {
  const n = Math.round(year);
  if (!isTurkish()) return String(n);
  const last = n % 10;
  const tens = n % 100;
  let word: 'de' | 'da' | 'te' | 'ta';
  if (last !== 0) word = (['de', 'de', 'te', 'te', 'te', 'da', 'de', 'de', 'da'] as const)[last - 1];
  else if (tens !== 0) word = ({ 10: 'da', 20: 'de', 30: 'da', 40: 'ta', 50: 'de', 60: 'ta', 70: 'te', 80: 'de', 90: 'da' } as const)[tens as 10]!;
  else word = 'de';
  return `${n}’${word}`;
}

/** Names of the cost lines in the books. */
export const COST_NAMES: Record<Exclude<keyof FinanceWeek, 'week' | 'revenue' | 'auto'>, string> = {
  materials: msg('Malzeme ve parça'),
  labor: msg('Hat işçiliği'),
  salaries: msg('Mühendis maaşları'),
  dealers: msg('Bayi ve servis ağı'),
  freight: msg('Nakliye (eyalet dışı)'),
  marketing: msg('Reklam ve fuar'),
  rnd: msg('Prototip, test ve Ar-Ge'),
  warranty: msg('Garanti ve geri çağırma'),
  interest: msg('Kredi faizi'),
  other: msg('Genel gider ve depo'),
  tax: msg('Kurumlar vergisi'),
  investment: msg('Yatırım (hat, kalıp, bayi)'),
  dividend: msg('Temettü ve hisse geri alımı'),
};
