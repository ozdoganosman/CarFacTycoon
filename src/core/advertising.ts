import { adShare, adWeight } from '../data/economy';
import { yearFloat } from './time';
import type { GameState } from './types';

// National advertising in the age of magazines, radio and television (data/economy adShare, adWeight).
//
// A maker of any size is expected to spend a share of its revenue on advertising, a share that grows
// with the era. A brand that spends less is slowly forgotten: its reputation heads lower. One that
// spends more keeps a better name, with less and less for each extra dollar. The money does not come
// back: it is what keeping a name costs.

/** Revenue a week over the last half year. */
export function weeklyRevenue(s: GameState): number {
  const f = s.finance.slice(-26);
  return f.length ? f.reduce((a, w) => a + w.revenue, 0) / f.length : 0;
}

/** What a maker of the company's size spends on national advertising a week in this era. */
export const adNorm = (s: GameState, yf = yearFloat(s.week)) => adShare(yf) * weeklyRevenue(s);

/** The advertising budget against the era's usual (1 = as much as a maker of this size spends, and before the first sales). */
export function adRatio(s: GameState, yf = yearFloat(s.week)): number {
  const norm = adNorm(s, yf);
  return norm > 0 ? (s.markets.usa?.adBudget ?? 0) / norm : 1;
}

/**
 * Reputation points advertising adds to where reputation is heading (negative: the brand is being
 * forgotten). None before mass advertising; at the era's usual nothing either way; silent, the whole
 * of adWeight off; at twice the usual three tenths of it on, at most three fifths.
 */
export const adBrandTerm = (s: GameState, yf = yearFloat(s.week)) => adTermAt(adRatio(s, yf), yf);

/** Levels the budget can be kept at: the era's usual, or twice or three times it (a better name for the money). */
export const AD_LEVELS = [1, 2, 3] as const;

/** Reputation points advertising at `level` times the era's usual adds to where reputation is heading. */
export function adTermAt(level: number, yf: number): number {
  const w = adWeight(yf);
  return w <= 0 ? 0 : level >= 1 ? 0.6 * w * (1 - 1 / level) : -w * (1 - Math.sqrt(Math.max(0, level)));
}

/** With the budget left to the company: keep it at its level of the era's usual. */
export function followAdNorm(s: GameState, yf = yearFloat(s.week)) {
  const ms = s.markets.usa;
  if (ms?.adLevel) ms.adBudget = Math.round(ms.adLevel * adNorm(s, yf));
}
