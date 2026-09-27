import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { aiDesign, referenceBonus, referenceDesigns } from '../src/core/ai';
import { computeEngine, displacementCc, eraRpmCap, racHp } from '../src/core/engine';
import { researchCost, researchDef, unknownTech } from '../src/core/research';
import { lineReport } from '../src/core/factory';
import { materialUnitCost, newGame, tick } from '../src/core/game';
import { datedPenalty, modelAgeYears, priceNow, segmentMarket } from '../src/core/market';
import { makeRng } from '../src/core/rng';
import { deserialize, serialize } from '../src/core/save';
import { eraReference, scoreStats } from '../src/core/scoring';
import { TESTS, expectedRemaining, testWeekCost } from '../src/core/testing';
import { isBlockingModal } from '../src/core/util';
import { computeCarStats } from '../src/core/vehicle';
import type { CarDesign } from '../src/core/types';
import { RIVALS } from '../src/data/rivals';
import { SEGMENTS } from '../src/data/segments';
import { inYear } from '../src/ui/format';
import { FOCUS_KEYS, bonusFromPoints } from '../src/core/development';
import { experienceFactor } from '../src/core/estimate';
import { autoCapacity } from '../src/core/autocap';
import { engineNotes, gearboxNotes } from '../src/core/engineNotes';
import { CYLINDER_OPTIONS } from '../src/data/tech';
import type { FocusKey } from '../src/core/types';
import { store } from '../src/ui/store';
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

  it('early engines rev slowly whatever their shape', () => {
    const square = { cylinders: 6, layout: 'inline' as const, bore: 102.5, stroke: 41.5, compression: 4.2, valvetrain: 'ohv' as const, fuelSystem: 'carb' as const, aspiration: 'na' as const };
    const e1910 = computeEngine(square, 1910);
    expect(e1910.redline).toBeLessThanOrEqual(eraRpmCap('ohv', 1910) + 1);
    expect(e1910.redline).toBeLessThan(3500);
    expect(computeEngine(square, 1955).redline).toBeGreaterThan(e1910.redline * 1.4);
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
      const refs = referenceDesigns(year, 'family').map((d) => computeCarStats(d, year, referenceBonus()));
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
  it('testing costs real money and even the longest programme misses some defects', () => {
    const road = TESTS.find((t) => t.id === 'road')!;
    // A week of road testing a $500 car costs a good share of a car.
    expect(testWeekCost(road, 500, 1900)).toBeGreaterThan(150);
    const max = { dyno: 30, road: 30, crash: 30, durability: 30 };
    expect(expectedRemaining(10, max)).toBeGreaterThan(0.5);
  });

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

  it('every open class has a named rival in both markets, from the first day', () => {
    for (const mk of ['usa', 'europe'] as const) {
      for (const sg of SEGMENTS) {
        for (let y = Math.max(1900, sg.year); y <= 1960; y += 0.25) {
          const named = RIVALS.filter(
            (r) =>
              r.founded <= y &&
              (!r.closes || y < r.closes) &&
              r.segments.some((e) => e.seg === sg.id && e.from <= y && (!e.to || y < e.to)) &&
              (r.home === mk || (r.exports ?? []).some((x) => x.market === mk && x.from <= y && (!x.segments || x.segments.includes(sg.id)))),
          );
          expect(named.length, `${mk} ${sg.id} ${y}`).toBeGreaterThan(0);
        }
      }
    }
    // And the models are really on sale when the game starts.
    for (const hq of ['usa', 'europe'] as const) {
      const s = newGame({ companyName: 'Test', hq, seed: 3 });
      for (const seg of ['city', 'family', 'sport', 'luxury'] as const) {
        expect(segmentMarket(s, hq, seg).offers.length, `${hq} ${seg}`).toBeGreaterThan(0);
      }
    }
  });

  it('a save from before new rivals were added keeps running', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 9 });
    for (let i = 0; i < 30; i++) tick(s);
    s.rivals = s.rivals.filter((r) => !r.id.startsWith('minor-') && r.id !== 'oakley');
    s.rivalModels = s.rivalModels.filter((m) => !m.companyId.startsWith('minor-') && m.companyId !== 'oakley');
    delete s.decisions;
    delete s.errors;
    const back = deserialize(serialize(s));
    expect(() => {
      for (let i = 0; i < 60; i++) tick(back);
    }).not.toThrow();
    expect(back.rivals.length).toBe(RIVALS.length);
  });

  it('opens the full engine designer by default, unless the player chose the simple one', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 9 });
    expect(s.settings.engineerMode).toBe(true);
    // Older saves defaulted to the simple designer without anyone choosing it.
    s.settings = { engineerMode: false, autoPauseCards: true };
    expect(deserialize(serialize(s)).settings.engineerMode).toBe(true);
    A.setEngineerMode(s, false);
    expect(deserialize(serialize(s)).settings.engineerMode).toBe(false);
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

