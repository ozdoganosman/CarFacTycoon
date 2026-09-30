import { cityDef } from '../data/cities';
import { capexScale, costIndex } from '../data/economy';
import { marketScale } from '../data/markets';
import { interp } from '../data/tech';
import { STATE_IDS, stateDef, statePop, stateSegmentWeights, stateWeights, type StateId } from '../data/states';
import { CITY_XY, NEIGHBOURS, STATE_SHAPES } from '../data/usmap';
import { rand } from './rng';
import { yearFloat, yearOf } from './time';
import type { GameState, NetworkState, SegmentId, StateNet } from './types';
import { clamp, decide, log, money, num, spend } from './util';
import { list, t } from '../i18n';

// The company across the country, state by state. Cars are only sold where the make has
// a dealer; the network grows into neighbouring states by dealer searches (one at a time
// for a young firm, more as the sales department grows). Every car sold stays on the road
// there for years and needs service; where there is too little, owners grumble, cars die
// young and buyers stay away. A bigger network costs more than its size: zone offices,
// travelling men, parts depots (see networkWeekly).

// ---------------- places ----------------

export const homeCity = (s: GameState) => cityDef(s.company.city);
export const homeState = (s: GameState): StateId => homeCity(s).state;

/** Miles per unit of map distance, with a detour factor for the railway. */
const RAIL_MILES = 3.05 * 1.2;

/** Rail miles from the factory to a state (its middle), by map distance with a detour factor. */
export function railMiles(s: GameState, id: StateId): number {
  const [x, y] = CITY_XY[homeCity(s).id];
  const [lx, ly] = STATE_SHAPES[id].label;
  return Math.hypot(lx - x, ly - y) * RAIL_MILES;
}

/** Freight per car to a state: nothing at home; trucks and car carriers made it cheaper after 1920. */
export function freightPerCar(s: GameState, id: StateId, yf: number): number {
  if (id === homeState(s)) return 0;
  const rate = 0.07 * interp([[1900, 1], [1920, 1], [1935, 0.6], [1960, 0.45]], yf) * homeCity(s).freight;
  return (12 + railMiles(s, id) * rate) * costIndex(yf);
}

// ---------------- state of the network ----------------

function blank(): StateNet {
  return { dealers: 0, service: 0, awareness: 0, parc: 0, parcAge: 0, scrapped: 0, sold: 0, soldYear: 0, soldLastYear: 0 };
}

/** The network, made on first use (new game, or an old save). */
export function network(s: GameState): NetworkState {
  if (!s.network) {
    const home = homeState(s);
    s.network = { states: { [home]: { ...blank(), awareness: 0.15, openedWeek: s.week } }, year: yearOf(s.week) };
  }
  return s.network;
}

export function stateNet(s: GameState, id: StateId): StateNet {
  const n = network(s);
  return (n.states[id] ??= blank());
}

const peek = (s: GameState, id: StateId): StateNet | undefined => network(s).states[id];

/** The factory's own showroom sells in the home state like two or three dealers. */
const HOME_STORE = 2.5;

/** Whether the make sells in a state at all. */
export function isOpen(s: GameState, id: StateId): boolean {
  return id === homeState(s) || (peek(s, id)?.dealers ?? 0) > 0;
}

export const openStates = (s: GameState) => STATE_IDS.filter((id) => isOpen(s, id));
export const STATE_LIST = STATE_IDS;

export function totalDealers(s: GameState): number {
  return Object.values(network(s).states).reduce((a, n) => a + (n?.dealers ?? 0), 0);
}
export function totalService(s: GameState): number {
  return Object.values(network(s).states).reduce((a, n) => a + (n?.service ?? 0), 0);
}
export function totalParc(s: GameState): number {
  return Object.values(network(s).states).reduce((a, n) => a + (n?.parc ?? 0), 0);
}

/**
 * Dealers it takes to reach half the buyers of a state: more in a big one, and more once
 * the car left the rich city streets for every farm and small town.
 */
export function halfDealers(id: StateId, yf: number): number {
  const spread = interp([[1900, 0.5], [1925, 1], [1960, 1.1]], yf);
  return (0.5 + 0.8 * Math.pow(statePop(id, yf) / 1000, 0.75)) * spread;
}

/**
 * Buyers near the factory prefer the local make (they can see it built and get it mended);
 * the preference fades with distance, and over the decades as national makes spread.
 */
export function localPreference(s: GameState, id: StateId, yf: number): number {
  const strength = interp([[1900, 12], [1915, 9], [1925, 5], [1940, 2.5], [1960, 1.5]], yf);
  const miles = id === homeState(s) ? 0 : railMiles(s, id);
  return strength * Math.exp(-miles / 400);
}

