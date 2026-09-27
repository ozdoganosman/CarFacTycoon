import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { aiDesign, referenceDesigns } from '../src/core/ai';
import { computeEngine, displacementCc, racHp } from '../src/core/engine';
import { lineReport } from '../src/core/factory';
import { newGame, tick } from '../src/core/game';
import { segmentMarket } from '../src/core/market';
import { makeRng } from '../src/core/rng';
import { deserialize, serialize } from '../src/core/save';
import { eraReference, scoreStats } from '../src/core/scoring';
import { expectedRemaining } from '../src/core/testing';
import { computeCarStats } from '../src/core/vehicle';
import type { CarDesign } from '../src/core/types';
import { inYear } from '../src/ui/format';
import { runBot } from '../scripts/bot';

const modelT: CarDesign = {
  chassis: 'ladder',
  body: 'phaeton',
  size: 0.1,
  styling: 0.2,
  engine: { cylinders: 4, layout: 'inline', bore: 95.25, stroke: 101.6, compression: 4.2, valvetrain: 'sv', fuelSystem: 'carb', aspiration: 'na' },
  gearbox: { type: 'sliding', gears: 2, spread: 0.4 },
  suspension: 'leaf',
  suspBalance: 0.4,
  features: [],
  interior: 0.1,
};

describe('engine', () => {
  it('computes displacement and a Model T-like output', () => {
    expect(displacementCc(modelT.engine)).toBeCloseTo(2896, -1);
    const e = computeEngine(modelT.engine, 1908);
    expect(e.powerHp).toBeGreaterThan(17);
    expect(e.powerHp).toBeLessThan(28);
    expect(e.redline).toBeLessThan(2600);
  });

  it('long stroke lowers the redline; short stroke revs higher', () => {
    const long = computeEngine({ ...modelT.engine, bore: 80, stroke: 130 }, 1920);
    const short = computeEngine({ ...modelT.engine, bore: 102, stroke: 80 }, 1920);
    expect(long.redline).toBeLessThan(short.redline);
  });

  it('RAC tax horsepower only depends on bore and cylinders', () => {
    expect(racHp({ cylinders: 4, bore: 95.25 })).toBeCloseTo(22.5, 1);
    const a = computeEngine({ ...modelT.engine, stroke: 90 }, 1920);
    const b = computeEngine({ ...modelT.engine, stroke: 140 }, 1920);
    expect(a.taxHp).toBeCloseTo(b.taxHp, 5);
  });

  it('knocks when compression exceeds what the fuel allows', () => {
    const e = computeEngine({ ...modelT.engine, compression: 7 }, 1908);
    expect(e.knocking).toBe(true);
  });
});

describe('vehicle', () => {
  it('early cars are slow and cannot reach 100 km/h', () => {
    const s = computeCarStats(modelT, 1908);
    expect(s.topSpeed).toBeGreaterThan(55);
    expect(s.topSpeed).toBeLessThan(95);
    expect(s.accel100).toBeNull();
    expect(s.fuel).toBeGreaterThan(6);
  });

  it('gearing trades acceleration for economy', () => {
    const short = computeCarStats({ ...modelT, gearbox: { ...modelT.gearbox, spread: 0 } }, 1908);
    const long = computeCarStats({ ...modelT, gearbox: { ...modelT.gearbox, spread: 1 } }, 1908);
    expect(short.accel50).toBeLessThan(long.accel50);
    expect(long.fuel).toBeLessThan(short.fuel);
  });
});

describe('scoring', () => {
  it('the class reference scores around 50', () => {
    for (const year of [1905, 1930, 1955]) {
      const refs = referenceDesigns(year, 'family').map((d) => computeCarStats(d, year));
      const scores = refs.map((s) => scoreStats(s, year, 'family'));
      const avgComfort = scores.reduce((a, s) => a + s.comfort, 0) / scores.length;
      expect(avgComfort).toBeGreaterThan(35);
      expect(avgComfort).toBeLessThan(65);
    }
  });

  it('a car ages: the same design scores lower a decade later', () => {
    const { design, bonus } = aiDesign('family', 1925, { style: 'mass', skill: 60, market: 'usa' }, makeRng(1));
    const stats = computeCarStats(design, 1925, bonus);
    const now = scoreStats(stats, 1925, 'family');
    const later = scoreStats(stats, 1938, 'family');
    expect(later.topSpeed).toBeLessThan(now.topSpeed);
    expect(eraReference(1938, 'family').topSpeed).toBeGreaterThan(eraReference(1925, 'family').topSpeed);
  });
});

