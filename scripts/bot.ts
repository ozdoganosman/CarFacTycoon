// A simple scripted player used to sanity-check game balance headlessly.
import * as A from '../src/core/actions';
import { aiDesign } from '../src/core/ai';
import { designTech, missingRequirements, researchCost, researchDefs, researchSlots, restrictToKnown } from '../src/core/research';
import { maxGears } from '../src/data/tech';
import { STATIONS } from '../src/data/stations';
import { COST_KEYS, availableSegments, credit, materialUnitCost, tick } from '../src/core/game';
import * as N from '../src/core/network';
import { stateWeights } from '../src/data/states';
import { costIndex, newLineCost } from '../src/data/economy';
import { lineReport, lineUpkeep, modernizeQuote, reservedLines, stationPrice, turnkeyLineCost, planBalancedLine, emptyLine } from '../src/core/factory';
import { demandAtPrice, referencePrice } from '../src/core/market';
import { MAX_SLOTS, DEALER_COMMISSION } from '../src/data/economy';
import { eventDef } from '../src/data/events';
import { isBlockingModal } from '../src/core/util';
import { yearFloat } from '../src/core/time';
import type { GameState, SegmentId } from '../src/core/types';

export interface BotOptions {
  testWeeks?: number; // multiplier on default test plan
  priceFactor?: number;
  segments?: SegmentId[];
  aggressive?: boolean;
  /** Price for profit (up to what the factory can supply) and buy turnkey lines when they pay back. */
  smart?: boolean;
}