describe('factory tools', () => {
  it('a turnkey line is full, balanced and assigned in one step', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 4 });
    runBot(s, 52 * 3, { segments: ['family'] });
    const m = s.models.find((x) => x.status === 'active')!;
    s.company.cash = 1e7;
    const before = s.lines.length;
    expect(A.buildTurnkeyLines(s, 3, m.id, false).ok).toBe(true);
    const fresh = s.lines.slice(before);
    expect(fresh).toHaveLength(3);
    for (const l of fresh) {
      expect(l.modelId).toBe(m.id);
      const r = lineReport(s, l, 1);
      // Balanced: no section can do more than ~one station above the bottleneck.
      for (const v of Object.values(r.perStage)) expect(v).toBeLessThan(r.throughput + 3.01);
    }
  });

  it('modernising swaps in new machines and a night shift lifts the bottleneck', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 5 });
    const line = s.lines[0];
    s.company.cash = 1e7;
    const old = lineReport(s, line, 1);
    s.week = 52 * 26; // 1926: spray paint, moving lines
    expect(A.modernizeLine(s, line.id, false).ok).toBe(true);
    const fresh = lineReport(s, line, 1);
    expect(fresh.throughput).toBeGreaterThan(old.throughput * 5);
    A.setNightShift(s, line.id, fresh.bottleneck, true);
    expect(lineReport(s, line, 1).throughput).toBeGreaterThan(fresh.throughput);
  });

  it('the year report does not stop the clock; decisions do', () => {
    expect(isBlockingModal({ kind: 'yearReport', year: 1901 })).toBe(false);
    expect(isBlockingModal({ kind: 'launch', modelId: 'm1', venue: 'x' })).toBe(true);
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 6 });
    s.modals = [{ kind: 'yearReport', year: 1900 }, { kind: 'unlock', title: 'x', body: 'y' }];
    A.dismissModal(s);
    expect(s.modals.map((m) => m.kind)).toEqual(['yearReport']);
  });
});

describe('clock', () => {
  it('pauses for a decision, resumes by itself afterwards, and runs through the year report', () => {
    store.start({ companyName: 'Test', hq: 'usa', seed: 8 });
    store.setSpeed(3);
    const s = store.state!;
    s.modals = [{ kind: 'unlock', title: 'x', body: 'y' }];
    store.step();
    expect(store.speed).toBe(0);
    store.act(A.dismissModal);
    expect(store.speed).toBe(3);
    s.modals = [{ kind: 'yearReport', year: 1900 }];
    const week = s.week;
    store.step();
    expect(s.week).toBe(week + 1);
    expect(store.speed).toBe(3);
    // A finished project stage leaves the clock stopped: the player has work to do.
    s.modals = [{ kind: 'phase', projectId: 'p1', phase: 'development' }];
    store.setSpeed(2);
    store.step();
    store.act(A.dismissModal);
    expect(store.speed).toBe(0);
    // A pause the player chose is not undone by closing a pop-up.
    store.setSpeed(3);
    s.modals = [{ kind: 'unlock', title: 'x', body: 'y' }];
    store.step();
    store.setSpeed(0);
    store.act(A.dismissModal);
    expect(store.speed).toBe(0);
    store.quit();
  });
});

