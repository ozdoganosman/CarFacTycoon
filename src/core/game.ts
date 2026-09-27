import { CARDS } from '../data/cards';
import { costIndex, engineerSalary, overhead, creditTerms, DEALER_COMMISSION } from '../data/economy';
import { EVENTS } from '../data/events';
import { MARKETS, marketScale } from '../data/markets';
import { SEGMENTS } from '../data/segments';
import { customerFeedback } from './feedback';
import { MILITARY_COMPLEXITY, emptyLine, lineReport, lineUpkeep, militaryMargin, stationPrice } from './factory';
import { MARKET_IDS, SEGMENT_IDS, modelScores, priceNow, segmentMarket } from './market';
import { makeRng, rand, stateRng } from './rng';
import { updateRivals, initRivals } from './rivals';
import { eraReference } from './scoring';
import { allTech } from './techtree';
import {
  TESTS,
  actualReliability,
  detectionChance,
  failureRate,
  fixCost,
  SUPPLIERS,
} from './testing';
import { isMonthStart, weekFor, weekOfYear, yearFloat, yearOf } from './time';
import { productivity } from './development';
import type { CarModel, ComponentKey, GameState, MarketId, SegmentId, YearSummary } from './types';

export const COST_KEYS = ['materials', 'labor', 'salaries', 'dealers', 'marketing', 'rnd', 'warranty', 'interest', 'other', 'investment'] as const;
import { clamp, earn, financeNow, log, money, pushModal, spend } from './util';

export const SAVE_VERSION = 1;
export const END_YEAR = 1961;

export interface NewGameOptions {
  companyName: string;
  hq: MarketId;
  seed?: number;
}

export function newGame(opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const markets = {} as GameState['markets'];
  for (const m of MARKETS) {
    // A local agent sells your first cars at home (dealer level 1).
    markets[m.id] = { unlocked: m.id === opts.hq, dealerLevel: m.id === opts.hq ? 1 : 0, awareness: m.id === opts.hq ? 0.15 : 0, adBudget: 0 };
  }
  const knowledge = {} as GameState['knowledge'];
  for (const s of SEGMENTS) knowledge[s.id] = {};
  const line = emptyLine('L1', 'Atölye');
  line.stations = { press: ['press_hand'], body: ['body_coach'], paint: ['paint_brush'], assembly: ['asm_static'] };
  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    rng: seed,
    week: 0,
    endWeek: weekFor(END_YEAR, 0),
    company: {
      name: opts.companyName || 'Yeni Motor',
      hq: opts.hq,
      cash: 30000,
      loan: 0,
      reputation: 30,
      engineers: 2,
      skill: 30,
      shops: { engine: false, gearbox: false, electrics: false },
      modelsLaunched: 0,
      negativeWeeks: 0,
      highWages: false,
    },
    projects: [],
    models: [],
    platforms: [],
    engines: [],
    lines: [line],
    markets,
    rivals: initRivals(),
    rivalModels: [],
    knowledge,
    firedEvents: ['start'],
    flags: {},
    modals: [{ kind: 'event', eventId: 'start' }],
    log: [],
    finance: [],
    years: [],
    segmentSales: {},
    unlockedTech: allTech().filter((t) => t.year <= 1900).map((t) => t.id),
    cardsSeen: CARDS.filter((c) => c.year <= 1900).map((c) => c.id),
    settings: { engineerMode: false, autoPauseCards: true },
    nextId: 1,
  };
  updateRivals(state, makeRng(seed ^ 0x5eed), true);
  log(state, `${state.company.name} kuruldu. Bol şans!`, 'good');
  return state;
}

// ---------- helpers used by UI and actions ----------

export const currentYear = (s: GameState) => yearFloat(s.week);

export function engineersBusy(s: GameState): number {
  return s.projects.filter((p) => p.phase === 'development').reduce((a, p) => a + p.engineers, 0);
}

export function materialUnitCost(s: GameState, model: Pick<CarModel, 'stats' | 'suppliers' | 'unitsBuilt'>): number {
  const yf = yearFloat(s.week);
  let cost = model.stats.unitCost;
  for (const k of Object.keys(model.suppliers) as ComponentKey[]) {
    const mult = SUPPLIERS.find((x) => x.id === model.suppliers[k])!.costMult;
    cost += model.stats.componentCost[k] * (mult - 1);
  }
  const learning = Math.max(0.9, Math.pow(1 + model.unitsBuilt / 2000, -0.04));
  const war = s.flags.materialsUntil && yf < s.flags.materialsUntil && yf >= 1914.6 ? 1.25 : 1;
  return cost * costIndex(yf) * learning * war;
}