/** Share of a state's buyers who have one of our showrooms within reach. */
export function coverage(s: GameState, id: StateId, yf: number): number {
  const d = (peek(s, id)?.dealers ?? 0) + (id === homeState(s) ? HOME_STORE : 0);
  return d <= 0 ? 0 : d / (d + halfDealers(id, yf));
}

// ---------------- service ----------------

/** Cars a dealer's workshop and a service shop can look after; both grew with the trade. */
export const dealerServiceCap = (yf: number) => interp([[1900, 60], [1920, 250], [1960, 700]], yf);
export const shopServiceCap = (yf: number) => interp([[1900, 300], [1920, 1200], [1960, 4000]], yf);
/** Work a car needs: early cars broke all the time. */
const serviceNeed = (yf: number) => interp([[1900, 1.5], [1925, 1], [1960, 0.6]], yf);

export function serviceCapacity(s: GameState, id: StateId, yf: number): number {
  const n = peek(s, id);
  const home = id === homeState(s) ? shopServiceCap(yf) : 0;
  return (n?.dealers ?? 0) * dealerServiceCap(yf) + (n?.service ?? 0) * shopServiceCap(yf) + home;
}

/** 1 when every car on the road here can be looked after; less when owners wait for repairs. */
export function serviceQuality(s: GameState, id: StateId, yf: number): number {
  const parc = peek(s, id)?.parc ?? 0;
  if (parc < 1) return 1;
  return clamp(serviceCapacity(s, id, yf) / (parc * serviceNeed(yf)), 0, 1);
}

/** Owners' view of service across the country (weighted by cars on the road). */
export function serviceSatisfaction(s: GameState, yf: number): number {
  let parc = 0;
  let q = 0;
  for (const id of STATE_IDS) {
    const p = peek(s, id)?.parc ?? 0;
    if (p <= 0) continue;
    parc += p;
    q += p * serviceQuality(s, id, yf);
  }
  return parc > 0 ? q / parc : 1;
}

// ---------------- sales weight ----------------

/** How many of a state's buyers see our cars at all: showrooms, and knowing the name. */
export function stateReach(s: GameState, id: StateId, yf: number): number {
  const cov = coverage(s, id, yf);
  if (cov <= 0) return 0;
  const aw = peek(s, id)?.awareness ?? 0;
  const home = id === homeState(s) ? 1.3 : 1;
  return cov * (0.35 + 0.65 * aw) * home;
}

/** Word gets round: where owners wait weeks for a repair, fewer buy (only once there are cars to talk of). */
export function serviceFactor(s: GameState, id: StateId, yf: number): number {
  const parc = peek(s, id)?.parc ?? 0;
  const q = serviceQuality(s, id, yf);
  const weight = clamp(parc / 200, 0, 1);
  return 1 - weight * 0.4 * (1 - q);
}

/** The country's buyers our showrooms reach, all states together (for the "reach" figures). */
export function nationalReach(s: GameState, yf: number): number {
  const w = stateWeights(yf);
  return STATE_IDS.reduce((a, id) => a + w[id] * stateReach(s, id, yf), 0);
}

const segCache = new Map<string, Record<StateId, number>>();
/** A state's share of one class's buyers (cached by quarter). */
export function segmentStateWeights(segment: SegmentId, yf: number): Record<StateId, number> {
  const key = `${Math.floor(yf * 4)}:${segment}`;
  let w = segCache.get(key);
  if (!w) {
    if (segCache.size > 400) segCache.clear();
    w = stateSegmentWeights(Math.floor(yf * 4) / 4, segment);
    segCache.set(key, w);
  }
  return w;
}

const REACH_EXP = 0.6;
const TAU = 7;

/**
 * The most of a state's class one model can take, however good it is: buyers who never walk into our
 * showrooms or do not trust the name stay with the makes they know. About 30% with showrooms everywhere
 * and a good name; much less with a thin network or a poor reputation. Rivals meet the same limit.
 */
export const shareCap = (reach: number, reputation: number) => (0.08 + 0.2 * Math.min(1, reach)) * (0.75 + 0.005 * reputation);

/** The share cap for our models in one state (our showrooms there, our name). */
export function modelShareCap(s: GameState, id: StateId, yf: number): number {
  return shareCap(stateReach(s, id, yf), s.company.reputation);
}

/**
 * A model's odds against everyone else in a state, bent softly toward the cap: well under it nothing
 * changes, far over it the model takes about the cap.
 */
