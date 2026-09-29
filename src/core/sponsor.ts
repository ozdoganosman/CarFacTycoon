import { costIndex } from '../data/economy';
import { yearFloat } from './time';
import type { GameState } from './types';
import { decide, log, money } from './util';
import { t } from '../i18n';

// Money for an advertisement the player chooses to watch (Android app only). In the game a sponsor
// pays for a mention: it is not turnover (no tax, no board target, no dealer's cut), only cash.

/** Weeks between two advertisements the player asks for. */
export const SPONSOR_COOLDOWN = 13;

/** Two significant figures: $2,600, $41 bin, $1.2 mn. */
function round2(v: number) {
  if (v <= 0) return 0;
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.round(v / p) * p;
}

/** One advertisement: half a week's turnover at the last quarter's pace, and never less than a small sum of the era. */
export function sponsorReward(s: GameState): number {
  const recent = s.finance.slice(-13);
  const weekly = recent.length ? recent.reduce((a, f) => a + f.revenue, 0) / recent.length : 0;
  return round2(Math.max(2500 * costIndex(yearFloat(s.week)), 0.5 * weekly));
}

/** Weeks until the player may ask for the next advertisement (0: now). */
export function sponsorWait(s: GameState): number {
  const last = s.sponsor?.lastWeek;
  return last === undefined ? 0 : Math.max(0, last + SPONSOR_COOLDOWN - s.week);
}

/** The year-end offer: half the year's tax bill, or one advertisement's pay if that is more. */
export function yearBonus(s: GameState, year: number): number {
  const bill = s.company.taxBill?.year === year ? s.company.taxBill.amount : 0;
  return round2(Math.max(sponsorReward(s), 0.5 * bill));
}

/** The year-end offer is open once per closed year, while its report is the latest. */
export function yearBonusOpen(s: GameState, year: number): boolean {
  return !s.gameOver && (s.sponsor?.lastYear ?? 0) < year && s.years.some((y) => y.year === year);
}

/** Pay for a watched advertisement. `year`: the year-end offer for that year; otherwise an advertisement asked for. */
export function paySponsor(s: GameState, year?: number): number {
  if (year === undefined ? sponsorWait(s) > 0 : !yearBonusOpen(s, year)) return 0;
  const amount = year === undefined ? sponsorReward(s) : yearBonus(s, year);
  const sp = (s.sponsor ??= { total: 0, count: 0 });
  if (year === undefined) sp.lastWeek = s.week;
  else sp.lastYear = year;
  sp.total += amount;
  sp.count++;
  s.company.cash += amount;
  log(s, t('Sponsor desteği: kasaya {amount} girdi.', { amount: money(amount) }), 'good');
  decide(s, 'sponsor', `Reklam izlendi${year === undefined ? '' : ` (${year} yıl sonu)`}: +${money(amount)}`);
  return amount;
}
