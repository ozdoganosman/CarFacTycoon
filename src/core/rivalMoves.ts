import { priceLevel } from '../data/economy';
import { RIVALS } from '../data/rivals';
import { segmentDef } from '../data/segments';
import { companyValue } from './game';
import { SEGMENT_IDS, priceNow, rivalSize, segmentMarket } from './market';
import { isRivalActive, launchRivalModel, rivalDef } from './rivals';
import type { Rng } from './rng';
import { GREENMAIL_PREMIUM, MAX_FLOAT, marketCap } from './shares';
import { yearFloat, yearOf } from './time';
import type { CarDesign, GameState, RivalMove, RivalMoveKind, RivalMovesState, SegmentId } from './types';
import { log, money, pushModal } from './util';
import { msg, t } from '../i18n';
import { fmtPercent } from '../i18n/format';

// The big makers leave a small newcomer alone. Once the player gets ahead of them
// (more buyers than any of them in a class, or the most cars in the country) they
// fight back: price wars, a car built to beat ours, mergers, and bids for our shares.

const PRICE_WAR_CUT = 0.85;
const PRICE_WAR_WEEKS = 78;
const TECH_LEAP_BONUS = 24;
/** Moves come at most once a year. */
const COOLDOWN = 52;

export function rivalMoves(s: GameState): RivalMovesState {
  return (s.rivalMoves ??= { lastWeek: -1e6, history: [] });
}

/**
 * Cars a week in a class: ours as actually delivered over the last three months (a workshop with a
 * long waiting list is no threat to anyone), each rival maker's as its buyers take them.
 */
function classStanding(s: GameState, seg: SegmentId): { mine: number; share: number; rivals: Map<string, number> } | null {
  const sm = segmentMarket(s, 'usa', seg);
  if (sm.demand <= 0 || sm.totalWeight <= 0) return null;
  let mine = 0;
  for (const m of s.models) {
    if (m.segment !== seg || m.status !== 'active') continue;
    const h = m.history.slice(-13);
    if (h.length) mine += h.reduce((a, x) => a + x.sold, 0) / h.length;
  }
  const rivals = new Map<string, number>();
  for (const o of sm.offers) {
    if (o.kind === 'rival') rivals.set(o.companyId, (rivals.get(o.companyId) ?? 0) + (sm.demand * o.weight) / sm.totalWeight);
  }
  return { mine, share: mine / sm.demand, rivals };
}

/** Classes where we sell more cars than any single rival maker (and at least an eighth of the class). */
export function ledSegments(s: GameState): SegmentId[] {
  const out: SegmentId[] = [];
  for (const seg of SEGMENT_IDS) {
    const st = classStanding(s, seg);
    if (!st || st.mine <= 0) continue;
    const best = Math.max(0, ...st.rivals.values());
    if (st.share >= 0.12 && st.mine > best) out.push(seg);
  }
  return out;
}

/** Last year's American makers by cars sold, and where we stand among them (1 = the biggest). */
export function salesRank(s: GameState): number {
  const y = yearOf(s.week) - 1;
  const mine = s.years.find((x) => x.year === y)?.unitsSold ?? 0;
  if (mine <= 0) return 99;
  return 1 + s.rivals.filter((c) => c.home === 'usa' && !c.mergedInto && (c.yearSold[y] ?? 0) > mine).length;
}

/** The rank that draws the big makers' attention: a war year (rivals building for the army) and a small share do not count. */
function standing(s: GameState): number {
  const y = yearOf(s.week) - 1;
  const share = s.years.find((x) => x.year === y)?.shareByMarket.usa ?? 0;
  if ((y >= 1942 && y <= 1945) || share < 0.08) return 99;
  return salesRank(s);
}

/** American makers still in business on their own. */
function liveRivals(s: GameState) {
  const yf = yearFloat(s.week);
  return s.rivals.filter((c) => {
    const def = rivalDef(c.id);
    return def.home === 'usa' && isRivalActive(def, yf) && !c.mergedInto && !s.acquired?.includes(c.id);
  });
}