export function companyAssets(s: GameState): number {
  const lines = s.lines.reduce(
    (a, l) => a + Object.values(l.stations).flat().reduce((b, id) => b + stationPrice(id, s.week) * 0.5, 0),
    0,
  );
  const inventory = s.models.reduce((a, m) => a + m.inventory * materialUnitCost(s, m), 0);
  return lines + inventory + Math.max(0, s.company.cash);
}

export function credit(s: GameState) {
  return creditTerms(yearFloat(s.week), s.company.reputation, companyAssets(s));
}

export function dealerUpkeep(s: GameState, market: MarketId): number {
  const lvl = s.markets[market].dealerLevel;
  if (lvl <= 0) return 0;
  const yf = yearFloat(s.week);
  return 12 * Math.pow(lvl, 1.3) * marketScale(market, yf) * costIndex(yf);
}

export function dealerUpgradeCost(s: GameState, market: MarketId): number {
  const yf = yearFloat(s.week);
  const next = s.markets[market].dealerLevel + 1;
  return 800 * Math.pow(next, 1.6) * marketScale(market, yf) * costIndex(yf);
}

function modelFieldUnits(model: CarModel, weeks: number): number {
  let n = 0;
  for (let i = model.history.length - 1; i >= 0 && i >= model.history.length - weeks; i--) n += model.history[i].sold;
  return n;
}

// ---------- the weekly tick ----------

export function tick(s: GameState): void {
  if (s.gameOver) return;
  s.week += 1;
  const yf = yearFloat(s.week);
  financeNow(s);

  if (s.week >= s.endWeek) {
    closeYear(s, yearOf(s.week) - 1);
    s.gameOver = { reason: 'end', week: s.week };
    s.modals.push({ kind: 'gameOver' });
    return;
  }

  fireEvents(s);
  if (weekOfYear(s.week) === 0) {
    closeYear(s, yearOf(s.week) - 1);
    announceTech(s, yearOf(s.week));
  }
  if (isMonthStart(s.week)) {
    for (const n of updateRivals(s, stateRng(s))) log(s, n.text, n.tone);
  }
  advanceProjects(s);
  produce(s);
  sell(s);
  field(s);
  fixedCosts(s);
  drift(s);
  if (isMonthStart(s.week)) monthly(s);
  checkSolvency(s);
  void yf;
}

function fireEvents(s: GameState) {
  const yf = yearFloat(s.week);
  for (const ev of EVENTS) {
    if (s.firedEvents.includes(ev.id)) continue;
    if (yf < ev.year + ev.month / 12) continue;
    if (ev.condition && !ev.condition(s)) continue;
    s.firedEvents.push(ev.id);
    ev.apply?.(s);
    pushModal(s, { kind: 'event', eventId: ev.id });
  }
}

function announceTech(s: GameState, year: number) {
  const fresh = allTech().filter((t) => t.year <= year && !s.unlockedTech.includes(t.id));
  if (!fresh.length) return;
  for (const t of fresh) s.unlockedTech.push(t.id);
  log(s, `Yeni teknolojiler: ${fresh.map((t) => t.name).join(', ')}`, 'good');
  for (const c of CARDS) {
    if (c.year <= year && !s.cardsSeen.includes(c.id)) {
      s.cardsSeen.push(c.id);
      if (s.settings.autoPauseCards) pushModal(s, { kind: 'card', cardId: c.id });
    }
  }
}