export const cappedOdds = (odds: number, cap: number) => {
  const k = cap / (1 - cap);
  return odds / Math.cbrt(1 + (odds / k) ** 3);
};

/**
 * Our models' weekly buyers in one class, state by state. `utility` is each model's
 * pull (appeal, price, brand…) and `price` the part of it that is the price; `others` is
 * everyone else's weight (rivals and the small makers), who sell everywhere. The share
 * cap bends what the car itself draws, a price under the class included (a cheap car does
 * not reach buyers who never see the showroom); a price over the class then works in
 * full on top, so it still costs buyers even for a car at the cap.
 */
export function playerStateDemand(
  s: GameState,
  models: { id: string; utility: number; price?: number }[],
  demand: number,
  others: number,
  segment: SegmentId,
  yf: number,
): { units: Record<string, number>; byState: Record<string, Partial<Record<StateId, number>>> } {
  const units: Record<string, number> = {};
  const byState: Record<string, Partial<Record<StateId, number>>> = {};
  for (const m of models) {
    units[m.id] = 0;
    byState[m.id] = {};
  }
  const w = segmentStateWeights(segment, yf);
  for (const id of STATE_IDS) {
    const reach = stateReach(s, id, yf);
    if (reach <= 0) continue;
    const pull = Math.pow(reach, REACH_EXP) * serviceFactor(s, id, yf);
    const local = localPreference(s, id, yf);
    const cap = modelShareCap(s, id, yf);
    const weights = models.map((m) => {
      const price = Math.min(0, m.price ?? 0);
      const odds = (pull * Math.exp((m.utility - price + local) / TAU)) / others;
      return others * cappedOdds(odds, cap) * Math.exp(price / TAU);
    });
    const total = weights.reduce((a, x) => a + x, 0) + others;
    const d = demand * w[id];
    models.forEach((m, i) => {
      const u = (d * weights[i]) / total;
      units[m.id] += u;
      byState[m.id][id] = u;
    });
  }
  return { units, byState };
}

/** Record cars sold into a state: on the road there from now on (and the freight, if away from home). */
export function recordStateSales(s: GameState, id: StateId, units: number, yf: number): number {
  if (units <= 0) return 0;
  const n = stateNet(s, id);
  n.parcAge = (n.parc * n.parcAge) / (n.parc + units);
  n.parc += units;
  n.sold += units;
  n.soldYear += units;
  const freight = units * freightPerCar(s, id, yf);
  if (freight > 0) {
    spend(s, freight, 'freight');
    n.freightYear = (n.freightYear ?? 0) + freight;
  }
  return freight;
}

// ---------------- costs ----------------

/**
 * What a dealer costs the factory grew with the trade: the first agents were bicycle shops
 * selling a few cars on commission; by the 1920s a franchise meant training, parts stock,
 * the zone man's visits and co-operative advertising.
 */
const tradeScale = (yf: number) => interp([[1900, 0.3], [1912, 0.55], [1925, 1], [1950, 1.6], [1960, 1.8]], yf);

/** Weekly support per dealer (training, catalogues, the travelling man) and per service shop. */
export const dealerSupport = (yf: number) => 5 * tradeScale(yf) * costIndex(yf);
export const shopUpkeep = (yf: number) => 25 * tradeScale(yf) * costIndex(yf);

/**
 * Running a network costs more than its parts: zone offices, parts depots, inspectors.
 * It grows faster than the network (a size of 100 costs about 40× a size of 10).
 */
export function networkOverhead(s: GameState, yf: number): number {
  const size = totalDealers(s) + 2 * totalService(s);
  return OVERHEAD * Math.pow(size, OVERHEAD_EXP) * tradeScale(yf) * costIndex(yf);
}
const OVERHEAD = 0.9;
const OVERHEAD_EXP = 1.6;

export function networkWeekly(s: GameState, yf = yearFloat(s.week)): number {
  return totalDealers(s) * dealerSupport(yf) + totalService(s) * shopUpkeep(yf) + networkOverhead(s, yf);
}

/** What one more dealer (or shop) would add to the weekly bill, overhead included. */
export function marginalWeekly(s: GameState, dealers: number, shops: number, yf = yearFloat(s.week)): number {
  const size = totalDealers(s) + 2 * totalService(s);
  const extra = OVERHEAD * (Math.pow(size + dealers + 2 * shops, OVERHEAD_EXP) - Math.pow(size, OVERHEAD_EXP)) * tradeScale(yf) * costIndex(yf);
  return dealers * dealerSupport(yf) + shops * shopUpkeep(yf) + extra;
}

// ---------------- dealer search ----------------