/** The rival maker drawing the most buyers in a class. */
function classLeader(s: GameState, seg: SegmentId): string | undefined {
  const st = classStanding(s, seg);
  if (!st) return undefined;
  let best: string | undefined;
  let w = 0;
  for (const [id, v] of st.rivals) {
    if (v > w && RIVALS.find((r) => r.id === id)?.home === 'usa' && liveRivals(s).some((c) => c.id === id)) {
      best = id;
      w = v;
    }
  }
  return best;
}

function record(s: GameState, move: Omit<RivalMove, 'week'>) {
  const st = rivalMoves(s);
  st.lastWeek = s.week;
  st.history.push({ week: s.week, ...move });
  if (st.history.length > 40) st.history.shift();
}

export function startPriceWar(s: GameState, company: string, seg: SegmentId) {
  for (const rm of s.rivalModels) {
    if (rm.active && rm.companyId === company && rm.segment === seg) rm.priceCut = { mult: PRICE_WAR_CUT, until: s.week + PRICE_WAR_WEEKS };
  }
  record(s, { kind: 'priceWar', company, segment: seg });
  log(
    s,
    t('{company}, {segment} sınıfında fiyatlarını {pct} indirdi: fiyat savaşı başladı.', {
      company: rivalDef(company).name,
      segment: t(segmentDef(seg).name).toLowerCase(),
      pct: fmtPercent(1 - PRICE_WAR_CUT, 0),
    }),
    'warn',
    'rival',
  );
}

/** Answer a price war in kind: our cars in the class 10% cheaper (going back later is not a price hike). */
export function matchPriceWar(s: GameState, seg: SegmentId) {
  const ci = priceLevel(yearFloat(s.week));
  for (const m of s.models) {
    if (m.status !== 'active' || m.segment !== seg) continue;
    const before = priceNow(m, s.week);
    m.priceCeiling = Math.max(m.priceCeiling ?? 0, before / ci);
    m.price = Math.round(before * 0.9);
    m.priceWeek = s.week;
  }
}

export function techLeap(s: GameState, seg: SegmentId, rng: Rng): boolean {
  const yf = yearFloat(s.week);
  // The most gifted engineers among the makers that build this class.
  const cands = liveRivals(s)
    .map((c) => rivalDef(c.id))
    .filter((d) => d.segments.some((e) => e.seg === seg && e.from <= yf && (!e.to || yf < e.to)))
    .sort((a, b) => b.skill - a.skill);
  if (!cands.length) return false;
  const def = cands[Math.min(cands.length - 1, rng() < 0.7 ? 0 : 1)];
  const first = classFirst(s, seg, yf);
  s.rivalModels.filter((m) => m.companyId === def.id && m.segment === seg && m.active).forEach((m) => (m.active = false));
  const rm = launchRivalModel(s, def, seg, s.week, rng, undefined, TECH_LEAP_BONUS, first ? FIRSTS[first].apply : undefined);
  record(s, { kind: 'techLeap', company: def.id, segment: seg, model: rm.name, first });
  const segment = t(segmentDef(seg).name).toLowerCase();
  log(
    s,
    first
      ? t('{company}, {segment} sınıfının ilk {first} arabasını çıkardı: {model}.', { company: def.name, segment, first: t(FIRSTS[first].name), model: rm.name })
      : t('{company}, {segment} sınıfındaki üstünlüğümüze karşı {model} modelini çıkardı: mühendislerinin en iddialı işi.', { company: def.name, segment, model: rm.name }),
    'warn',
    'rival',
  );
  return true;
}

/** What a car built to beat ours can bring to its class for the first time, newest first. */
export const FIRSTS: Record<NonNullable<RivalMove['first']>, { year: number; name: string; has: (d: CarDesign) => boolean; apply: (d: CarDesign) => void }> = {
  automatic: {
    year: 1940,
    name: msg('otomatik şanzımanlı'),
    has: (d) => d.gearbox.type === 'automatic',
    apply: (d) => {
      d.gearbox.type = 'automatic';
      d.gearbox.gears = 4;
    },
  },
  ifs: {
    year: 1934,
    name: msg('bağımsız ön süspansiyonlu'),
    has: (d) => d.suspension !== 'leaf',
    apply: (d) => {
      if (d.suspension === 'leaf') d.suspension = 'ifs';
    },
  },
  synchro: {
    year: 1928,
    name: msg('senkromeçli vitesli'),
    has: (d) => d.gearbox.type !== 'sliding',
    apply: (d) => {
      if (d.gearbox.type === 'sliding') d.gearbox.type = 'synchro';
    },
  },
};

