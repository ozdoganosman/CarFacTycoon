import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { emptyLine, lineReport, lineUpkeep, planBalancedLine, turnkeyLineCost, workshopLineCost } from '../src/core/factory';
import { newGame, tick } from '../src/core/game';
import { priceNow, referencePrice, rivalReputation, rivalScores, segmentMarket } from '../src/core/market';
import * as N from '../src/core/network';
import { ledSegments } from '../src/core/rivalMoves';
import { researchCost, researchDef } from '../src/core/research';
import { buybackCost, goPublic } from '../src/core/shares';
import { weekFor, yearFloat } from '../src/core/time';
import type { YearSummary } from '../src/core/types';
import { COST_KEYS } from '../src/core/game';
import { DEALER_COMMISSION, costIndex } from '../src/data/economy';
import { eraReference } from '../src/core/scoring';
import { recentProfit } from '../src/ui/format';
import { techIssue } from '../src/core/news';

// Fixes from the cf381f6 playtest: a class price that pays, a way for a small maker to grow,
// prices that follow their class, a board that is no free loan, rivals that answer real sales.

const game = (year = 1900, seed = 4) => {
  const s = newGame({ companyName: 'Test', seed });
  s.modals = [];
  s.week = weekFor(year);
  return s;
};

const summary = (year: number, revenue: number, profit: number): YearSummary => ({
  year,
  revenue,
  profit,
  unitsSold: 1000,
  shareByMarket: { usa: 0.05, europe: 0 },
  cashEnd: 0,
  costs: Object.fromEntries(COST_KEYS.map((k) => [k, 0])) as YearSummary['costs'],
});

describe('the class price', () => {
  it('a typical car at the class price earns a margin on a modern line, after the dealer’s cut', () => {
    for (const y of [1905, 1918, 1935, 1947]) {
      const s = game(y);
      const ref = eraReference(y, 'family');
      const net = referencePrice('usa', 'family', y) * (1 - DEALER_COMMISSION);
      const plan = planBalancedLine(y, true, 4);
      const line = { ...emptyLine('x', 'x'), slots: 4, stations: plan };
      const perCar = lineUpkeep(s, line, 1) / lineReport(s, line, 1).throughput;
      const margin = net - ref.unitCost * costIndex(y) - perCar;
      expect(margin / net, String(y)).toBeGreaterThan(0.02);
    }
  });

  it('an indexed price follows its class, not prices in general', () => {
    const s = game(1913);
    const ref = (y: number) => referencePrice('usa', 'city', y);
    const m = { price: ref(1913), priceWeek: s.week, indexPrice: true, segment: 'city' as const };
    const later = weekFor(1917);
    expect(priceNow(m, later) / ref(yearFloat(later))).toBeCloseTo(1, 6);
  });
});

describe('a small maker can grow', () => {
  it('a small hall of craftsmen’s benches stays within a small company’s reach after 1913', () => {
    const w = weekFor(1917);
    const small = turnkeyLineCost(w, false, 3);
    // Not a moving assembly line for four cars a week.
    expect(planBalancedLine(1917, false, 3).assembly.every((id) => id === 'asm_static')).toBe(true);
    expect(small).toBeLessThan(80000);
    expect(workshopLineCost(w)).toBeLessThan(60000);
    // Mass production stays a big investment.
    expect(turnkeyLineCost(weekFor(1935), false, 8)).toBeGreaterThan(3e6);
    expect(planBalancedLine(1935, false, 8).assembly[0]).toBe('asm_conveyor');
  });

  it('research costs a small maker less than a big one', () => {
    const def = researchDef('vt:ohv')!;
    const small = game(1926);
    small.finance = [{ week: small.week, revenue: 390000, materials: 0, labor: 0, salaries: 0, dealers: 0, marketing: 0, rnd: 0, warranty: 0, interest: 0, other: 0, investment: 0, tax: 0 }];
    const big = game(1926);
    big.finance = [{ ...small.finance[0], revenue: 30e6 }];
    expect(researchCost(def, 1926, small)).toBeLessThan(researchCost(def, 1926) * 0.4);
    expect(researchCost(def, 1926, big)).toBeGreaterThanOrEqual(researchCost(def, 1926));
    // Never below the 1906 price.
    const none = game(1926);
    expect(researchCost(def, 1926, none)).toBeGreaterThan(0);
  });

  it('the first two states beyond home always find a dealer', () => {
    const s = game(1901);
    const [a, b] = N.frontier(s);
    expect(N.searchChance(s, a)).toBe(1);
    N.stateNet(s, a).dealers = 1;
    expect(N.searchChance(s, b)).toBe(1);
    N.stateNet(s, b).dealers = 1;
    const c = N.frontier(s).find((x) => x !== a && x !== b)!;
    expect(N.searchChance(s, c)).toBeLessThan(1);
  });
});

