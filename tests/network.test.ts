import { describe, expect, it } from 'vitest';
import { newGame, tick } from '../src/core/game';
import * as N from '../src/core/network';
import { deserialize, serialize } from '../src/core/save';
import { yearFloat } from '../src/core/time';
import { STATE_IDS, stateWeights } from '../src/data/states';
import { NEIGHBOURS, STATE_SHAPES } from '../src/data/usmap';
import { runBot } from '../scripts/bot';
import type { GameState } from '../src/core/types';

// The American market, state by state: sell at home first, grow into neighbouring
// states one dealer search at a time, pay freight out of state, and keep the cars on
// the road serviced.

const game = (city: 'detroit' | 'losangeles' | 'newyork' = 'detroit', seed = 1) => {
  const s = newGame({ companyName: 'Test', city, seed });
  s.modals = [];
  return s;
};

/** Finish a dealer search at once, found or not. */
function settle(s: GameState, id: (typeof STATE_IDS)[number], found: boolean) {
  const n = N.stateNet(s, id);
  n.search = { until: s.week, chance: found ? 1 : 0 };
  N.networkWeek(s);
}

describe('map data', () => {
  it('has the 48 states, each drawn, with symmetric borders', () => {
    expect(STATE_IDS).toHaveLength(48);
    for (const id of STATE_IDS) {
      expect(STATE_SHAPES[id]?.d.length).toBeGreaterThan(20);
      for (const nb of NEIGHBOURS[id] ?? []) expect(NEIGHBOURS[nb]).toContain(id);
    }
    expect(NEIGHBOURS.MI.sort()).toEqual(['IN', 'OH', 'WI']);
    const w = stateWeights(1901);
    expect(Object.values(w).reduce((a, x) => a + x, 0)).toBeCloseTo(1, 6);
    // The rich East buys most of the first cars; California grows.
    expect(w.NY).toBeGreaterThan(w.TX);
    expect(stateWeights(1955).CA).toBeGreaterThan(w.CA);
  });
});