describe('testing', () => {
  it('more testing leaves fewer expected defects', () => {
    const none = expectedRemaining(6, { dyno: 0, road: 0, crash: 0, durability: 0 });
    const some = expectedRemaining(6, { dyno: 4, road: 8, crash: 0, durability: 8 });
    const lots = expectedRemaining(6, { dyno: 20, road: 26, crash: 0, durability: 26 });
    expect(none).toBeCloseTo(6, 5);
    expect(some).toBeLessThan(none);
    expect(lots).toBeLessThan(some);
    expect(lots).toBeLessThan(1);
  });
});

describe('game', () => {
  it('starts with a workshop whose paint shop is the bottleneck', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 1 });
    const r = lineReport(s, s.lines[0], 1);
    expect(r.bottleneck).toBe('paint');
    expect(s.rivalModels.length).toBeGreaterThan(0);
  });

  it('market shares add up to 100%', () => {
    const s = newGame({ companyName: 'Test', hq: 'europe', seed: 2 });
    for (let i = 0; i < 52 * 15; i++) tick(s);
    const sm = segmentMarket(s, 'europe', 'family');
    const total = sm.offers.reduce((a, o) => a + o.weight, 0) + sm.othersWeight;
    expect(total).toBeCloseTo(sm.totalWeight, 6);
  });

  it('walks a project from design to launch', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 3 });
    s.modals = [];
    const r = A.startProject(s, { name: 'Deneme', segment: 'family', targetPrice: 900 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(A.beginDevelopment(s, r.id).ok).toBe(true);
    for (let i = 0; i < 200 && s.projects[0].dev.done < s.projects[0].dev.required; i++) tick(s);
    expect(A.finishDevelopment(s, r.id).ok).toBe(true);
    for (let i = 0; i < 30; i++) tick(s);
    expect(A.finishTesting(s, r.id).ok).toBe(true);
    expect(A.startTooling(s, r.id, s.lines[0].id).ok).toBe(true);
    for (let i = 0; i < 30 && s.projects[0]?.phase !== 'ready'; i++) tick(s);
    const l = A.launchModel(s, r.id, { price: 900, markets: ['usa'], autoShow: false });
    expect(l.ok).toBe(true);
    for (let i = 0; i < 52; i++) tick(s);
    expect(s.models[0].unitsSold).toBeGreaterThan(0);
    expect(s.company.modelsLaunched).toBe(1);
    expect(s.markets.europe.unlocked).toBe(true);
  });

  it('is deterministic for a seed and survives a save round-trip', () => {
    const a = newGame({ companyName: 'A', hq: 'usa', seed: 42 });
    const b = newGame({ companyName: 'A', hq: 'usa', seed: 42 });
    runBot(a, 52 * 8, { segments: ['family'] });
    runBot(b, 52 * 8, { segments: ['family'] });
    expect(a.company.cash).toBeCloseTo(b.company.cash, 6);
    const c = deserialize(serialize(a));
    expect(c.week).toBe(a.week);
    runBot(a, 52, { segments: ['family'] });
    runBot(c, 52, { segments: ['family'] });
    expect(c.company.cash).toBeCloseTo(a.company.cash, 6);
  });

  it('a scripted player can play the whole campaign without going bankrupt', () => {
    const s = newGame({ companyName: 'Bot', hq: 'europe', seed: 2 });
    runBot(s, 52 * 61, { segments: ['city', 'family'] });
    expect(s.gameOver?.reason).toBe('end');
    expect(s.company.cash).toBeGreaterThan(0);
  }, 60_000);
});

describe('format', () => {
  it('builds Turkish locative suffixes for years', () => {
    expect(inYear(1900)).toBe('1900’de');
    expect(inYear(1905)).toBe('1905’te');
    expect(inYear(1910)).toBe('1910’da');
    expect(inYear(1913)).toBe('1913’te');
    expect(inYear(1921)).toBe('1921’de');
    expect(inYear(1934)).toBe('1934’te');
    expect(inYear(1940)).toBe('1940’ta');
    expect(inYear(1946)).toBe('1946’da');
    expect(inYear(1959)).toBe('1959’da');
  });
});