function closeYear(s: GameState, year: number) {
  if (year < 1900 || s.years.some((y) => y.year === year)) return;
  const weeks = s.finance.filter((f) => yearOf(f.week) === year);
  const revenue = weeks.reduce((a, f) => a + f.revenue, 0);
  const costs = weeks.reduce(
    (a, f) => a + f.materials + f.labor + f.salaries + f.dealers + f.marketing + f.rnd + f.warranty + f.interest + f.other,
    0,
  );
  const shareByMarket = {} as Record<MarketId, number>;
  let units = 0;
  for (const m of MARKET_IDS) {
    let total = 0;
    let mine = 0;
    for (const seg of SEGMENT_IDS) {
      total += s.segmentSales[`${year}:${m}:${seg}`] ?? 0;
      mine += s.segmentSales[`${year}:${m}:${seg}:p`] ?? 0;
    }
    units += mine;
    shareByMarket[m] = total > 0 ? mine / total : 0;
  }
  const breakdown = {} as YearSummary['costs'];
  for (const k of COST_KEYS) breakdown[k] = weeks.reduce((a, f) => a + f[k], 0);
  s.years.push({ year, revenue, profit: revenue - costs, unitsSold: units, shareByMarket, cashEnd: s.company.cash, costs: breakdown });
  if (year >= 1900 && s.week < s.endWeek) pushModal(s, { kind: 'yearReport', year });
}

function advanceProjects(s: GameState) {
  const yf = yearFloat(s.week);
  const rng = stateRng(s);
  for (const p of s.projects) {
    if (p.phase === 'development') {
      const work = p.engineers * productivity(s.company.skill);
      const before = p.dev.done;
      const cap = p.dev.required * 1.6;
      const add = Math.min(work, Math.max(0, cap - p.dev.done));
      p.dev.done += add;
      for (const k of Object.keys(p.dev.points) as (keyof typeof p.dev.points)[]) p.dev.points[k] += add * p.dev.focus[k];
      if (before < p.dev.required && p.dev.done >= p.dev.required) {
        log(s, `${p.name}: geliştirme tamamlandı. İstersen biraz daha cilala ya da teste geç.`, 'good');
        pushModal(s, { kind: 'phase', projectId: p.id, phase: 'development' });
      }
    } else if (p.phase === 'testing') {
      let running = false;
      for (const t of TESTS) {
        const plan = p.tests[t.id];
        if (plan.done >= plan.planned) continue;
        running = true;
        plan.done += 1;
        p.testWeeks += 1;
        spend(s, t.costPerWeek * costIndex(yf) * (0.6 + 0.4 * p.design.size + 0.2 * p.design.engine.cylinders / 4), 'rnd');
        for (const d of p.defects) {
          if (d.found) continue;
          if (rng() < detectionChance(t, d.area, d.severity)) {
            d.found = true;
            d.fixed = true;
            spend(s, fixCost(d.severity, yf), 'rnd');
          }
        }
      }
      const allDone = TESTS.every((t) => p.tests[t.id].done >= p.tests[t.id].planned);
      if (running && allDone) {
        log(s, `${p.name}: test programı bitti.`, 'good');
        pushModal(s, { kind: 'phase', projectId: p.id, phase: 'testing' });
      }
    } else if (p.phase === 'production' && p.productionReadyWeek !== undefined && s.week >= p.productionReadyWeek) {
      p.phase = 'ready';
      log(s, `${p.name}: üretim hattı hazır. Lansman zamanı!`, 'good');
      pushModal(s, { kind: 'phase', projectId: p.id, phase: 'production' });
    }
  }
}

function produce(s: GameState) {
  const yf = yearFloat(s.week);
  const militaryActive = (s.flags.militaryUntil ?? 0) > yf;
  for (const line of s.lines) {
    if (line.military && militaryActive) {
      const units = lineReport(s, line, MILITARY_COMPLEXITY).throughput;
      const upkeep = lineUpkeep(s, line, 1);
      spend(s, upkeep, 'labor');
      earn(s, upkeep + units * militaryMargin(s.week));
      s.flags.militaryUnits = (s.flags.militaryUnits ?? 0) + units;
      continue;
    }
    const model = s.models.find((m) => m.id === line.modelId && m.status === 'active');
    const retooling = line.retoolUntilWeek !== undefined && s.week < line.retoolUntilWeek;
    if (!model || retooling) {
      spend(s, lineUpkeep(s, line, 0), 'labor');
      continue;
    }
    const cap = lineReport(s, line, model.stats.complexity).throughput;
    const built = cap * model.productionRate;
    spend(s, lineUpkeep(s, line, model.productionRate), 'labor');
    spend(s, built * materialUnitCost(s, model), 'materials');
    model.inventory += built;
    model.unitsBuilt += built;
    pushHistory(model, s.week).built += built;
  }
}

function pushHistory(model: CarModel, week: number) {
  let h = model.history[model.history.length - 1];
  if (!h || h.week !== week) {
    h = { week, built: 0, sold: 0, revenue: 0, cost: 0 };
    model.history.push(h);
    if (model.history.length > 156) model.history.splice(0, model.history.length - 156);
  }
  return h;
}

