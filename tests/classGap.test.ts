import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { newGame } from '../src/core/game';
import { classGap, gapNames, researchDefs } from '../src/core/research';
import { yearFloat } from '../src/core/time';
import { computeCarStats } from '../src/core/vehicle';
import type { CarDesign, GameState, MarketId, RivalModel, SegmentId } from '../src/core/types';

// The playtester's 1936 family car: safety glass, heater and radio not researched, and nothing told
// them most rivals already had them.

const YEAR = 1936;

/** A plain family car of the day; the rivals below differ only in what they add to it. */
const base: CarDesign = {
  chassis: 'ladder',
  body: 'sedan',
  size: 0.5,
  styling: 0.3,
  engine: { cylinders: 6, layout: 'inline', bore: 85, stroke: 110, compression: 6, valvetrain: 'sv', fuelSystem: 'carb', aspiration: 'na' },
  gearbox: { type: 'sliding', gears: 3, spread: 0.4 },
  suspension: 'leaf',
  suspBalance: 0.4,
  features: ['electricStart', 'electricLights', 'fourWheelBrakes', 'steelBody'],
  interior: 0.3,
  knowhow: [],
};

function rival(s: GameState, patch: Partial<CarDesign>, o: { segment?: SegmentId; markets?: MarketId[]; active?: boolean } = {}): RivalModel {
  const design = { ...base, ...patch };
  const rm: RivalModel = {
    id: `r${s.nextId++}`,
    companyId: s.rivals[0].id,
    name: 'Test',
    segment: o.segment ?? 'family',
    launchWeek: s.week,
    design,
    stats: computeCarStats(design, YEAR),
    price: 800,
    priceIndexAtLaunch: 1,
    markets: o.markets ?? ['usa'],
    active: o.active ?? true,
    unitsSold: 0,
  };
  s.rivalModels.push(rm);
  return rm;
}

function game(): GameState {
  const s = newGame({ companyName: 'Test', hq: 'usa', seed: 3 });
  s.modals = [];
  s.week = 52 * (YEAR - 1900);
  s.company.cash = 5_000_000;
  s.rivalModels = [];
  // Everything of the day is known except what the playtester had missed (and balloon tyres).
  const missed = ['feat:safetyGlass', 'feat:heater', 'feat:radio', 'gb:synchro', 'kh:balloonTires'];
  s.research = { known: researchDefs().filter((d) => d.year <= YEAR && !missed.includes(d.id)).map((d) => d.id), active: [], queue: [] };
  return s;
}

const add = (...f: CarDesign['features']) => [...base.features, ...f];

describe('what most of the class has and the design lacks', () => {
  it('lists what more than half of the class’s rivals at home have, with how each can be had', () => {
    const s = game();
    const yf = yearFloat(s.week);
    const leader = rival(s, { features: add('safetyGlass', 'heater', 'radio', 'hydraulicBrakes', 'fuelGauge'), gearbox: { ...base.gearbox, type: 'synchro' }, knowhow: ['kh:balloonTires'] });
    // An automatic counts as having the easy shift of a synchromesh box.
    rival(s, { features: add('safetyGlass', 'heater', 'hydraulicBrakes', 'fuelGauge'), gearbox: { ...base.gearbox, type: 'automatic', gears: 4 }, knowhow: ['kh:balloonTires'] });
    rival(s, { features: add('safetyGlass', 'heater', 'radio', 'fuelGauge'), gearbox: { ...base.gearbox, type: 'synchro' }, knowhow: ['kh:balloonTires'] });
    rival(s, { features: add('heater'), suspension: 'ifs' });
    // Not in the comparison: another class, a car sold only in Europe, a car no longer on sale.
    rival(s, {}, { segment: 'luxury' });
    rival(s, {}, { markets: ['europe'] });
    rival(s, {}, { active: false });

    // The heater is being researched, safety glass waits in the queue (the only slot is taken).
    expect(A.startResearch(s, 'feat:heater').ok).toBe(true);
    expect(A.queueResearch(s, 'feat:safetyGlass').ok).toBe(true);
    expect(s.research!.queue).toEqual(['feat:safetyGlass']);

    const design: CarDesign = { ...base, features: add('hydraulicBrakes') };
    const gap = classGap(s, design, 'family', yf);
    expect(gap.basis).toBe('rivals');
    expect(gap.cars).toBe(4);
    // Radio and hydraulic brakes are in exactly half: not "most". One car with IFS is not either.
    expect(gap.items.map((x) => [x.id, x.state, x.count])).toEqual([
      ['feat:fuelGauge', 'fit', 3],
      ['feat:heater', 'researching', 4],
      ['feat:safetyGlass', 'queued', 3],
      ['kh:balloonTires', 'available', 3],
      ['gb:synchro', 'available', 3],
    ]);
    expect(gapNames(gap.items)).toBe('Yakıt göstergesi, Kalorifer, Lamine emniyet camı ve 2 şey daha');

    // Fitted what is known and chose an automatic: those leave the list.
    const better: CarDesign = { ...design, features: [...design.features, 'fuelGauge'], gearbox: { ...base.gearbox, type: 'automatic', gears: 4 } };
    expect(classGap(s, better, 'family', yf).items.map((x) => x.id)).toEqual(['feat:heater', 'feat:safetyGlass', 'kh:balloonTires']);
    expect(gapNames(classGap(s, better, 'family', yf).items)).toBe('Kalorifer, Lamine emniyet camı ve Balon lastik');
    // A car with all the class has: nothing to show.
    expect(classGap(s, leader.design, 'family', yf).items).toEqual([]);
  });

  it('with no rival in the class, compares with the class’s typical new car', () => {
    const s = game();
    rival(s, { features: add('safetyGlass', 'heater', 'radio') }, { segment: 'luxury' });
    const gap = classGap(s, base, 'family', yearFloat(s.week));
    expect(gap.basis).toBe('typical');
    expect(gap.cars).toBe(2);
    const ids = gap.items.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['feat:safetyGlass', 'feat:heater', 'feat:radio']));
    expect(gap.items.find((x) => x.id === 'feat:radio')!.state).toBe('available');
  });
});