describe('engineering', () => {
  it('three-cylinder and V6 engines exist and sit where they should', () => {
    expect(CYLINDER_OPTIONS.find((c) => c.cylinders === 3)?.year).toBe(1904);
    expect(CYLINDER_OPTIONS.find((c) => c.cylinders === 6 && c.layout === 'v')?.year).toBe(1950);
    const base = { layout: 'inline' as const, bore: 70, stroke: 80, compression: 4.2, valvetrain: 'sv' as const, fuelSystem: 'carb' as const, aspiration: 'na' as const };
    const smooth = (cylinders: number) => computeEngine({ ...base, cylinders }, 1910).smoothness;
    expect(smooth(3)).toBeGreaterThan(smooth(2));
    expect(smooth(3)).toBeLessThan(smooth(4));
    const v6 = computeEngine({ ...base, cylinders: 6, layout: 'v', compression: 7 }, 1952);
    const i6 = computeEngine({ ...base, cylinders: 6, compression: 7 }, 1952);
    expect(v6.smoothness).toBeLessThan(i6.smoothness);
  });

  it('says when the gear ratios do not suit the car', () => {
    const { design } = aiDesign('family', 1925, { style: 'mass', skill: 55, market: 'usa' }, () => 0.5);
    const short = gearboxNotes({ ...design, gearbox: { ...design.gearbox, spread: 0 } }, 1925, 'family');
    expect(short.cons.some((x) => x.includes('çok yakıyor') || x.includes('Son vites kısa'))).toBe(true);
    const long = gearboxNotes({ ...design, gearbox: { ...design.gearbox, spread: 1 } }, 1925, 'family');
    expect(long.pros.some((x) => x.includes('az yakıyor'))).toBe(true);
  });

  it('explains what an engine is good and bad at', () => {
    const typical = aiDesign('family', 1925, { style: 'mass', skill: 55, market: 'usa' }, () => 0.5).design.engine;
    const tiny = engineNotes({ ...typical, cylinders: 2, bore: 60, stroke: 70 }, 1925, 'family');
    expect(tiny.cons.some((x) => x.includes('güçsüz'))).toBe(true);
    expect(tiny.pros.some((x) => x.includes('az yakar'))).toBe(true);
    const knocking = engineNotes({ ...typical, compression: 9 }, 1925, 'family');
    expect(knocking.cons.some((x) => x.includes('Vuruntu'))).toBe(true);
  });

  it('a diesel burns far less fuel but makes less power', () => {
    const { design } = aiDesign('family', 1950, { style: 'mass', skill: 55, market: 'europe' }, () => 0.5);
    const petrol = computeCarStats(design, 1950);
    const diesel = computeCarStats({ ...design, engine: { ...design.engine, fuel: 'diesel', compression: 17 } }, 1950);
    expect(diesel.fuel).toBeLessThan(petrol.fuel * 0.8);
    expect(diesel.engine.powerHp).toBeLessThan(petrol.engine.powerHp);
    expect(diesel.engine.knocking).toBe(false);
  });

  it('focus makes a real difference and a green team guesses widely', () => {
    const all = (k: FocusKey) => Object.fromEntries(FOCUS_KEYS.map((x) => [x, x === k ? 1 : 0])) as Record<FocusKey, number>;
    const perf = bonusFromPoints(all('performance'), 1, 1, 50);
    const econ = bonusFromPoints(all('efficiency'), 1, 1, 50);
    expect(perf.powerMult).toBeGreaterThan(1.2);
    expect(econ.fuelMult).toBeLessThan(0.82);
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 10 });
    expect(experienceFactor(s)).toBeGreaterThan(1.8);
    s.company.modelsLaunched = 6;
    s.company.skill = 70;
    const small = experienceFactor(s);
    s.company.engineers = 25;
    expect(experienceFactor(s)).toBeLessThan(1.1);
    expect(experienceFactor(s)).toBeLessThan(small);
  });

  it('automatic capacity follows demand', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 12 });
    runBot(s, 52 * 2, { segments: ['family'] });
    const m = s.models.find((x) => x.status === 'active')!;
    A.setModelAutoCapacity(s, m.id, true);
    m.lastDemand = { usa: 60, europe: 0 };
    s.company.cash = 5e6;
    autoCapacity(s, () => 100);
    const cap = s.lines.filter((l) => l.modelId === m.id).reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
    expect(cap).toBeGreaterThan(45);
  });
});

