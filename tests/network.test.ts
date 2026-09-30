import { describe, expect, it } from 'vitest';
import { newGame, tick } from '../src/core/game';
import * as N from '../src/core/network';
import { deserialize, serialize } from '../src/core/save';
import { yearFloat } from '../src/core/time';
import { STATE_IDS, stateWeights } from '../src/data/states';
import { NEIGHBOURS, STATE_SHAPES } from '../src/data/usmap';
import { runBot } from '../scripts/bot';
import { autoService } from '../src/core/autoservice';
import { costIndex } from '../src/data/economy';
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

  it('weighs a service shop like a dealer in the overhead, the same in the whole bill and the marginal one', () => {
    const s = game();
    const yf = 1930.5;
    const n = N.stateNet(s, 'MI');
    n.dealers = 40;
    const dealersOnly = N.networkOverhead(s, yf);
    n.dealers = 20;
    n.service = 20;
    expect(N.networkOverhead(s, yf)).toBeCloseTo(dealersOnly, 6);
    expect(N.marginalWeekly(s, 0, 1, yf) - N.shopUpkeep(yf)).toBeCloseTo(N.marginalWeekly(s, 1, 0, yf) - N.dealerSupport(yf), 6);
    const before = N.networkWeekly(s, yf);
    const add = N.marginalWeekly(s, 0, 5, yf);
    n.service += 5;
    expect(N.networkWeekly(s, yf) - before).toBeCloseTo(add, 6);
    // The playtest's network of mid-1930 (64 dealers, 767 shops): its overhead was $8.8 mn a year with shops counted twice.
    n.dealers = 64;
    n.service = 767;
    expect(N.networkOverhead(s, yf) * 52).toBeGreaterThan(2.8e6);
    expect(N.networkOverhead(s, yf) * 52).toBeLessThan(3.4e6);
  });

  it('parts and repairs pay for the cars the shops look after, never for idle shops', () => {
    const s = game();
    const yf = 1930;
    const n = N.stateNet(s, 'OH');
    n.dealers = 2;
    n.parc = 20000;
    // Only the dealers' workshops: they keep what they take in.
    expect(N.partsWeekly(s, yf)).toBe(0);
    // Three shops, all of them busy.
    n.service = 3;
    expect(N.partsWeekly(s, yf)).toBeCloseTo(3 * N.partsPerShop(yf), 6);
    // Enough for every car: more shops earn nothing more.
    n.service = 20;
    const all = N.partsWeekly(s, yf);
    expect(N.shopCars(s, 'OH', yf)).toBeLessThan(n.parc);
    expect(all).toBeCloseTo(N.shopCars(s, 'OH', yf) * N.partsPerCar(yf), 6);
    n.service = 60;
    expect(N.partsWeekly(s, yf)).toBeCloseTo(all, 6);
  });

  it('a big network earns back about half its cost from parts and repairs', () => {
    const s = game();
    const yf = 1930.5;
    const n = N.stateNet(s, 'MI');
    // The playtest's network: 1.46 million cars on the road, all looked after.
    n.dealers = 64;
    n.service = 767;
    n.parc = 1.46e6;
    expect(N.serviceQuality(s, 'MI', yf)).toBe(1);
    const share = N.partsWeekly(s, yf) / N.networkWeekly(s, yf);
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });

  it('books parts and repairs in the revenue and on a line of their own', () => {
    const s = game();
    s.company.cash = 1e6;
    N.recordStateSales(s, 'MI', 3000, yearFloat(s.week));
    N.stateNet(s, 'MI').service = 5;
    tick(s);
    const f = s.finance[s.finance.length - 1];
    expect(f.parts).toBeGreaterThan(0);
    expect(f.revenue).toBeCloseTo(f.parts!, 6);
    for (let i = 0; i < 52; i++) tick(s);
    expect(s.years[0].parts).toBeGreaterThan(0);
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

describe('network in bulk', () => {
  /** Cars on the road in a few open states, far more than the dealers can look after. */
  const crowded = () => {
    const s = game();
    const yf = yearFloat(s.week);
    for (const id of ['OH', 'IN'] as const) N.stateNet(s, id).dealers = 1;
    N.recordStateSales(s, 'MI', 20000, yf);
    N.recordStateSales(s, 'OH', 8000, yf);
    N.recordStateSales(s, 'IN', 3000, yf);
    return s;
  };

  it('runs more dealer searches at once as the network grows', () => {
    const s = game();
    expect(N.maxSearches(s)).toBe(1);
    N.stateNet(s, 'MI').dealers = 4;
    expect(N.maxSearches(s)).toBe(2);
    N.stateNet(s, 'MI').dealers = 8;
    expect(N.maxSearches(s)).toBe(3);
    // A search in every free slot, in the neighbouring states with the most buyers.
    const r = N.searchNeighbours(s);
    expect(r.ok).toBe(true);
    expect(N.activeSearches(s)).toBe(3);
    expect(N.nextSearches(s)).toEqual([]);
    expect(N.searchNeighbours(s).ok).toBe(false);
    N.stateNet(s, 'MI').dealers = 1000;
    expect(N.maxSearches(s)).toBe(N.MAX_SEARCHES);
  });

  it('"Servisi yetir" opens every shop the cars need, the worst served first when cash is short', () => {
    const s = crowded();
    const yf = yearFloat(s.week);
    const plan = N.servicePlan(s, yf);
    expect(plan.count).toBeGreaterThan(5);
    expect(plan.cost).toBeCloseTo(plan.count * N.serviceShopCost(yf), 6);
    // Short of cash: as many as it pays for, where owners wait longest.
    s.company.cash = N.serviceShopCost(yf) * 2.5;
    const worst = N.underServed(s, yf, 1)[0];
    const r = N.coverService(s);
    expect(r.ok && r.opened).toBe(2);
    expect(N.stateNet(s, worst).service).toBeGreaterThan(0);
    // With the money, all of them: every state's cars looked after.
    s.company.cash = 1e7;
    expect(N.coverService(s).ok).toBe(true);
    for (const id of ['MI', 'OH', 'IN'] as const) expect(N.serviceQuality(s, id, yf)).toBe(1);
    expect(N.servicePlan(s, yf).count).toBe(0);
    expect(N.coverService(s).ok).toBe(false);
  });

  it('automatic service opens shops monthly above a cash reserve, and closes idle ones', () => {
    const s = crowded();
    const yf = yearFloat(s.week);
    // New games start with it on; older saves (no setting) keep it off.
    expect(s.network!.autoService).toBe(true);
    const old = JSON.parse(serialize(s)) as GameState;
    delete old.network!.autoService;
    expect(deserialize(JSON.stringify(old)).network!.autoService).toBeFalsy();
    N.setAutoService(s, false);
    autoService(s);
    expect(N.totalService(s)).toBe(0);
    N.setAutoService(s, true);
    // Only a little above the reserve: a few shops now, the rest wait for the cash.
    const need = N.servicePlan(s, yf).count;
    s.company.cash = 4000 * costIndex(yf) + N.serviceShopCost(yf) * 3.5;
    autoService(s);
    expect(N.totalService(s)).toBe(3);
    expect(s.network!.autoServiceWaiting).toBe(need - 3);
    expect(s.company.cash).toBeGreaterThan(4000 * costIndex(yf));
    s.company.cash = 1e7;
    autoService(s);
    expect(s.network!.autoServiceWaiting).toBeUndefined();
    expect(N.serviceSatisfaction(s, yf)).toBe(1);
    expect(s.log.some((l) => l.text.startsWith('Otomatik servis'))).toBe(true);
    // The cars go to the scrapyard: the idle shops close, enough stay for those left.
    N.stateNet(s, 'MI').parc = 2000;
    const before = N.stateNet(s, 'MI').service;
    autoService(s);
    expect(N.stateNet(s, 'MI').service).toBeLessThan(before);
    expect(N.serviceQuality(s, 'MI', yf)).toBe(1);
  });

  it('keeps the chosen service target, and closes shops above 1.3 times it', () => {
    const s = crowded();
    const yf = yearFloat(s.week);
    s.company.cash = 1e7;
    // All of it by default, and in older saves that never chose.
    expect(N.serviceTarget(s)).toBe(1);
    const old = JSON.parse(serialize(s)) as GameState;
    delete old.network!.serviceTarget;
    expect(N.serviceTarget(deserialize(JSON.stringify(old)))).toBe(1);
    const full = N.servicePlan(s, yf).count;
    N.setServiceTarget(s, 0.7);
    expect(N.serviceTarget(s)).toBe(1);
    // 80%: fewer shops, and service between the target and full.
    N.setServiceTarget(s, 0.8);
    expect(N.servicePlan(s, yf).count).toBeLessThan(full);
    autoService(s);
    expect(N.serviceSatisfaction(s, yf)).toBeGreaterThanOrEqual(0.8);
    expect(N.serviceSatisfaction(s, yf)).toBeLessThan(1);
    // Back to full service, then down again: the shops above 1.3× the lower target close.
    N.setServiceTarget(s, 1);
    autoService(s);
    expect(N.serviceSatisfaction(s, yf)).toBe(1);
    const shops = N.totalService(s);
    N.setServiceTarget(s, 0.8);
    autoService(s);
    expect(N.totalService(s)).toBeLessThan(shops);
    for (const id of ['MI', 'OH', 'IN'] as const) expect(N.serviceQuality(s, id, yf)).toBeGreaterThanOrEqual(0.8);
    expect(N.servicePlan(s, yf).count).toBe(0);
  });

  it('closes idle shops only once service stays 1.3 times above the need without one', () => {
    const s = game();
    const yf = 1930;
    const n = N.stateNet(s, 'OH');
    n.dealers = 1;
    n.service = 10;
    const per = N.shopServiceCap(yf);
    const cap = N.serviceCapacity(s, 'OH', yf);
    const parcAt = (ratio: number) => (cap - per) / ratio / N.serviceNeed(yf);
    // Without one shop still 1.25× what the cars need: all stay.
    n.parc = parcAt(1.25);
    expect(N.surplusShops(s, 'OH', yf)).toBe(0);
    // 1.35×: the idle ones close, enough stay for 1.2× the need.
    n.parc = parcAt(1.35);
    const idle = N.surplusShops(s, 'OH', yf);
    expect(idle).toBeGreaterThan(0);
    expect(cap - idle * per).toBeGreaterThanOrEqual(1.2 * n.parc * N.serviceNeed(yf) - 1e-6);
    // A lower target leaves more of them idle.
    expect(N.surplusShops(s, 'OH', yf, 0.8)).toBeGreaterThan(idle);
  });

  it("a bought rival's dealers open states the make did not sell in yet", () => {
    const s = game();
    for (const id of ['OH', 'IN', 'IL', 'PA', 'NY', 'WI'] as const) N.stateNet(s, id).dealers = 1;
    const before = new Set(N.openStates(s));
    const picks = N.acquiredDealerStates(s, 4, 'kirkland');
    expect(picks).toHaveLength(4);
    expect(picks.filter((id) => !before.has(id)).length).toBeGreaterThanOrEqual(2);
    // Its strong states are round its own factory, not across the country.
    expect(picks).not.toContain('CA');
    const gained = N.absorbDealers(s, 4, 'Kirkland', 'kirkland');
    expect(gained).toEqual(picks);
    for (const id of gained) expect(N.isOpen(s, id)).toBe(true);
    expect(N.openStates(s).length).toBe(before.size + picks.filter((id) => !before.has(id)).length);
  });
});