/** States one step out: next to a state where the make already sells. */
export function frontier(s: GameState): StateId[] {
  const open = new Set(openStates(s));
  const out = new Set<StateId>();
  for (const id of open) for (const nb of NEIGHBOURS[id] ?? []) if (!open.has(nb)) out.add(nb);
  return [...out];
}

/** Dealers that give the sales department one more search at a time, and the most it runs. */
export const DEALERS_PER_SEARCH = 4;
export const MAX_SEARCHES = 12;
/** One search at a time for a young firm; every few dealers the sales department runs one more. */
export const maxSearches = (s: GameState) => Math.min(MAX_SEARCHES, 1 + Math.floor(totalDealers(s) / DEALERS_PER_SEARCH));
export const activeSearches = (s: GameState) => Object.values(network(s).states).filter((n) => n?.search).length;

export function canSearch(s: GameState, id: StateId): { ok: true } | { ok: false; why: string } {
  const n = peek(s, id);
  if (n?.search) return { ok: false, why: t('Burada zaten bayi aranıyor.') };
  if (!isOpen(s, id) && !frontier(s).includes(id)) return { ok: false, why: t('Önce komşu bir eyalette satış yapmalısın: ağ eyalet eyalet büyür.') };
  if (activeSearches(s) >= maxSearches(s))
    return {
      ok: false,
      why:
        maxSearches(s) < MAX_SEARCHES
          ? t('Aynı anda en çok {n} eyalette bayi aranabilir; her {per} bayi bir arama daha açar.', { n: maxSearches(s), per: DEALERS_PER_SEARCH })
          : t('Aynı anda en çok {n} eyalette bayi aranabilir.', { n: maxSearches(s) }),
    };
  return { ok: true };
}

/** Advertising in the local papers and the travelling man's weeks: cheaper where we already sell. */
export function searchCost(s: GameState, id: StateId, yf = yearFloat(s.week)): number {
  const size = 60 + 30 * Math.sqrt(statePop(id, yf) / 1000);
  return size * (isOpen(s, id) ? 0.6 : 1) * costIndex(yf) * Math.sqrt(capexScale(yf));
}

/** Signs, tools, a demonstrator car: paid when a dealer signs. */
export const dealerOpeningCost = (yf: number) => 250 * costIndex(yf) * Math.sqrt(capexScale(yf));
export const serviceShopCost = (yf: number) => 900 * costIndex(yf) * Math.sqrt(capexScale(yf));
/** The first few states: bicycle and carriage shops were keen to take on a motor car. */
const early = (s: GameState) => openStates(s).length < 4;
export const searchWeeks = (s: GameState, id: StateId) => (isOpen(s, id) ? 8 : early(s) ? 8 : 13);

/** Chance a search finds someone to sign: a known, well-thought-of make finds dealers easily. */
export function searchChance(s: GameState, id: StateId): number {
  const n = peek(s, id);
  const rep = s.company.reputation;
  const nearbyCars = (NEIGHBOURS[id] ?? []).reduce((a, nb) => a + (peek(s, nb)?.parc ?? 0), 0);
  const known = Math.min(0.15, nearbyCars / 4000);
  // The first two states beyond home always find a dealer: a newcomer's first steps should not hang on luck.
  if (!isOpen(s, id) && openStates(s).length < 3) return 1;
  const base = isOpen(s, id) ? 0.7 : early(s) ? 0.62 : 0.38;
  return clamp(base + 0.006 * (rep - 30) + known + 0.1 * Math.min(3, n?.tries ?? 0), 0.12, 0.92);
}

export function startDealerSearch(s: GameState, id: StateId): { ok: true } | { ok: false; error: string } {
  const c = canSearch(s, id);
  if (!c.ok) return { ok: false, error: c.why };
  const yf = yearFloat(s.week);
  const cost = searchCost(s, id, yf);
  if (s.company.cash < cost) return { ok: false, error: t('Bayi aramak {cost} tutar.', { cost: money(cost) }) };
  spend(s, cost, 'dealers');
  const n = stateNet(s, id);
  n.search = { until: s.week + searchWeeks(s, id), chance: searchChance(s, id) };
  decide(s, `dealer:${id}`, `${stateDef(id).name}: bayi aranıyor (${money(cost)})`);
  return { ok: true };
}

/** Where a search in every free slot would go: the neighbouring states with the most buyers. */
export function nextSearches(s: GameState, yf = yearFloat(s.week)): StateId[] {
  const free = maxSearches(s) - activeSearches(s);
  if (free <= 0) return [];
  const w = stateWeights(yf);
  return frontier(s)
    .filter((id) => canSearch(s, id).ok)
    .sort((a, b) => w[b] - w[a])
    .slice(0, free);
}