/** The newest technology of the day that no car of the class has yet (sports cars and pickups skip the automatic). */
function classFirst(s: GameState, seg: SegmentId, yf: number): RivalMove['first'] {
  const designs = [
    ...s.models.filter((m) => m.status === 'active' && m.segment === seg).map((m) => m.design),
    ...s.rivalModels.filter((m) => m.active && m.segment === seg).map((m) => m.design),
  ];
  for (const id of Object.keys(FIRSTS) as NonNullable<RivalMove['first']>[]) {
    if (yf < FIRSTS[id].year || (id === 'automatic' && (seg === 'sport' || seg === 'pickup'))) continue;
    if (!designs.some(FIRSTS[id].has)) return id;
  }
  return undefined;
}

export function mergeRivals(s: GameState, rng: Rng): boolean {
  const yf = yearFloat(s.week);
  const y = yearOf(s.week) - 1;
  // Two makers behind us join forces; the one closing soon anyway is left out.
  const cands = liveRivals(s)
    .filter((c) => {
      const def = rivalDef(c.id);
      return (!def.closes || def.closes > yf + 5) && (c.yearSold[y] ?? 0) > 0 && s.rivalModels.some((m) => m.companyId === c.id && m.active);
    })
    .sort((a, b) => (b.yearSold[y] ?? 0) - (a.yearSold[y] ?? 0));
  if (cands.length < 3) return false;
  const buyer = cands[Math.min(cands.length - 2, Math.floor(rng() * 3))];
  const rest = cands.filter((c) => c !== buyer && (c.yearSold[y] ?? 0) < (buyer.yearSold[y] ?? 0));
  if (!rest.length) return false;
  const bought = rest[Math.floor(rng() * Math.min(4, rest.length))];
  bought.mergedInto = buyer.id;
  buyer.sizeBoost = (buyer.sizeBoost ?? 0) + 0.8 * rivalSize(bought.id, yf, s);
  s.rivalModels.filter((m) => m.companyId === bought.id && m.active).forEach((m) => (m.active = false));
  record(s, { kind: 'merger', company: buyer.id, partner: bought.id });
  log(s, t('{buyer}, {bought} şirketini satın aldı: {bought} bayileri artık {buyer} arabaları satıyor.', { buyer: buyer.name, bought: bought.name }), 'warn', 'rival');
  return true;
}

function bid(s: GameState, rng: Rng): boolean {
  const cands = liveRivals(s).sort((a, b) => (b.yearSold[yearOf(s.week) - 1] ?? 0) - (a.yearSold[yearOf(s.week) - 1] ?? 0));
  const company = cands[Math.floor(rng() * Math.min(2, cands.length))];
  if (!company) return false;
  const st = rivalMoves(s);
  if (s.shares) {
    // Listed: it buys a block on the exchange and asks for a say.
    if (s.shares.raider || s.shares.float < 0.08) return false;
    const stake = Math.min(s.shares.float, 0.15);
    s.shares.raider = { company: company.id, stake };
    record(s, { kind: 'raid', company: company.id });
    log(s, t('{company}, borsadan sessizce şirketimizin {pct}’ini topladı.', { company: company.name, pct: fmtPercent(stake, 0) }), 'warn', 'rival');
    pushModal(s, { kind: 'event', eventId: 'rival-raid' });
    return true;
  }
  const stake = 0.25;
  st.bid = { company: company.id, stake, price: Math.max(0, companyValue(s)) * stake * 1.3 };
  record(s, { kind: 'bid', company: company.id });
  pushModal(s, { kind: 'event', eventId: 'rival-bid' });
  return true;
}

/** Sell the bidder its stake: the company is listed with a rival on the board. */
export function acceptBid(s: GameState) {
  const st = rivalMoves(s);
  const b = st.bid;
  if (!b || s.shares) return;
  s.company.cash += b.price;
  const year = yearOf(s.week);
  s.shares = {
    float: b.stake,
    since: s.week,
    confidence: 60,
    payout: 0.2,
    target: { year: year + 1, growth: 0, dividend: 0 },
    history: [],
    dividends: 0,
    raider: { company: b.company, stake: b.stake },
    seat: b.company,
    basis: b.price / b.stake,
    basisWeek: s.week,
  };
  delete st.bid;
  log(
    s,
    t('{company} şirketin {pct}’ini {price} karşılığında aldı ve yönetim kurulunda koltuk kazandı.', {
      company: rivalDef(b.company).name,
      pct: fmtPercent(b.stake, 0),
      price: money(b.price),
    }),
    'info',
  );
}