export function botStep(s: GameState, o: BotOptions = {}) {
  while (s.modals.length) {
    const m = s.modals.find(isBlockingModal) ?? s.modals[0];
    if (m.kind === 'event') {
      const ev = eventDef(m.eventId);
      // The bot has no plan for a board: it keeps the company to itself.
      const choice = ev?.choices?.find((c) => (m.eventId !== 'rival-bid' || c.id === 'refuse') && (!c.enabled || c.enabled(s)));
      if (choice) A.chooseEventOption(s, m.eventId, choice.id);
      else A.dismissModal(s);
    } else if (m.kind === 'recall' || m.kind === 'service') {
      // Recall when the company can pay for it; a company on the edge keeps quiet and hopes.
      const affordable = s.company.cash + (credit(s).limit - s.company.loan) > 1.5 * A.recallCost(s, m.modelId, m.defectId);
      A.recallDecision(s, m.modelId, m.defectId, affordable ? 'recall' : 'ignore');
    }
    else if (m.kind === 'insolvency') {
      // What the warning offers: borrow enough to get back above zero.
      A.borrowToCover(s);
      A.dismissModal(s);
    } else if (m.kind === 'gameOver') return;
    else A.dismissModal(s);
  }
  const yf = yearFloat(s.week);
  for (const p of [...s.projects]) {
    if (p.phase === 'design') {
      A.beginDevelopment(s, p.id);
    } else if (p.phase === 'development' && p.dev.done >= p.dev.required * 1.1) A.finishDevelopment(s, p.id);
    else if (p.phase === 'testing' && o.testWeeks !== undefined && o.testWeeks === 0) A.finishTesting(s, p.id);
    else if (p.phase === 'testing' && Object.values(p.tests).every((t) => t.done >= t.planned)) A.finishTesting(s, p.id);
    else if (p.phase === 'production' && p.productionReadyWeek === undefined) {
      const taken = reservedLines(s, p.id);
      let line = s.lines.find((l) => !taken.has(l.id) && !s.models.some((m) => m.id === l.modelId && m.status === 'active'));
      if (p.replacesModelId) line = s.lines.find((l) => l.modelId === p.replacesModelId && !taken.has(l.id)) ?? line;
      if (!line) {
        if (A.buyLine(s).ok) line = s.lines[s.lines.length - 1];
        for (const stage of ['press', 'body', 'paint', 'assembly'] as const) {
          const best = STATIONS.filter((x) => x.stage === stage && x.year <= yf).sort((a, b) => b.capacity - a.capacity)[0];
          if (line) A.buyStation(s, line.id, stage, best.id);
        }
      }
      if (line) A.startTooling(s, p.id, line.id);
    } else if (p.phase === 'ready') {
      const unit = materialUnitCost(s, { stats: require_stats(s, p), suppliers: p.suppliers, unitsBuilt: 0 });
      const ref = referencePrice(s.company.hq, p.segment, yf);
      const price = Math.max(unit * 1.35, ref * (o.priceFactor ?? 0.95));
      A.launchModel(s, p.id, { price, markets: ['usa'], autoShow: s.company.cash > 20000 });
    }
  }
  // Start new projects: keep a model per chosen segment, refresh every ~6 years.
  const segs = (o.segments ?? ['family']).filter((x) => availableSegments(s).includes(x));
  if (s.projects.length === 0 && s.company.cash > 5000) {
    for (const seg of segs) {
      const current = s.models.filter((m) => m.status === 'active' && m.segment === seg);
      const newest = current.sort((a, b) => b.launchWeek - a.launchWeek)[0];
      if (!newest || (s.week - newest.launchWeek) / 52 > 4) {
        const r = A.startProject(s, { name: `${seg}-${Math.floor(yf)}`, segment: seg, targetPrice: 0, replacesModelId: newest?.id });
        // The bot is a yardstick, not a player: it designs the class's typical car itself.
        if (r.ok) {
          const style = seg === 'luxury' ? 'premium' : seg === 'sport' ? 'sport' : seg === 'pickup' || seg === 'suv' ? 'utility' : 'mass';
          const typical = aiDesign(seg, Math.floor(yf), { style, skill: 50, market: s.company.hq }, () => 0.5).design;
          A.updateDesign(s, r.id, restrictToKnown(s, typical, maxGears(yf)));
        }
        break;
      }
    }
  }
  if (o.smart) smartFactoryAndPrices(s);
  // Capacity: add lines for models whose demand outruns production.
  for (const m of s.models.filter((x) => (o.smart ? false : x.status === 'active'))) {
    const lines = s.lines.filter((l) => l.modelId === m.id);
    const cap = lines.reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
    const demand = Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
    // Full = the bottleneck stage has no free slot and no better station to swap in.
    const full = lines.every((l) => {
      const b = lineReport(s, l, m.stats.complexity).bottleneck;
      const best = STATIONS.filter((x) => x.stage === b && x.year <= yf).sort((a, c) => c.capacity - a.capacity)[0];
      return l.slots >= 8 && l.stations[b].length >= l.slots && l.stations[b].every((id) => STATIONS.find((x) => x.id === id)!.capacity >= best.capacity);
    });
    if (demand > cap * 1.3 && full && s.company.cash > 4 * newLineCost(yf) + 20000 && s.lines.length < 12) {
      if (A.buyLine(s).ok) {
        const nl = s.lines[s.lines.length - 1];
        for (const stage of ['press', 'body', 'paint', 'assembly'] as const) {
          const best = STATIONS.filter((x) => x.stage === stage && x.year <= yf).sort((a, b) => b.capacity - a.capacity)[0];
          A.buyStation(s, nl.id, stage, best.id);
        }
        A.assignLine(s, nl.id, m.id);
      }
    }
    // Reprice: follow the class reference price.
    const ref = referencePrice(s.company.hq, m.segment, yf);
    const unit = materialUnitCost(s, m);
    m.price = Math.max(unit * 1.2, ref * (o.priceFactor ?? 0.95));
    m.priceWeek = s.week;
  }
  // Factory: relieve bottlenecks.
  for (const line of o.smart ? [] : s.lines) {
    const m = s.models.find((x) => x.id === line.modelId && x.status === 'active');
    if (!m) continue;
    const r = lineReport(s, line, m.stats.complexity);
    const allCap = s.lines.filter((l) => l.modelId === m.id).reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
    const demand = Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
    // Build what sells and work a stock pile down; only then think about more stations.
    m.productionRate = allCap > 0 ? Math.min(1, Math.max(0, (demand - (m.inventory - 2 * demand) / 4) / allCap)) : 1;
    if (demand < allCap * 1.1) continue;
    const stage = r.bottleneck;
    const best = STATIONS.filter((x) => x.stage === stage && x.year <= yf).sort((a, b) => b.capacity - a.capacity)[0];
    const cost = stationPrice(best.id, s.week);
    if (s.company.cash - (s.company.taxOwed ?? 0) > cost * 2.5) {
      if (line.stations[stage].length >= line.slots) {
        const worst = line.stations[stage].map((id, i) => ({ id, i, cap: STATIONS.find((x) => x.id === id)!.capacity })).sort((a, b) => a.cap - b.cap)[0];
        if (worst && worst.cap < best.capacity) {
          A.sellStation(s, line.id, stage, worst.i);
          A.buyStation(s, line.id, stage, best.id);
        } else A.expandLine(s, line.id);
      } else A.buyStation(s, line.id, stage, best.id);
    }
  }
  // Dealers and service, state by state.
  growNetwork(s);
  // Research: first what the class's typical car already uses, then the cheapest know-how.
  const r = s.research;
  if (r && r.active.length < researchSlots(s.company.engineers)) {
    const open = researchDefs().filter((d) => d.year <= yf && !r.known.includes(d.id) && !r.active.some((a) => a.id === d.id));
    const needed = new Set(
      (o.segments ?? ['family']).flatMap((seg) => {
        const typical = aiDesign(seg, Math.floor(yf), { style: 'mass', skill: 50, market: s.company.hq }, () => 0.5).design;
        return [...designTech(typical), ...(typical.knowhow ?? [])];
      }),
    );
    const byCost = (a: (typeof open)[number], b: (typeof open)[number]) => researchCost(a, yf, s) - researchCost(b, yf, s);
    const ready = open.filter((d) => missingRequirements(s, d.id).length === 0);
    const want = ready.filter((d) => needed.has(d.id)).sort(byCost)[0];
    // Research is dear: beyond what the class needs, only cheap know-how, and only from a full till.
    const other = ready.filter((d) => d.passive).sort(byCost)[0];
    const spare = s.company.cash - 150_000 * costIndex(yf); // a year's cushion stays in the bank
    const affordable = (d: typeof want, share: number) => !!d && researchCost(d, yf, s) < share * s.company.cash && researchCost(d, yf, s) < spare;
    if (affordable(want, 0.15)) A.startResearch(s, want!.id);
    else if (affordable(other, 0.02)) A.startResearch(s, other!.id);
  }
  // Engineers: grow with the company.
  const wantEng = Math.min(60, 2 + Math.floor(s.company.cash / 40000));
  if (s.company.engineers < wantEng && s.company.cash > 10000) A.hireEngineers(s, 1);
  // Credit when broke.
  if (s.company.cash < 0) {
    const room = credit(s).limit - s.company.loan;
    if (room > 1000) A.takeLoan(s, Math.min(room, -s.company.cash + 5000));
  } else if (s.company.loan > 0 && s.company.cash > s.company.loan * 3) A.repayLoan(s, s.company.loan);
}