/** "Komşularda bayi ara": start a search in every free slot at once (see nextSearches). */
export function searchNeighbours(s: GameState): { ok: true; states: StateId[] } | { ok: false; error: string } {
  const yf = yearFloat(s.week);
  const ids = nextSearches(s, yf);
  if (!ids.length)
    return {
      ok: false,
      error: activeSearches(s) >= maxSearches(s) ? t('Aynı anda en çok {n} eyalette bayi aranabilir.', { n: maxSearches(s) }) : t('Bayi aranabilecek komşu eyalet kalmadı.'),
    };
  const cost = ids.reduce((a, id) => a + searchCost(s, id, yf), 0);
  if (s.company.cash < cost) return { ok: false, error: t('Bu aramalar {cost} tutar.', { cost: money(cost) }) };
  for (const id of ids) startDealerSearch(s, id);
  return { ok: true, states: ids };
}

const DEALER_SURNAMES = ['Harper', 'Whitcomb', 'Doyle', 'Mercer', 'Lindqvist', 'Sutton', 'Kessler', 'Abbott', 'Brennan', 'Talbot', 'Ashford', 'Novak', 'Pruitt', 'Garrity', 'Holloway', 'Everett', 'Crane', 'Vance', 'Morrow', 'Stroud'];
const DEALER_KINDS = ['& Sons Motor Co.', 'Garage', 'Auto Sales', 'Motor Car Agency', 'Brothers Motors', 'Carriage & Motor Works'];

function dealerName(s: GameState): string {
  const a = DEALER_SURNAMES[Math.floor(rand(s) * DEALER_SURNAMES.length)];
  const b = DEALER_KINDS[Math.floor(rand(s) * DEALER_KINDS.length)];
  return `${a} ${b}`;
}

export function closeDealer(s: GameState, id: StateId): { ok: true } | { ok: false; error: string } {
  const n = peek(s, id);
  if (!n || n.dealers <= 0) return { ok: false, error: t('Burada kapatılacak bayi yok.') };
  n.dealers -= 1;
  // A closed showroom is noticed.
  n.awareness *= 0.9;
  decide(s, `dealer:${id}`, `${stateDef(id).name}: bir bayi kapatıldı (${n.dealers} kaldı)`);
  return { ok: true };
}

export function openServiceShop(s: GameState, id: StateId): { ok: true } | { ok: false; error: string } {
  if (!isOpen(s, id)) return { ok: false, error: t('Servis ancak bayisi olan bir eyalette açılabilir.') };
  const cost = serviceShopCost(yearFloat(s.week));
  if (s.company.cash < cost) return { ok: false, error: t('Servis atölyesi {cost} tutar.', { cost: money(cost) }) };
  spend(s, cost, 'investment');
  const n = stateNet(s, id);
  n.service += 1;
  decide(s, `service:${id}`, `${stateDef(id).name}: servis atölyesi açıldı (${n.service})`);
  return { ok: true };
}

export function closeServiceShop(s: GameState, id: StateId): { ok: true } | { ok: false; error: string } {
  const n = peek(s, id);
  if (!n || n.service <= 0) return { ok: false, error: t('Burada kapatılacak servis yok.') };
  n.service -= 1;
  decide(s, `service:${id}`, `${stateDef(id).name}: servis atölyesi kapatıldı (${n.service} kaldı)`);
  return { ok: true };
}

/** States where service falls short, worst first (only where there are cars to look after). */
export function underServed(s: GameState, yf = yearFloat(s.week), below = 0.8): StateId[] {
  return STATE_IDS.filter((id) => (peek(s, id)?.parc ?? 0) > 100 && serviceQuality(s, id, yf) < below).sort(
    (a, b) => serviceQuality(s, a, yf) - serviceQuality(s, b, yf),
  );
}

// ---------------- service in bulk ----------------

/** Room left above today's need when shops open: the cars sold next month need service too. */
const SERVICE_ROOM = 1.1;

/** Shops a state needs for every car on the road there to be looked after (none where it already is, or where the make does not sell). */
export function shopsNeeded(s: GameState, id: StateId, yf: number): number {
  const parc = peek(s, id)?.parc ?? 0;
  if (parc < 1 || !isOpen(s, id)) return 0;
  const need = parc * serviceNeed(yf);
  const cap = serviceCapacity(s, id, yf);
  return cap >= need ? 0 : Math.ceil((need * SERVICE_ROOM - cap) / shopServiceCap(yf));
}

export interface ServicePlan {
  /** Shops to open, state by state, the worst served first. */
  states: { id: StateId; shops: number }[];
  count: number;
  cost: number;
}