/** Turn the bid down: the bidder goes after our buyers instead. */
export function refuseBid(s: GameState) {
  const st = rivalMoves(s);
  const b = st.bid;
  if (!b) return;
  delete st.bid;
  // Its biggest class where we also sell.
  const ours = new Set(s.models.filter((m) => m.status === 'active').map((m) => m.segment));
  const seg = rivalDef(b.company).segments.map((e) => e.seg).find((x) => ours.has(x));
  if (seg) startPriceWar(s, b.company, seg);
}

/**
 * Monthly: are we ahead, and does a rival answer? At most once a year, only while we lead
 * a class or the country, never in the first years or while the war stops car sales.
 */
export function rivalMovesMonth(s: GameState, rng: Rng) {
  const yf = yearFloat(s.week);
  if (yf < 1904 || (yf >= 1942 && yf < 1945.7)) return;
  const st = rivalMoves(s);
  if (s.week - st.lastWeek < COOLDOWN || st.bid) return;
  if (s.modals.some((m) => m.kind === 'event' && m.eventId.startsWith('rival-'))) return;
  const led = ledSegments(s);
  const rank = standing(s);
  if (!led.length && rank > 1) return;
  if (rng() > 0.1 + 0.04 * led.length + (rank === 1 ? 0.04 : 0)) return;
  const options: { w: number; kind: RivalMoveKind; run: () => boolean }[] = [];
  if (led.length) {
    const seg = led[Math.floor(rng() * led.length)];
    const leader = classLeader(s, seg);
    if (leader) {
      options.push({
        w: 3,
        kind: 'priceWar',
        run: () => {
          startPriceWar(s, leader, seg);
          pushModal(s, { kind: 'event', eventId: 'rival-priceWar' });
          return true;
        },
      });
    }
    if (yf >= 1905)
      options.push({
        w: 2.5,
        kind: 'techLeap',
        run: () => {
          if (!techLeap(s, seg, rng)) return false;
          pushModal(s, { kind: 'event', eventId: 'rival-techLeap' });
          return true;
        },
      });
  }
  if (rank <= 2 && yf >= 1910)
    options.push({
      w: 1.5,
      kind: 'merger',
      run: () => {
        if (!mergeRivals(s, rng)) return false;
        pushModal(s, { kind: 'event', eventId: 'rival-merger' });
        return true;
      },
    });
  if (rank === 1 && yf >= 1915 && !st.history.some((h) => (h.kind === 'bid' || h.kind === 'raid') && s.week - h.week < 52 * 8))
    options.push({ w: 1.2, kind: 'bid', run: () => bid(s, rng) });
  let total = options.reduce((a, o) => a + o.w, 0);
  while (options.length && total > 0) {
    let r = rng() * total;
    const i = options.findIndex((o) => (r -= o.w) <= 0);
    const pick = options.splice(i < 0 ? options.length - 1 : i, 1)[0];
    total -= pick.w;
    if (pick.run()) return;
  }
}

/** The latest move, for the pop-ups. */
export function lastMove(s: GameState): RivalMove | undefined {
  return s.rivalMoves?.history[s.rivalMoves.history.length - 1];
}

/** What buying the raider out would cost now. */
export function greenmailCost(s: GameState): number {
  const r = s.shares?.raider;
  return r ? marketCap(s) * r.stake * GREENMAIL_PREMIUM : 0;
}

export const canDilute = (s: GameState) => !!s.shares && s.shares.float + 0.02 <= MAX_FLOAT;

export const MOVE_NAMES: Record<RivalMoveKind, string> = {
  priceWar: msg('Fiyat savaşı'),
  techLeap: msg('Teknoloji atağı'),
  merger: msg('Birleşme'),
  bid: msg('Hisse teklifi'),
  raid: msg('Hisse baskını'),
};
