import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { acquisitionTargets } from '../src/core/acquisitions';
import { COST_KEYS, finalScore, newGame, tick } from '../src/core/game';
import { rivalPriceNow } from '../src/core/market';
import { makeRng } from '../src/core/rng';
import { lastMove, mergeRivals, rivalMovesMonth, startPriceWar, techLeap } from '../src/core/rivalMoves';
import { rivalDef, updateRivals } from '../src/core/rivals';
import { deserialize, serialize } from '../src/core/save';
import { boardVeto, boardYear, buyBack, canGoPublic, goPublic, marketCap, nextTarget } from '../src/core/shares';
import { setRacingLevel } from '../src/core/racing';
import { weekFor } from '../src/core/time';
import type { GameState, YearSummary } from '../src/core/types';
import { eventDef } from '../src/data/events';

// The rivals fight back once the player gets ahead, and a listed company answers to its board.

const game = (year: number, month = 1) => {
  const s = newGame({ companyName: 'Test', seed: 4 });
  s.modals = [];
  s.week = weekFor(year, month);
  updateRivals(s, makeRng(3), true);
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

/** A healthy private company, a few years old, ready to list. */
function listed(s: GameState, float = 0.3) {
  const y = Math.floor(1900 + s.week / 52);
  s.years = [summary(y - 3, 800000, 60000), summary(y - 2, 900000, 70000), summary(y - 1, 1000000, 80000)];
  s.company.cash = 2e6;
  expect(canGoPublic(s).ok).toBe(true);
  expect(goPublic(s, float).ok).toBe(true);
  return s.shares!;
}

describe('rival counter-moves', () => {
  it('stay away while the player leads nothing', () => {
    const s = game(1912);
    for (let i = 0; i < 60; i++) rivalMovesMonth(s, makeRng(i));
    expect(s.rivalMoves?.history ?? []).toHaveLength(0);
  });

  it('a price war cuts a rival’s prices for a year and a half', () => {
    const s = game(1912);
    const rm = s.rivalModels.find((m) => m.active && m.segment === 'family' && rivalDef(m.companyId).home === 'usa')!;
    const before = rivalPriceNow(rm, s.week);
    startPriceWar(s, rm.companyId, 'family');
    expect(rivalPriceNow(rm, s.week)).toBeCloseTo(before * 0.85, 0);
    expect(rivalPriceNow(rm, s.week + 80)).toBeGreaterThan(before * 0.95);
    expect(s.rivalMoves!.history[0]).toMatchObject({ kind: 'priceWar', company: rm.companyId, segment: 'family' });
  });

  it('a car built to beat ours brings its class a first: the automatic after 1940', () => {
    const s = game(1948);
    for (const m of s.rivalModels) if (m.segment === 'family' && m.design.gearbox.type === 'automatic') m.design.gearbox.type = 'synchro';
    expect(techLeap(s, 'family', makeRng(5))).toBe(true);
    const move = lastMove(s)!;
    expect(move.first).toBe('automatic');
    const car = s.rivalModels.find((m) => m.active && m.name === move.model && m.companyId === move.company)!;
    expect(car.design.gearbox.type).toBe('automatic');
    // Once one maker has it, the next leap is just a better car.
    expect(techLeap(s, 'family', makeRng(6))).toBe(true);
    expect(lastMove(s)!.first).toBeUndefined();
  });

  it('a merger takes one maker off the market and gives its dealers to the other', () => {
    const s = game(1915);
    const live = s.rivals.filter((c) => c.home === 'usa' && s.rivalModels.some((m) => m.companyId === c.id && m.active));
    live.forEach((c, i) => (c.yearSold[1914] = 50000 - i * 1000));
    expect(mergeRivals(s, makeRng(7))).toBe(true);
    const gone = s.rivals.find((c) => c.mergedInto)!;
    const buyer = s.rivals.find((c) => c.id === gone.mergedInto)!;
    expect(buyer.sizeBoost).toBeGreaterThan(0);
    expect(s.rivalModels.some((m) => m.companyId === gone.id && m.active)).toBe(false);
    // It never comes back, and it is not for sale.
    for (let i = 0; i < 24; i++) {
      s.week += 4;
      updateRivals(s, makeRng(100 + i));
    }
    expect(s.rivalModels.some((m) => m.companyId === gone.id && m.active)).toBe(false);
    s.years.push(summary(1916, 1e7, 1e6));
    s.years[s.years.length - 1].unitsSold = 1e6;
    expect(acquisitionTargets(s).some((t) => t.id === gone.id)).toBe(false);
  });

  it('the raider pop-up greys out a buy-back the company cannot pay', () => {
    const s = game(1920);
    const sh = listed(s);
    sh.raider = { company: 'hartwell', stake: 0.15 };
    s.company.cash = 10;
    const ev = eventDef('rival-raid')!;
    const green = ev.choices!.find((c) => c.id === 'greenmail')!;
    expect(green.enabled!(s)).toBe(false);
    expect(() => A.chooseEventOption(s, 'rival-raid', 'greenmail')).toThrow();
    A.chooseEventOption(s, 'rival-raid', 'seat');
    expect(s.shares!.seat).toBe('hartwell');
  });
});

describe('the stock exchange and the board', () => {
  it('lists only a profitable company with a few years of books, from 1908', () => {
    const s = game(1905);
    s.years = [summary(1902, 1e5, 1e4), summary(1903, 1e5, 1e4), summary(1904, 1e5, 1e4)];
    s.company.cash = 2e6;
    expect(canGoPublic(s).ok).toBe(false);
    s.week = weekFor(1912);
    expect(canGoPublic(s).ok).toBe(true);
    s.years[2].profit = -5000;
    expect(canGoPublic(s).ok).toBe(false);
  });

  it('selling shares brings in cash and costs the founder part of the score', () => {
    const s = game(1912);
    s.years = [summary(1909, 8e5, 6e4), summary(1910, 9e5, 7e4), summary(1911, 1e6, 8e4)];
    s.company.cash = 2e6;
    const score = finalScore(s).parts[1].points;
    const cap = marketCap(s);
    goPublic(s, 0.3);
    expect(s.company.cash).toBeCloseTo(2e6 + cap * 0.3 * 0.92, -2);
    expect(s.shares!.float).toBe(0.3);
    expect(s.shares!.target.year).toBe(1912);
    // Worth more in cash, but only 70% of it is the founder's.
    expect(finalScore(s).parts[1].points).toBeLessThanOrEqual(score);
  });

  it('pays the dividend outside the running costs and judges the targets', () => {
    const s = game(1912);
    const sh = listed(s, 0.3);
    sh.payout = 0.5;
    s.years.push(summary(1912, 1.2e6, 1e5));
    s.week = weekFor(1913);
    const cash = s.company.cash;
    expect(boardYear(s, 1912)).toBe(false);
    const paid = 0.3 * 0.5 * 1e5;
    expect(cash - s.company.cash).toBeCloseTo(paid, 0);
    expect(s.finance[s.finance.length - 1].dividend).toBeCloseTo(paid, 0);
    expect((COST_KEYS as readonly string[]).includes('dividend')).toBe(false);
    const last = sh.history[sh.history.length - 1];
    expect(last.met).toBe(last.dividend >= last.targetDividend * 0.98 && last.growth >= last.targetGrowth - 0.005);
    expect(sh.target.year).toBe(1913);
  });

  it('missed targets wear the board down; after the last warning the founder goes', () => {
    const s = game(1912);
    const sh = listed(s);
    sh.payout = 0;
    let year = 1912;
    let out = false;
    // Revenue falls every year and no dividend is paid.
    for (let i = 0; i < 12 && !out; i++, year++) {
      s.years.push(summary(year, 1e6 * Math.pow(0.8, i + 1), 1e4));
      s.week = weekFor(year + 1);
      const before = sh.confidence;
      out = boardYear(s, year);
      if (!out) expect(sh.confidence).toBeLessThan(before);
    }
    expect(out).toBe(true);
    expect(sh.history.some((b) => b.confidence < 25)).toBe(true);
    expect(s.modals.some((m) => m.kind === 'event' && m.eventId === 'board-ultimatum')).toBe(true);
  });

  it('a missed year after the last warning ends the game at the new year', () => {
    const s = game(1914, 11);
    const sh = listed(s);
    sh.ultimatum = true;
    sh.target = { year: 1914, growth: 0.1, dividend: 0 };
    // No cars sold this year: revenue collapses.
    while (!s.gameOver && s.week < weekFor(1915, 1)) tick(s);
    expect(s.gameOver?.reason).toBe('ousted');
  });

  it('buying back every share dissolves the board, and saves keep it all', () => {
    const s = game(1920);
    listed(s, 0.2);
    s.company.cash = 1e9;
    const copy = deserialize(serialize(s));
    expect(copy.shares?.float).toBe(0.2);
    expect(buyBack(s, 1).ok).toBe(true);
    expect(s.shares).toBeUndefined();
  });

  /** Run the board through `years` years of steady business: revenue on target, profit up 10% a year. */
  function run(s: GameState, years: number, payout: number) {
    const sh = s.shares!;
    sh.payout = payout;
    let year = sh.target.year;
    let profit = 80000;
    for (let i = 0; i < years; i++, year++) {
      const prev = s.years[s.years.length - 1].revenue;
      profit *= 1.1;
      s.years.push(summary(year, prev * (1 + sh.target.growth + 0.02), profit));
      s.week = weekFor(year + 1);
      if (boardYear(s, year)) return i + 1;
    }
    return 0;
  }

  it('a founder who never touches the dividend is voted out within a few years; one who pays is not', () => {
    const passive = game(1912);
    listed(passive);
    expect(passive.shares!.payout).toBe(0.2);
    const out = run(passive, 20, passive.shares!.payout);
    expect(out).toBeGreaterThan(2);
    expect(out).toBeLessThanOrEqual(8);
    const careful = game(1912);
    listed(careful);
    expect(run(careful, 20, 0.6)).toBe(0);
    expect(careful.shares!.confidence).toBeGreaterThan(55);
  });

  it('has a short memory: full confidence does not survive two bad years', () => {
    const s = game(1912);
    const sh = listed(s);
    sh.confidence = 100;
    sh.payout = 0;
    s.years.push(summary(1912, 5e5, 1e4));
    s.week = weekFor(1913);
    boardYear(s, 1912);
    expect(sh.confidence).toBeLessThan(60);
    s.years.push(summary(1913, 3e5, 1e4));
    s.week = weekFor(1914);
    boardYear(s, 1913);
    expect(sh.confidence).toBeLessThan(40);
  });

  it('expects half the profit and a rising dividend; a great year and a rival on the board raise the bar', () => {
    // Calm years, far from the caps: 1926 and 1927.
    const s = game(1926);
    const sh = listed(s, 0.3);
    const base = nextTarget(s, 1926);
    expect(base.dividend).toBeCloseTo(0.3 * 0.5 * 80000, 0);
    // A year that paid 60% of its profit and grew far beyond the target.
    sh.history.push({ year: 1926, growth: base.growth + 0.3, targetGrowth: base.growth, dividend: 0.3 * 0.6 * 1e5, targetDividend: 0, profit: 1e5, met: true, confidence: 70, full: 0.6 * 1e5 });
    s.years.push(summary(1926, 2e6, 1e5));
    const next = nextTarget(s, 1927);
    expect(next.dividend).toBeCloseTo(0.3 * 0.63 * 1e5, 0);
    const calm = { ...sh.history[0], growth: base.growth };
    sh.history[0] = calm;
    const plain = nextTarget(s, 1927);
    sh.history[0] = { ...calm, growth: base.growth + 0.3 };
    expect(next.growth).toBeGreaterThan(plain.growth + 0.04);
    sh.seat = 'monarch';
    const strict = nextTarget(s, 1927);
    expect(strict.growth).toBeGreaterThan(next.growth + 0.03);
    expect(strict.dividend).toBeCloseTo(next.dividend * 1.15, 0);
  });

  it('a board that lost faith vetoes racing, buying rivals and new lines', () => {
    const s = game(1920);
    const sh = listed(s);
    s.company.cash = 1e9;
    expect(boardVeto(s)).toBeUndefined();
    sh.confidence = 30;
    expect(boardVeto(s)).toBeTruthy();
    expect(A.buyLine(s).ok).toBe(false);
    expect(setRacingLevel(s, 2).ok).toBe(false);
    // Cutting back is always allowed.
    expect(setRacingLevel(s, 0).ok).toBe(true);
    // A bad board meeting disbands the racing team.
    sh.confidence = 45;
    s.racing = { level: 2, fame: 1 };
    sh.payout = 0;
    s.years.push(summary(1920, 1, 1e4));
    s.week = weekFor(1921);
    sh.target = { year: 1920, growth: 0.1, dividend: 1e6 };
    boardYear(s, 1920);
    expect(sh.confidence).toBeLessThan(40);
    expect(s.racing.level).toBe(0);
  });
});