describe('state network', () => {
  it('starts in the home state only, and grows into neighbours by dealer searches', () => {
    const s = game();
    expect(N.openStates(s)).toEqual(['MI']);
    expect(N.frontier(s).sort()).toEqual(['IN', 'OH', 'WI']);
    expect(N.canSearch(s, 'CA').ok).toBe(false);
    expect(N.canSearch(s, 'OH').ok).toBe(true);
    expect(N.startDealerSearch(s, 'OH').ok).toBe(true);
    // One search at a time for a young firm.
    expect(N.canSearch(s, 'IN').ok).toBe(false);
    settle(s, 'OH', false);
    expect(N.isOpen(s, 'OH')).toBe(false);
    expect(N.stateNet(s, 'OH').tries).toBe(1);
    N.startDealerSearch(s, 'OH');
    settle(s, 'OH', true);
    expect(N.openStates(s).sort()).toEqual(['MI', 'OH']);
    expect(N.stateNet(s, 'OH').firstDealer).toBeTruthy();
    // Pennsylvania borders Ohio: now within reach.
    expect(N.frontier(s)).toContain('PA');
  });

  it('charges freight out of the home state only, more the farther away', () => {
    const s = game();
    const yf = yearFloat(s.week);
    expect(N.freightPerCar(s, 'MI', yf)).toBe(0);
    expect(N.freightPerCar(s, 'OH', yf)).toBeGreaterThan(0);
    expect(N.freightPerCar(s, 'CA', yf)).toBeGreaterThan(3 * N.freightPerCar(s, 'OH', yf));
    const la = game('losangeles');
    expect(N.freightPerCar(la, 'CA', yf)).toBe(0);
    expect(N.freightPerCar(la, 'NY', yf)).toBeGreaterThan(N.freightPerCar(s, 'NY', yf));
    const before = s.company.cash;
    expect(N.recordStateSales(s, 'OH', 10, yf)).toBeCloseTo(10 * N.freightPerCar(s, 'OH', yf), 6);
    expect(s.company.cash).toBeCloseTo(before - 10 * N.freightPerCar(s, 'OH', yf), 6);
  });

  it('sells nowhere a dealer does not reach, and more where coverage is wider', () => {
    const s = game();
    runBot(s, 52 * 3, { segments: ['family'] });
    const yf = yearFloat(s.week);
    const closed = STATE_IDS.filter((id) => !N.isOpen(s, id));
    expect(closed.length).toBeGreaterThan(0);
    for (const id of closed) expect(s.network!.states[id]?.sold ?? 0).toBe(0);
    const open = N.openStates(s).find((id) => id !== 'MI')!;
    const reach = N.stateReach(s, open, yf);
    N.stateNet(s, open).dealers += 3;
    expect(N.stateReach(s, open, yf)).toBeGreaterThan(reach);
  });

  it('service falls short as cars pile up, and a shop puts it right', () => {
    const s = game();
    const yf = yearFloat(s.week);
    expect(N.serviceQuality(s, 'MI', yf)).toBe(1);
    N.recordStateSales(s, 'MI', 5000, yf);
    const q = N.serviceQuality(s, 'MI', yf);
    expect(q).toBeLessThan(0.3);
    expect(N.underServed(s, yf)).toContain('MI');
    s.company.cash = 1e6;
    expect(N.openServiceShop(s, 'MI').ok).toBe(true);
    expect(N.serviceQuality(s, 'MI', yf)).toBeGreaterThan(q);
    // Where repairs wait, buyers stay away.
    expect(N.serviceFactor(s, 'MI', yf)).toBeLessThan(1);
    expect(N.openServiceShop(s, 'CA').ok).toBe(false);
  });

  it('old cars go to the scrapyard, sooner without service', () => {
    const run = (shops: number) => {
      const s = game();
      s.company.cash = 1e7;
      N.recordStateSales(s, 'MI', 2000, yearFloat(s.week));
      N.stateNet(s, 'MI').service = shops;
      for (let i = 0; i < 52 * 10; i++) N.networkWeek(s);
      return N.stateNet(s, 'MI');
    };
    const neglected = run(0);
    const kept = run(10);
    expect(neglected.scrapped).toBeGreaterThan(0);
    expect(neglected.parc + neglected.scrapped).toBeCloseTo(2000, 3);
    expect(neglected.parc).toBeLessThan(kept.parc);
    expect(neglected.parcAge).toBeGreaterThan(5);
  });

  it('costs more than its size: overhead grows faster than the network', () => {
    const s = game();
    const yf = 1930;
    const at = (dealers: number) => {
      N.stateNet(s, 'MI').dealers = dealers;
      return N.networkOverhead(s, yf);
    };
    const small = at(10);
    const big = at(100);
    expect(big / small).toBeGreaterThan(30);
    expect(N.marginalWeekly(s, 1, 0, yf)).toBeGreaterThan(N.dealerSupport(yf));
  });

  it('brings an old save to the American, state-by-state game', () => {
    const s = game();
    runBot(s, 52 * 6, { segments: ['family'] });
    const old = JSON.parse(serialize(s)) as GameState;
    delete old.network;
    old.company.hq = 'europe';
    old.markets.europe.unlocked = true;
    old.markets.usa.dealerLevel = 3;
    for (const m of old.models) m.markets = ['usa', 'europe'];
    const loaded = deserialize(JSON.stringify(old));
    expect(loaded.company.hq).toBe('usa');
    expect(loaded.markets.europe.unlocked).toBe(false);
    expect(loaded.models.every((m) => m.markets.join() === 'usa')).toBe(true);
    expect(N.openStates(loaded).length).toBeGreaterThan(5);
    expect(N.totalParc(loaded)).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) tick(loaded);
  });
});