import { computeCarStats } from '../src/core/vehicle';
function require_stats(s: GameState, p: GameState['projects'][number]) {
  return computeCarStats(p.design, yearFloat(s.week), p.bonus);
}

export function runBot(s: GameState, weeks: number, o: BotOptions = {}) {
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    botStep(s, o);
    tick(s);
  }
}

/** Weekly output of a model's working lines. */
function capacityOf(s: GameState, m: GameState['models'][number]) {
  return s.lines
    .filter((l) => l.modelId === m.id && !(l.retoolUntilWeek !== undefined && s.week < l.retoolUntilWeek))
    .reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
}

/**
 * A profit-seeking player: every month, set the price that earns the most
 * given what the factory can build, and add turnkey lines while they pay back
 * within about a year.
 */
function smartFactoryAndPrices(s: GameState) {
  const yf = yearFloat(s.week);
  for (const m of s.models.filter((x) => x.status === 'active')) {
    const lines = s.lines.filter((l) => l.modelId === m.id);
    const soon = lines.reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
    const cap = Math.max(capacityOf(s, m), 0.5 * soon);
    const labour = lines.reduce((a, l) => a + lineUpkeep(s, l, 1), 0) / Math.max(0.1, soon);
    const unit = materialUnitCost(s, m) + labour;
    const ref = referencePrice(s.company.hq, m.segment, yf);
    const demandAt = (p: number) => m.markets.reduce((a, mk) => a + demandAtPrice(s, m, mk, p), 0);
    if (s.week % 4 === 0 || m.priceWeek === m.launchWeek) {
      let best = m.price;
      let bestProfit = -Infinity;
      for (let f = 0.7; f <= 3.01; f += 0.05) {
        const p = ref * f;
        const sold = Math.min(demandAt(p), cap + m.inventory / 8);
        const profit = sold * (p * (1 - DEALER_COMMISSION) - unit);
        if (profit > bestProfit) {
          bestProfit = profit;
          best = p;
        }
      }
      m.price = best;
      m.priceWeek = s.week;
    }
    // Build what sells, and work a stock pile down.
    const demand = demandAt(m.price);
    m.productionRate = soon > 0 ? Math.min(1, Math.max(0, (demand - (m.inventory - 2 * demand) / 4) / soon)) : 1;
    // Would a line (of the right size) pay for itself within a year and a half, counting that more
    // cars can be sold at a lower price? A small line otherwise keeps the price high and sales low.
    if (s.week % 4 === 0) {
      const profitWith = (capacity: number) => {
        let best = -Infinity;
        for (let f = 0.7; f <= 3.01; f += 0.1) {
          const p = ref * f;
          best = Math.max(best, Math.min(demandAt(p), capacity) * (p * (1 - DEALER_COMMISSION) - unit));
        }
        return best;
      };
      const now = profitWith(cap);
      let pick: { k: number; ratio: number; cost: number } | null = null;
      for (const k of [2, 3, 4, 6, MAX_SLOTS]) {
        const add = lineReport(s, { ...emptyLine('x', 'x'), slots: Math.max(3, k), stations: planBalancedLine(yf, true, k) }, m.stats.complexity).throughput;
        const cost = turnkeyLineCost(s.week, true, k) + A.retoolCost(s, m);
        const gain = (profitWith(cap + add) - now) * 52;
        if (gain * 1.5 > cost && s.company.cash - (s.company.taxOwed ?? 0) > cost * 1.5 && (!pick || gain / cost > pick.ratio)) pick = { k, ratio: gain / cost, cost };
      }
      if (pick) A.buildTurnkeyLines(s, 1, m.id, true, pick.k);
    }
    if (demand > soon * 1.1) {
      for (const l of lines) {
        const q = modernizeQuote(l, s.week, true);
        if (q.after > q.before * 1.3 && s.company.cash > q.cost * 2) {
          A.modernizeLine(s, l.id, true);
          break;
        }
      }
    }
  }
}

