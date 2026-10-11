import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { adBrandTerm, adNorm, adRatio } from '../src/core/advertising';
import { lineReport, retoolCost } from '../src/core/factory';
import { newGame, tick } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save';
import { weekFor, yearFloat } from '../src/core/time';
import { adWeight, costIndex, dieCostPerCar } from '../src/data/economy';
import { CHASSIS, byId } from '../src/data/tech';
import type { GameState } from '../src/core/types';
import { runBot } from '../scripts/bot';

// Money a big maker spends and never sees again: dies sized for the cars it builds, and the
// advertising that keeps its name.

/** A company two years into the game from `year`, with a car on sale (the bot plays it). */
function going(year: number) {
  const s = newGame({ companyName: 'Test', hq: 'usa', seed: 4 });
  s.week = weekFor(year, 0);
  s.modals = [];
  // A newcomer of the era with money enough to build its first car at the era's prices.
  s.company.cash = 2e5 * costIndex(year);
  runBot(s, 52 * 2, { segments: ['family'] });
  s.modals = [];
  expect(s.models.some((m) => m.status === 'active')).toBe(true);
  return s;
}

const onSale = (s: GameState) => s.models.find((m) => m.status === 'active')!;

describe('dies for the volume', () => {
  it('another line costs its die set, sized for the cars it builds', () => {
    const s = going(1925);
    const m = onSale(s);
    const yf = yearFloat(s.week);
    const chassis = byId(CHASSIS, m.design.chassis).tooling;
    expect(retoolCost(s, m, 100) - retoolCost(s, m, 0)).toBeCloseTo(dieCostPerCar(yf) * costIndex(yf) * 52 * 100 * chassis, 3);
  });

  it('a facelift reworks the dies on every line of the car, and waits for the money', () => {
    const s = going(1925);
    const m = onSale(s);
    s.company.cash = 1e10;
    expect(A.buildTurnkeyLines(s, 3, m.id, true).ok).toBe(true);
    const lines = s.lines.filter((l) => l.modelId === m.id);
    expect(lines.length).toBeGreaterThanOrEqual(4);
    const r = A.startFacelift(s, m.id);
    if (!r.ok) throw new Error(r.error);
    const p = s.projects.find((x) => x.id === r.id)!;
    const q = A.toolingQuote(s, p, p.lineId!);
    expect(q.lines).toBe(lines.length);
    const perWeek = lines.reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
    expect(q.carsPerYear).toBeCloseTo(perWeek * 52, 6);
    // Half the lines, about half the dies.
    for (const l of lines.slice(0, Math.floor(lines.length / 2))) l.modelId = undefined;
    const fewer = A.toolingQuote(s, p, p.lineId!);
    expect(fewer.lines).toBeLessThan(q.lines);
    expect(fewer.dies).toBeLessThan(q.dies);
    // No money, no new dies: the project stays in testing.
    p.phase = 'testing';
    s.company.cash = 0;
    expect(A.finishTesting(s, p.id).ok).toBe(false);
    expect(p.phase).toBe('testing');
    s.company.cash = 1e10;
    expect(A.finishTesting(s, p.id).ok).toBe(true);
    expect(p.toolingCost).toBeCloseTo(fewer.cost, 0);
  });

  it('a new generation pays for the dies of every line it takes over', () => {
    const s = going(1925);
    const m = onSale(s);
    s.company.cash = 1e10;
    A.buildTurnkeyLines(s, 3, m.id, true);
    const r = A.startProject(s, { name: 'Next', segment: m.segment, targetPrice: 0, replacesModelId: m.id });
    if (!r.ok) throw new Error(r.error);
    const p = s.projects.find((x) => x.id === r.id)!;
    const own = s.lines.find((l) => l.modelId === m.id)!;
    const all = A.toolingQuote(s, p, own.id);
    expect(all.lines).toBe(s.lines.filter((l) => l.modelId === m.id).length);
    // A car that replaces nothing tools its own line only.
    const alone = A.toolingQuote(s, { ...p, replacesModelId: undefined }, own.id);
    expect(alone.lines).toBe(1);
    expect(all.cost).toBeGreaterThan(alone.cost);
  });
});

describe('advertising keeps the name', () => {
  it('does nothing for the brand before mass advertising', () => {
    const s = going(1903);
    s.markets.usa.adBudget = 0;
    expect(adWeight(yearFloat(s.week))).toBe(0);
    expect(adBrandTerm(s)).toBe(0);
  });

  it('at the era’s usual nothing either way; silent, the brand heads lower; more, a little higher', () => {
    const s = going(1948);
    const w = adWeight(yearFloat(s.week));
    expect(w).toBeGreaterThan(10);
    expect(adNorm(s)).toBeGreaterThan(0);
    s.markets.usa.adBudget = 0;
    expect(adBrandTerm(s)).toBeCloseTo(-w, 6);
    s.markets.usa.adBudget = adNorm(s);
    expect(adRatio(s)).toBeCloseTo(1, 6);
    expect(adBrandTerm(s)).toBeCloseTo(0, 6);
    s.markets.usa.adBudget = 2 * adNorm(s);
    expect(adBrandTerm(s)).toBeCloseTo(0.3 * w, 6);
    s.markets.usa.adBudget = 1e12;
    expect(adBrandTerm(s)).toBeLessThanOrEqual(0.6 * w);
  });

  it('kept at the usual, the budget follows the company and is paid as marketing; a silent brand loses reputation', () => {
    const s = going(1948);
    A.setAdLevel(s, 1);
    const silent = deserialize(serialize(s));
    A.setAdBudget(silent, 'usa', 0);
    expect(silent.markets.usa.adLevel).toBeUndefined();
    for (let i = 0; i < 52; i++) {
      tick(s);
      tick(silent);
      s.modals = [];
      silent.modals = [];
    }
    expect(s.markets.usa.adBudget).toBeCloseTo(adNorm(s), -1);
    const last = s.finance[s.finance.length - 1];
    expect(last.marketing).toBeGreaterThanOrEqual(s.markets.usa.adBudget * 0.99);
    expect(silent.company.reputation).toBeLessThan(s.company.reputation - 3);
  });

  it('a new game follows the era’s usual until the player sets the budget', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 1 });
    expect(s.markets.usa.adLevel).toBe(1);
    // Nothing to spend before the first sales.
    tick(s);
    expect(s.markets.usa.adBudget).toBe(0);
    A.setAdBudget(s, 'usa', 50);
    expect(s.markets.usa.adLevel).toBeUndefined();
    A.setAdLevel(s, 3);
    expect(s.markets.usa.adLevel).toBe(3);
  });

  it('a save keeps the choice', () => {
    const s = going(1948);
    A.setAdLevel(s, 1);
    expect(deserialize(serialize(s)).markets.usa.adLevel).toBe(1);
  });
});