function sell(s: GameState) {
  const yf = yearFloat(s.week);
  const year = yearOf(s.week);
  const demand = new Map<string, Record<MarketId, number>>();
  const soldThisWeek = {} as Record<MarketId, number>;
  for (const market of MARKET_IDS) {
    soldThisWeek[market] = 0;
    for (const seg of SEGMENT_IDS) {
      const sm = segmentMarket(s, market, seg);
      if (sm.demand <= 0) continue;
      const key = `${year}:${market}:${seg}`;
      s.segmentSales[key] = (s.segmentSales[key] ?? 0) + sm.demand;
      for (const o of sm.offers) {
        const units = (sm.demand * o.weight) / sm.totalWeight;
        if (o.kind === 'player') {
          const d = demand.get(o.id) ?? ({} as Record<MarketId, number>);
          d[market] = (d[market] ?? 0) + units;
          demand.set(o.id, d);
        } else {
          const rm = s.rivalModels.find((r) => r.id === o.id)!;
          rm.unitsSold += units;
          const c = s.rivals.find((r) => r.id === rm.companyId)!;
          c.unitsSold += units;
          c.yearSold[year] = (c.yearSold[year] ?? 0) + units;
        }
      }
    }
  }
  for (const model of s.models) {
    if (model.status !== 'active') continue;
    const d = demand.get(model.id) ?? ({} as Record<MarketId, number>);
    const total = MARKET_IDS.reduce((a, m) => a + (d[m] ?? 0), 0);
    model.lastDemand = { ...({ usa: 0, europe: 0 } as Record<MarketId, number>), ...d };
    const sold = Math.min(model.inventory, total);
    const ratio = total > 0 ? sold / total : 0;
    const price = priceNow(model, s.week);
    const h = pushHistory(model, s.week);
    for (const m of MARKET_IDS) {
      const units = (d[m] ?? 0) * ratio;
      if (units <= 0) continue;
      const revenue = units * price;
      earn(s, revenue);
      h.revenue += revenue;
      if (s.markets[m].dealerLevel > 0) {
        const commission = revenue * DEALER_COMMISSION;
        spend(s, commission, 'dealers');
        h.cost += commission;
      }
      if (m !== s.company.hq) {
        const ship = units * (MARKETS.find((x) => x.id === m)!.shipping * costIndex(yf));
        spend(s, ship, 'other');
        h.cost += ship;
      }
      model.soldByMarket[m] = (model.soldByMarket[m] ?? 0) + units;
      soldThisWeek[m] += units;
      const pk = `${year}:${m}:${model.segment}:p`;
      s.segmentSales[pk] = (s.segmentSales[pk] ?? 0) + units;
    }
    model.inventory -= sold;
    model.unitsSold += sold;
    h.sold += sold;
    model.revenueTotal += sold * price;
    // Unsold cars cost storage and tie up money.
    const holding = model.inventory * materialUnitCost(s, model) * 0.003;
    spend(s, holding, 'other');
  }
  for (const m of MARKET_IDS) {
    const ms = s.markets[m];
    ms.awareness = clamp(ms.awareness * 0.996 + 0.0025 * Math.log1p(soldThisWeek[m]), 0, 1);
  }
}