/**
 * The shops it takes for every car on the road to be looked after. With a budget, as many
 * as it pays for, each one where owners wait longest.
 */
export function servicePlan(s: GameState, yf = yearFloat(s.week), budget = Infinity): ServicePlan {
  const price = serviceShopCost(yf);
  const per = shopServiceCap(yf);
  const want = STATE_IDS.map((id) => ({
    id,
    max: shopsNeeded(s, id, yf),
    shops: 0,
    have: serviceCapacity(s, id, yf),
    need: (peek(s, id)?.parc ?? 0) * serviceNeed(yf),
  })).filter((x) => x.max > 0);
  const total = want.reduce((a, x) => a + x.max, 0);
  let left = Math.floor(Math.max(0, budget) / price);
  if (left >= total) for (const x of want) x.shops = x.max;
  else
    for (; left > 0; left--) {
      let pick: (typeof want)[number] | undefined;
      for (const x of want) if (x.shops < x.max && (!pick || (x.have + x.shops * per) / x.need < (pick.have + pick.shops * per) / pick.need)) pick = x;
      if (!pick) break;
      pick.shops += 1;
    }
  const states = want
    .filter((x) => x.shops > 0)
    .sort((a, b) => a.have / a.need - b.have / b.need)
    .map(({ id, shops }) => ({ id, shops }));
  const count = states.reduce((a, x) => a + x.shops, 0);
  return { states, count, cost: count * price };
}

/** A plan's states for a sentence: "New York (60), Ohio (12) ve 5 eyalet daha". */
export function planStates(items: { id: StateId; shops: number }[], shown = 4): string {
  const names = items.slice(0, shown).map((x) => `${stateDef(x.id).name} (${num(x.shops)})`);
  return items.length > shown ? t('{states} ve {n} eyalet daha', { states: names.join(', '), n: items.length - shown }) : list(names);
}

/** Open a plan's shops (its cost already checked). */
export function openPlannedShops(s: GameState, plan: ServicePlan) {
  if (!plan.count) return;
  spend(s, plan.cost, 'investment');
  for (const x of plan.states) stateNet(s, x.id).service += x.shops;
}

/** "Servisi yetir": open every shop the cars on the road need now, as many as the cash pays for, the worst served first. */
export function coverService(s: GameState): { ok: true; opened: number } | { ok: false; error: string } {
  const yf = yearFloat(s.week);
  if (!servicePlan(s, yf).count) return { ok: false, error: t('Servis yetiyor: her eyalette arabalarına bakacak yer var.') };
  const plan = servicePlan(s, yf, s.company.cash);
  if (!plan.count) return { ok: false, error: t('Servis atölyesi {cost} tutar.', { cost: money(serviceShopCost(yf)) }) };
  openPlannedShops(s, plan);
  decide(s, 'service:all', `Servisi yetir: ${plan.count} atölye (${money(plan.cost)})`);
  return { ok: true, opened: plan.count };
}

/**
 * Shops standing idle where the cars have gone (scrapped, or the dealers' own workshops grew):
 * closed only when service stays well above the need without them.
 */
export function surplusShops(s: GameState, id: StateId, yf: number): number {
  const n = peek(s, id);
  if (!n || n.service <= 0) return 0;
  const need = n.parc * serviceNeed(yf);
  const cap = serviceCapacity(s, id, yf);
  const per = shopServiceCap(yf);
  if (cap - per < need * 1.5) return 0;
  return Math.min(n.service, Math.floor((cap - need * 1.25) / per));
}

/** "Otomatik servis": shops open (and idle ones close) by themselves every month (see autoService). */
export function setAutoService(s: GameState, on: boolean) {
  const net = network(s);
  net.autoService = on;
  net.autoServiceWaiting = undefined;
  decide(s, 'autoService', `Otomatik servis ${on ? 'açık' : 'kapalı'}`);
}

// ---------------- the week ----------------

/** How long a car lasts: early ones were worn out in a few years. */
const lifespan = (yf: number) => interp([[1900, 7], [1930, 10], [1960, 13]], yf);