/**
 * The bot's network: once a car is on sale, look for dealers in the neighbouring state
 * with the most buyers per dollar of freight, add dealers where a busy state is thinly
 * covered, and open service where owners wait. Keeps a cash reserve.
 */
function growNetwork(s: GameState) {
  if (s.week % 4 !== 0 || !s.models.some((m) => m.status === 'active')) return;
  const yf = yearFloat(s.week);
  shrinkNetwork(s, yf);
  const w = stateWeights(yf);
  const price = s.models.filter((m) => m.status === 'active').reduce((a, m) => a + m.price, 0) / Math.max(1, s.models.filter((m) => m.status === 'active').length);
  const reserve = 8 * N.networkWeekly(s, yf) + 4000 * (1 + (yf - 1900) / 10);
  // Grow only while the business pays, and only what the margin can carry.
  const recent = s.finance.slice(-13);
  const weeklyNet = recent.length ? recent.reduce((a, f) => a + f.revenue - COST_KEYS.filter((k) => k !== 'investment').reduce((b, k) => b + (f[k] ?? 0), 0), 0) / recent.length : 0;
  // (The first few states are cheap and the home state alone does not pay: those come first.)
  if (N.openStates(s).length >= 6 && weeklyNet < N.marginalWeekly(s, 1, 0, yf) * 2) return serviceOnly(s, yf, reserve);
  const value = (id: (typeof N.STATE_LIST)[number]) => w[id] * Math.max(0, 1 - N.freightPerCar(s, id, yf) / price);
  for (let tries = 0; tries < 3 && N.activeSearches(s) < N.maxSearches(s); tries++) {
    const frontier = N.frontier(s).filter((id) => N.canSearch(s, id).ok);
    const thin = N.openStates(s).filter((id) => N.canSearch(s, id).ok && N.coverage(s, id, yf) < 0.45 && w[id] > 0.015);
    const best = [...frontier.map((id) => ({ id, v: value(id) })), ...thin.map((id) => ({ id, v: value(id) * 0.8 * (1 - N.coverage(s, id, yf)) }))].sort((a, b) => b.v - a.v)[0];
    if (!best || s.company.cash - (s.company.taxOwed ?? 0) < reserve + N.searchCost(s, best.id, yf) * 3) break;
    N.startDealerSearch(s, best.id);
  }
  serviceOnly(s, yf, reserve);
}

function serviceOnly(s: GameState, yf: number, reserve: number) {
  for (const id of N.underServed(s, yf, 0.75).slice(0, 2)) {
    if (s.company.cash - (s.company.taxOwed ?? 0) > reserve + N.serviceShopCost(yf) * 4) N.openServiceShop(s, id);
  }
}

/**
 * When the network costs more than a sixth of what the cars bring in, close the dealers
 * that sell least (a state keeps its last one while it sells at all).
 */
function shrinkNetwork(s: GameState, yf: number) {
  const revenue = s.finance.slice(-26).reduce((a, f) => a + f.revenue, 0) / 26;
  if (revenue <= 0 || s.week < 52 * 3) return;
  for (let i = 0; i < 6 && N.networkWeekly(s, yf) > revenue / 6; i++) {
    const worst = N.openStates(s)
      .filter((id) => (s.network!.states[id]?.dealers ?? 0) > 0)
      .map((id) => ({ id, per: (s.network!.states[id]!.soldLastYear + 1) / s.network!.states[id]!.dealers }))
      .sort((a, b) => a.per - b.per)[0];
    if (!worst) break;
    N.closeDealer(s, worst.id);
  }
}