function field(s: GameState) {
  const yf = yearFloat(s.week);
  const ci = costIndex(yf);
  for (const model of s.models) {
    const fieldUnits = modelFieldUnits(model, 156);
    if (fieldUnits <= 0) continue;
    const recent = modelFieldUnits(model, 52);
    const actual = actualReliability(model.stats.reliability, model.defects, model.suppliers, s.company.skill);
    const ref = eraReference(yf, model.segment).reliability;
    const actualScore = 50 + 50 * Math.tanh((0.85 * (actual - ref)) / 14);
    const rate = failureRate(actualScore, model.defects, model.suppliers, s.company.skill);
    const warranty = recent * rate * 45 * ci;
    model.fieldFailures += fieldUnits * rate;
    model.warrantyCost += warranty;
    spend(s, warranty, 'warranty');
    // Buyers slowly learn how reliable the car really is.
    model.perceivedReliability += (actual - model.perceivedReliability) * Math.min(0.04, fieldUnits / 8000);

    for (const d of model.defects) {
      if (d.found || d.fixed) continue;
      if (!d.surfaced) {
        const k = d.severity === 'critical' ? 0.00004 : d.severity === 'major' ? 0.00002 : 0;
        if (k && rand(s) < 1 - Math.exp(-fieldUnits * k)) {
          d.surfaced = true;
          pushModal(s, { kind: d.severity === 'critical' ? 'recall' : 'service', modelId: model.id, defectId: d.id });
        }
      } else if (d.ignored && d.severity === 'critical' && rand(s) < 0.04) {
        // The cover-up comes out.
        d.fixed = true;
        const legal = model.unitsSold * 40 * ci;
        spend(s, legal, 'warranty');
        s.company.reputation = Math.max(0, s.company.reputation - 15);
        model.perceivedReliability -= 10;
        log(s, `SKANDAL: ${model.name}’deki bilinen kusuru gizlediğin ortaya çıktı. Davalar ve zorunlu geri çağırma: ${money(legal)}. İtibar −15.`, 'bad');
      }
    }
  }
}

function fixedCosts(s: GameState) {
  const yf = yearFloat(s.week);
  spend(s, s.company.engineers * engineerSalary(yf), 'salaries');
  spend(s, overhead(yf, s.lines.length), 'other');
  for (const m of MARKET_IDS) {
    spend(s, dealerUpkeep(s, m), 'dealers');
    if (s.markets[m].adBudget > 0) spend(s, s.markets[m].adBudget, 'marketing');
  }
  if (s.company.loan > 0) spend(s, (s.company.loan * credit(s).rate) / 52, 'interest');
}

function drift(s: GameState) {
  const yf = yearFloat(s.week);
  for (const m of MARKET_IDS) {
    const ms = s.markets[m];
    if (ms.adBudget > 0) {
      const eff = 0.004 * Math.sqrt(ms.adBudget / (50 * marketScale(m, yf) * costIndex(yf)));
      ms.awareness = clamp(ms.awareness + eff, 0, 1);
    }
  }
  const active = s.models.filter((m) => m.status === 'active');
  for (const m of active) m.hype *= 0.975;
  if (active.length) {
    const review = active.reduce((a, m) => a + m.reviewScore, 0) / active.length;
    const rel =
      active.reduce((a, m) => a + (modelScores(s, m).scores.reliability - 50), 0) / active.length;
    const sold = s.models.reduce((a, m) => a + m.unitsSold, 0);
    const target = clamp(22 + review * 4 + rel * 0.35 + Math.min(15, Math.log1p(sold) * 1.3), 0, 100);
    s.company.reputation += (target - s.company.reputation) * 0.01;
  }
}

function monthly(s: GameState) {
  const rng = stateRng(s);
  for (const model of s.models) {
    if (model.status !== 'active') continue;
    const recent = modelFieldUnits(model, 4);
    if (recent <= 0) continue;
    for (const line of customerFeedback(s, model, rng)) log(s, line.text, line.tone === 'info' ? 'info' : line.tone);
  }
}

function checkSolvency(s: GameState) {
  if (s.company.cash >= 0) {
    s.company.negativeWeeks = 0;
    return;
  }
  s.company.negativeWeeks += 1;
  if (s.company.negativeWeeks === 1) log(s, 'Kasa eksiye düştü! 12 hafta içinde toparlanmazsan şirket iflas eder. Banka kredisi alabilir, masrafları kısabilirsin.', 'bad');
  if (s.company.negativeWeeks === 8) log(s, 'Son uyarı: 4 hafta içinde kasa artıya geçmezse iflas!', 'bad');
  if (s.company.negativeWeeks > 12) {
    s.gameOver = { reason: 'bankrupt', week: s.week };
    s.modals.push({ kind: 'gameOver' });
  }
}

/** Segments the player may start projects in right now. */
export function availableSegments(s: GameState): SegmentId[] {
  const yf = yearFloat(s.week);
  return SEGMENTS.filter((x) => x.year <= yf || (x.id === 'suv' && s.flags.jeep && yf >= 1945.6)).map((x) => x.id);
}

/** Unlock gates for the mid-game systems. */
export const gates = (s: GameState) => ({
  suppliers: s.company.modelsLaunched >= 1,
  export: s.company.modelsLaunched >= 1,
  platforms: s.company.modelsLaunched >= 2,
});