export function networkWeek(s: GameState) {
  const yf = yearFloat(s.week);
  const net = network(s);
  const year = yearOf(s.week);
  if (net.year !== year) {
    for (const n of Object.values(net.states)) {
      if (!n) continue;
      n.soldLastYear = n.soldYear;
      n.soldYear = 0;
      n.freightYear = 0;
    }
    net.year = year;
  }
  const life = lifespan(yf);
  const adAw = adAwareness(s, yf);
  let awSum = 0;
  let wSum = 0;
  const weights = stateWeights(yf);
  for (const id of STATE_IDS) {
    const n = net.states[id];
    if (!n) continue;
    // Dealer searches.
    if (n.search && s.week >= n.search.until) {
      const found = rand(s) < n.search.chance;
      const first = !isOpen(s, id);
      n.search = undefined;
      if (found) {
        n.dealers += 1;
        spend(s, dealerOpeningCost(yf), 'investment');
        if (first) {
          n.openedWeek = s.week;
          n.firstDealer = dealerName(s);
          n.awareness = Math.max(n.awareness, 0.04 + 0.3 * (s.markets.usa?.awareness ?? 0));
          log(s, t('{state}’da ilk bayin açıldı: {dealer}. Arabaların artık orada da satılıyor.', { state: stateDef(id).name, dealer: n.firstDealer }), 'good');
        } else log(s, t('{state}’da yeni bir bayi sözleşme imzaladı ({n} bayi).', { state: stateDef(id).name, n: n.dealers }), 'good');
      } else {
        n.tries = (n.tries ?? 0) + 1;
        log(s, t('{state}’da bayi bulunamadı: kimse markanı satmaya yanaşmadı. Yeniden denersen tanıdıkların artar; itibarın yükseldikçe de kolaylaşır.', { state: stateDef(id).name }), 'bad');
      }
    }
    // Cars on the road age, and the old ones go to the scrapyard (sooner where repairs wait).
    if (n.parc > 0) {
      const q = serviceQuality(s, id, yf);
      const worn = Math.max(0, n.parcAge / life - 0.45);
      const yearly = (0.02 + 0.3 * Math.pow(worn, 1.5)) * (1.6 - 0.6 * q);
      const scrap = Math.min(n.parc, (n.parc * yearly) / 52);
      const older = n.parcAge + 0.35 * life;
      const left = n.parc - scrap;
      n.parcAge = left > 0 ? Math.max(0, (n.parc * n.parcAge - scrap * older) / left) + 1 / 52 : 0;
      n.parc = left;
      n.scrapped += scrap;
    }
    // Name recognition: fades, grows with cars sold and seen, and with advertising where we sell.
    if (isOpen(s, id)) {
      const seen = 0.0004 * Math.log1p(n.parc / 50);
      n.awareness = clamp(n.awareness * 0.997 + seen + adAw, 0, 1);
      awSum += weights[id] * n.awareness;
      wSum += weights[id];
    } else n.awareness = clamp(n.awareness * 0.995, 0, 1);
  }
  // The market's awareness figure (used by launches and the press) follows the open states.
  if (s.markets.usa && wSum > 0) s.markets.usa.awareness = awSum / wSum;
}

/** The weekly awareness a national advertising budget buys in every state we sell in. */
function adAwareness(s: GameState, yf: number): number {
  const ad = s.markets.usa?.adBudget ?? 0;
  if (ad <= 0) return 0;
  return 0.004 * Math.sqrt(ad / (50 * marketScale('usa', yf) * costIndex(yf)));
}

/** A state's sales this week add to its name recognition. */
export function noteStateSales(s: GameState, id: StateId, units: number) {
  const n = peek(s, id);
  if (!n || units <= 0) return;
  n.awareness = clamp(n.awareness + 0.0025 * Math.log1p(units) * 0.4, 0, 1);
}

/** Carmaking states a rival's factory may stand in, as many times as the trade crowded there. */
const RIVAL_HOMES: StateId[] = ['MI', 'MI', 'MI', 'MI', 'OH', 'OH', 'OH', 'IN', 'IN', 'NY', 'NY', 'WI', 'PA', 'IL', 'CT', 'MA', 'MO'];

/** Where a rival's factory stands: picked from its id, the same in every game. */
export function rivalHomeState(rivalId: string): StateId {
  let h = 0;
  for (let i = 0; i < rivalId.length; i++) h = (Math.imul(h, 31) + rivalId.charCodeAt(i)) >>> 0;
  return RIVAL_HOMES[h % RIVAL_HOMES.length];
}

/**
 * The states a bought rival's dealers would join our network in: its strong states (the busy
 * ones round its factory) where our own showrooms are thin, and at least half of them states
 * we do not sell in yet, while there are any.
 */