describe('research', () => {
  it('new technology must be researched before it goes into a design, and being first costs more', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 3 });
    s.modals = [];
    s.week = 52 * 6; // 1906
    s.company.cash = 200000;
    const r = A.startProject(s, { name: 'T', segment: 'family', targetPrice: 0 });
    if (!r.ok) throw new Error(r.error);
    const p = s.projects[0];
    A.updateDesign(s, r.id, { ...p.design, engine: { ...p.design.engine, valvetrain: 'ohv' } });
    expect(unknownTech(s, s.projects[0].design)).toContain('Üstten supap (OHV)');
    expect(A.beginDevelopment(s, r.id).ok).toBe(false);
    const ohv = researchDef('vt:ohv')!;
    expect(researchCost(ohv, 1904)).toBeGreaterThan(researchCost(ohv, 1914) * 1.8);
    const cash = s.company.cash;
    expect(A.startResearch(s, 'vt:ohv').ok).toBe(true);
    expect(s.company.cash).toBeLessThan(cash);
    for (let i = 0; i < 80 && !s.research!.known.includes('vt:ohv'); i++) {
      tick(s);
      s.modals = [];
    }
    expect(s.research!.known).toContain('vt:ohv');
    expect(A.beginDevelopment(s, r.id).ok).toBe(true);
  });

  it('an older save already knows the technology of its day', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 3 });
    s.week = 52 * 15;
    delete s.research;
    const back = deserialize(serialize(s));
    expect(back.research!.known).toContain('feat:electricStart');
    expect(back.research!.known).not.toContain('gb:synchro');
  });
});

describe('market pressure', () => {
  it('precision tooling costs more up front and builds a tighter car', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 5 });
    s.modals = [];
    const r = A.startProject(s, { name: 'T', segment: 'family', targetPrice: 0 });
    if (!r.ok) throw new Error(r.error);
    const p = s.projects[0];
    p.phase = 'production';
    const soft = A.toolingQuote(s, p, s.lines[0].id, 'soft');
    const precise = A.toolingQuote(s, p, s.lines[0].id, 'precision');
    expect(precise.cost).toBeGreaterThan(soft.cost * 3);
    expect(precise.weeks).toBeGreaterThan(soft.weeks);
    const base = { stats: computeCarStats(p.design, 1900), suppliers: p.suppliers, unitsBuilt: 0 };
    expect(materialUnitCost(s, { ...base, tooling: 'precision' })).toBeLessThan(materialUnitCost(s, { ...base, tooling: 'soft' }));
  });

  it('a model looks dated after two years and a facelift takes most of that away', () => {
    expect(datedPenalty(1.5)).toBe(-0);
    expect(datedPenalty(5)).toBeLessThan(-8);
    expect(datedPenalty(30)).toBe(-20);
    const aged = modelAgeYears({ launchWeek: 0, refreshWeek: 0 }, 52 * 8);
    const faced = modelAgeYears({ launchWeek: 0, refreshWeek: 52 * 7 }, 52 * 8);
    expect(faced).toBeLessThan(aged / 2);
  });

  it('a big price rise soon after launch costs reviews, buzz and reputation', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 13 });
    runBot(s, 52 * 2, { segments: ['family'] });
    const m = s.models.find((x) => x.status === 'active' && (s.week - x.launchWeek) / 52 < 2)!;
    m.hype = 5;
    const rep = s.company.reputation;
    A.setModelPrice(s, m.id, priceNow(m, s.week) * 1.03);
    expect(m.hype).toBe(5);
    A.setModelPrice(s, m.id, priceNow(m, s.week) * 1.3);
    expect(m.hype).toBe(0);
    expect(s.company.reputation).toBeLessThan(rep);
  });

  it('every engineer works on the projects in development', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 14 });
    s.company.engineers = 6;
    const a = A.startProject(s, { name: 'A', segment: 'family', targetPrice: 0 });
    const b = A.startProject(s, { name: 'B', segment: 'city', targetPrice: 0 });
    if (!a.ok || !b.ok) throw new Error('projects');
    A.beginDevelopment(s, a.id);
    expect(s.projects.find((p) => p.id === a.id)!.engineers).toBe(6);
    A.beginDevelopment(s, b.id);
    expect(s.projects.find((p) => p.id === a.id)!.engineers).toBe(3);
  });
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
