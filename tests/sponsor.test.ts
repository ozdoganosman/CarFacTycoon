import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import { SPONSOR_COOLDOWN, paySponsor, sponsorReward, sponsorWait, yearBonus, yearBonusOpen } from '../src/core/sponsor';
import { weekFor } from '../src/core/time';
import { AD_POLICY, AdClock } from '../src/ui/adPolicy';
import { deserialize, serialize } from '../src/core/save';

const game = (year = 1900) => {
  const s = newGame({ companyName: 'Test', seed: 4 });
  s.modals = [];
  s.week = weekFor(year);
  return s;
};

const withRevenue = (s: ReturnType<typeof game>, weekly: number) => {
  s.finance = Array.from({ length: 13 }, (_, i) => ({
    week: s.week - 13 + i,
    revenue: weekly,
    materials: 0,
    labor: 0,
    salaries: 0,
    dealers: 0,
    marketing: 0,
    rnd: 0,
    warranty: 0,
    interest: 0,
    other: 0,
    investment: 0,
    tax: 0,
  }));
};

describe('sponsor money for a watched advertisement', () => {
  it('a small workshop gets a small era sum, a big maker half a week of turnover', () => {
    const small = game(1901);
    const r = sponsorReward(small);
    expect(r).toBeGreaterThan(1000);
    expect(r).toBeLessThan(small.company.cash * 0.2);
    const big = game(1928);
    withRevenue(big, 2e6);
    expect(sponsorReward(big)).toBeCloseTo(1e6, -4);
  });

  it('pays once a quarter, as cash and not as turnover', () => {
    const s = game(1905);
    withRevenue(s, 10000);
    const cash = s.company.cash;
    const revenue = s.finance.reduce((a, f) => a + f.revenue, 0);
    const paid = paySponsor(s);
    expect(paid).toBeGreaterThan(0);
    expect(s.company.cash).toBe(cash + paid);
    expect(s.finance.reduce((a, f) => a + f.revenue, 0)).toBe(revenue);
    // Not again until the quarter is out.
    expect(sponsorWait(s)).toBe(SPONSOR_COOLDOWN);
    expect(paySponsor(s)).toBe(0);
    s.week += SPONSOR_COOLDOWN;
    expect(sponsorWait(s)).toBe(0);
    expect(paySponsor(s)).toBeGreaterThan(0);
    expect(s.sponsor?.count).toBe(2);
  });

  it('the year-end offer: half the tax bill when that is more, once per closed year', () => {
    const s = game(1921);
    withRevenue(s, 10000);
    s.years.push({ year: 1920, revenue: 1e6, profit: 2e5, unitsSold: 500, shareByMarket: { usa: 0.01, europe: 0 }, cashEnd: 0, costs: {} as never });
    s.company.taxBill = { year: 1920, amount: 60000 };
    expect(yearBonusOpen(s, 1920)).toBe(true);
    expect(yearBonus(s, 1920)).toBe(30000);
    expect(paySponsor(s, 1920)).toBe(30000);
    expect(yearBonusOpen(s, 1920)).toBe(false);
    expect(paySponsor(s, 1920)).toBe(0);
    // The year-end offer does not use up the quarter's advertisement.
    expect(sponsorWait(s)).toBe(0);
  });

  it('survives a save', () => {
    const s = game(1905);
    paySponsor(s);
    const back = deserialize(serialize(s));
    expect(back.sponsor).toEqual(s.sponsor);
    expect(sponsorWait(back)).toBe(SPONSOR_COOLDOWN);
  });
});

describe('when a full-screen advertisement may appear', () => {
  it('not in the first minutes, and not soon after another', () => {
    const t0 = 1_000_000;
    const c = new AdClock(t0);
    expect(c.canInterstitial(t0 + 60_000)).toBe(false);
    expect(c.canInterstitial(t0 + AD_POLICY.warmup)).toBe(true);
    c.shown(t0 + AD_POLICY.warmup);
    expect(c.canInterstitial(t0 + AD_POLICY.warmup + 60_000)).toBe(false);
    expect(c.canInterstitial(t0 + AD_POLICY.warmup + AD_POLICY.gap)).toBe(true);
  });

  it('the year-end countdown starts by itself only now and then', () => {
    const t0 = 0;
    const c = new AdClock(t0);
    const t = AD_POLICY.warmup + 1;
    expect(c.canAutoYearOffer(t)).toBe(true);
    c.yearOffered(t);
    expect(c.canAutoYearOffer(t + 60_000)).toBe(false);
    expect(c.canAutoYearOffer(t + AD_POLICY.yearOfferGap)).toBe(true);
  });
});