export function acquiredDealerStates(s: GameState, count: number, rivalId: string, yf = yearFloat(s.week)): StateId[] {
  const w = stateWeights(yf);
  const [hx, hy] = STATE_SHAPES[rivalHomeState(rivalId)].label;
  const strength = (id: StateId) => {
    const [x, y] = STATE_SHAPES[id].label;
    return w[id] * Math.exp((-Math.hypot(x - hx, y - hy) * RAIL_MILES) / 300);
  };
  const ranked = STATE_IDS.filter((id) => coverage(s, id, yf) < 0.6).sort((a, b) => strength(b) - strength(a));
  const picks = ranked.slice(0, count);
  const fresh = ranked.filter((id) => !isOpen(s, id) && !picks.includes(id));
  const want = Math.min(Math.ceil(count / 2), picks.length);
  // Swap its weakest states we already sell in for its strongest ones we do not.
  for (let i = picks.length - 1; i >= 0 && fresh.length && picks.filter((id) => !isOpen(s, id)).length < want; i--) {
    if (isOpen(s, picks[i])) picks[i] = fresh.shift()!;
  }
  return picks.sort((a, b) => strength(b) - strength(a));
}

/**
 * A bought rival's dealers carry our cars from now on: they add showrooms in its strong
 * states, new ones included (see acquiredDealerStates). Returns the states that gained one.
 */
export function absorbDealers(s: GameState, count: number, company: string, rivalId: string): StateId[] {
  const picks = acquiredDealerStates(s, count, rivalId);
  for (const id of picks) {
    const n = stateNet(s, id);
    if (!isOpen(s, id)) {
      n.openedWeek = s.week;
      n.firstDealer = t('{company} (eski bayi)', { company });
      n.awareness = Math.max(n.awareness, 0.1);
    }
    n.dealers += 1;
  }
  return picks;
}

/**
 * An older save (national dealer levels, maybe a European factory): bring it to the
 * American, state-by-state game. The old dealer level becomes states opened outward
 * from Detroit, and the cars sold so far go on the road where the buyers are.
 */
export function ensureNetwork(s: GameState) {
  if (s.network) return;
  s.company.hq = 'usa';
  s.company.city ??= 'detroit';
  if (s.markets.europe) s.markets.europe.unlocked = false;
  if (s.markets.usa) s.markets.usa.unlocked = true;
  for (const m of s.models) m.markets = ['usa'];
  const yf = yearFloat(s.week);
  const level = s.markets.usa?.dealerLevel ?? 1;
  const aw = s.markets.usa?.awareness ?? 0.15;
  const net = network(s);
  const home = homeState(s);
  // Open states outward from home, the busiest neighbours first.
  const w = stateWeights(yf);
  const want = Math.max(0, Math.min(STATE_IDS.length - 1, Math.round(level * 4.5)));
  const opened: StateId[] = [home];
  while (opened.length <= want) {
    const next = [...new Set(opened.flatMap((id) => NEIGHBOURS[id] ?? []))].filter((id) => !opened.includes(id)).sort((a, b) => w[b] - w[a])[0];
    if (!next) break;
    opened.push(next);
  }
  const cov = level <= 0 ? 0.12 : 1 - 0.75 * Math.pow(0.8, level) - 0.03;
  for (const id of opened) {
    const n = stateNet(s, id);
    if (id !== home) n.dealers = Math.max(1, Math.round((cov / (1 - cov)) * halfDealers(id, yf) * 0.6));
    n.openedWeek = 0;
    n.awareness = aw;
  }
  // The cars sold so far, spread over the open states; the oldest are already scrapped.
  const sold = s.models.reduce((a, m) => a + m.unitsSold, 0);
  const wsum = opened.reduce((a, id) => a + w[id], 0);
  for (const id of opened) {
    const n = stateNet(s, id);
    const share = w[id] / wsum;
    n.sold = sold * share;
    n.parc = sold * share * 0.65;
    n.scrapped = sold * share * 0.35;
    n.parcAge = Math.min(6, Math.max(1, (yf - 1900) / 4));
  }
  // Old saves had no service shops: give each state enough to look after most of its cars.
  for (const id of opened) {
    const n = stateNet(s, id);
    const short = n.parc * serviceNeed(yf) * 0.85 - serviceCapacity(s, id, yf);
    if (short > 0) n.service = Math.ceil(short / shopServiceCap(yf));
  }
  net.year = yearOf(s.week);
}

/** Freight on an average car sold: this year's (or last year's) mix of states; nothing while only the home state buys. */
export function avgFreightPerCar(s: GameState, yf = yearFloat(s.week)): number {
  let cars = 0;
  let cost = 0;
  for (const id of STATE_IDS) {
    const n = peek(s, id);
    if (!n) continue;
    const sold = n.soldYear || n.soldLastYear;
    cars += sold;
    cost += sold * freightPerCar(s, id, yf);
  }
  return cars > 0 ? cost / cars : 0;
}