describe('the board and the rivals', () => {
  it('shares are never bought back for less than they were sold for, with interest', () => {
    const s = game(1913);
    s.years = [summary(1910, 8e5, 6e4), summary(1911, 9e5, 7e4), summary(1912, 1e6, 8e4)];
    s.company.cash = 2e6;
    expect(goPublic(s, 0.3).ok).toBe(true);
    const sh = s.shares!;
    // The market collapses: the company is now worth little.
    s.company.cash = 1000;
    s.week = weekFor(1922);
    const floor = sh.basis! * Math.pow(1.06, 9) * 0.3;
    expect(buybackCost(s, 0.3)).toBeGreaterThanOrEqual(floor * 0.999);
    sh.ultimatum = true;
    // Half as much again under the last warning; buying 30% at once pushes the price up along the way (+15% on average).
    expect(buybackCost(s, 0.3)).toBeCloseTo(floor * 1.5 * 1.15, -2);
  });

  it('a workshop with a waiting list leads nothing: rivals answer cars delivered', () => {
    const s = newGame({ companyName: 'Test', seed: 3 });
    s.modals = [];
    const r = A.startProject(s, { name: 'Ucuz', segment: 'family', targetPrice: 0 });
    if (!r.ok) throw new Error(r.error);
    A.beginDevelopment(s, r.id);
    for (let i = 0; i < 200 && s.projects[0].dev.done < s.projects[0].dev.required; i++) tick(s);
    A.finishDevelopment(s, r.id);
    for (let i = 0; i < 30; i++) tick(s);
    A.finishTesting(s, r.id);
    A.startTooling(s, r.id, s.lines[0].id);
    for (let i = 0; i < 30 && s.projects[0]?.phase !== 'ready'; i++) tick(s);
    // Half the class price: buyers queue up, the workshop builds a car or two a week.
    const yf = yearFloat(s.week);
    expect(A.launchModel(s, r.id, { price: Math.round(referencePrice('usa', 'family', yf) * 0.5), markets: ['usa'], autoShow: false }).ok).toBe(true);
    for (let i = 0; i < 20; i++) {
      tick(s);
      s.modals = [];
    }
    const m = s.models[0];
    const sm = segmentMarket(s, 'usa', 'family');
    const pull = sm.offers.filter((o) => o.kind === 'player').reduce((a, o) => a + o.weight, 0) / sm.totalWeight;
    const built = m.history.slice(-13).reduce((a, h) => a + h.sold, 0) / 13;
    expect(built / sm.demand).toBeLessThan(0.12);
    expect(pull).toBeGreaterThan(built / sm.demand);
    expect(ledSegments(s)).not.toContain('family');
  }, 30_000);

  it('a whole line works nights with one switch', () => {
    const s = game(1905);
    const line = s.lines[0];
    expect(A.setLineNightShift(s, line.id, true).ok).toBe(true);
    expect(Object.values(line.nightShift ?? {}).every(Boolean)).toBe(true);
    A.setLineNightShift(s, line.id, false);
    expect(Object.values(line.nightShift ?? {}).some(Boolean)).toBe(false);
  });
});


describe('the share cap', () => {
  // A rival once took 57% of a class with one car while ours stopped near 35%: rivals meet the same cap.
  it('a far better, far cheaper rival car stops near its cap; a price over the class still costs it buyers', () => {
    const s = game(1900);
    const share = () => {
      const sm = segmentMarket(s, 'usa', 'family');
      const o = sm.offers.find((x) => x.id === rm.id)!;
      return { share: o.weight / sm.totalWeight, cap: N.shareCap(o.reach, rivalReputation(rm.companyId)) };
    };
    const lead = segmentMarket(s, 'usa', 'family').offers.filter((o) => o.kind === 'rival').sort((a, b) => b.weight - a.weight)[0];
    const rm = s.rivalModels.find((r) => r.id === lead.id)!;
    rivalScores(s, rm).appeal.usa = 100;
    rm.priceCut = { mult: 0.6, until: s.week + 52 };
    const cheap = share();
    expect(cheap.share).toBeLessThan(cheap.cap * 1.1);
    expect(cheap.share).toBeGreaterThan(cheap.cap * 0.6);
    rm.priceCut = { mult: 1.4, until: s.week + 52 };
    expect(share().share).toBeLessThan(cheap.share * 0.6);
  });
});

describe('the weekly profit', () => {
  it('counts every running cost, freight included, but not investment or the yearly tax', () => {
    const s = game(1920);
    const week = { ...(Object.fromEntries(COST_KEYS.map((k) => [k, 0])) as Record<(typeof COST_KEYS)[number], number>), week: 1, revenue: 1000 };
    s.finance = [{ ...week, materials: 400, freight: 50, investment: 300, tax: 200 }];
    expect(recentProfit(s, 4)).toBe(550);
  });
});

describe('the world column', () => {
  it('reports the crash from October 1929, not in the January paper of that year', () => {
    const at = (year: number, month: number) => {
      const s = game(1900);
      s.week = weekFor(year, month);
      // With no new technology the world news leads the page.
      return techIssue(s, [], year)?.lead.headline;
    };
    expect(at(1929, 1)).toBeUndefined();
    expect(at(1929, 11)).toBe('Borsa Çöktü!');
    expect(at(1930, 1)).toBe('Borsa Çöktü!');
  });
});

describe('the engineers’ priorities', () => {
  it('two chosen areas take extra work, the rest share what is left; a third replaces the first', () => {
    const s = game(1910);
    const r = A.startProject(s, { name: 'X', segment: 'family', targetPrice: 0 });
    if (!r.ok) throw new Error(r.error);
    const p = s.projects.find((x) => x.id === r.id)!;
    expect(p.dev.priorities).toEqual(['practicality', 'comfort']);
    expect(p.dev.focus.practicality).toBeCloseTo(0.3, 6);
    expect(p.dev.focus.safety).toBeCloseTo(0.4 / 6, 6);
    A.togglePriority(s, r.id, 'safety');
    expect(p.dev.priorities).toEqual(['comfort', 'safety']);
    expect(p.dev.focus.practicality).toBeCloseTo(0.4 / 6, 6);
    A.togglePriority(s, r.id, 'safety');
    expect(p.dev.priorities).toEqual(['comfort']);
    expect(p.dev.focus.comfort).toBeCloseTo(0.3, 6);
    expect(Object.values(p.dev.focus).reduce((a, v) => a + v, 0)).toBeCloseTo(1, 9);
  });
});
