import { CARDS } from '../data/cards';
import { costIndex, corporateTaxRate, engineerSalary, overhead, creditTerms, DEALER_COMMISSION } from '../data/economy';
import { pctWith } from './turkish';
import { EVENTS } from '../data/events';
import { MARKETS, marketScale } from '../data/markets';
import { SEGMENTS } from '../data/segments';
import { difficultyDef, type DifficultyId } from '../data/difficulty';
import { toolingDef } from '../data/tooling';
import { buildLaunchReport, customerFeedback } from './feedback';
import { ensureEstimate, narrowForTest } from './estimate';
import { MILITARY_COMPLEXITY, emptyLine, lineOffline, lineReport, lineUpkeep, militaryMargin, stationPrice } from './factory';
import { MARKET_IDS, SEGMENT_IDS, modelScores, priceNow, segmentMarket } from './market';
import { network, networkWeek, networkWeekly, noteStateSales, recordStateSales, serviceSatisfaction, totalParc } from './network';
import { cityDef, type CityId } from '../data/cities';
import type { StateId } from '../data/states';
import { makeRng, rand, stateRng } from './rng';
import { updateRivals, initRivals } from './rivals';
import { autoCapacity, autoProductionRates } from './autocap';
import { eraReference } from './scoring';
import { allTech } from './techtree';
import { knownKnowhow, labSpeed, noteResearch, pumpResearchQueue, researchDef, researcherSalary, startingKnowledge } from './research';
import { checkBoom, publish, techIssue } from './news';
import { racingWeek } from './racing';
import {
  TESTS,
  actualReliability,
  detectionChance,
  testWeekCost,
  failureRate,
  fixCost,
  SUPPLIERS,
  withTuning,
} from './testing';
import { isMonthStart, weekFor, weekOfYear, yearFloat, yearOf } from './time';
import { devRate } from './development';
import type { CarModel, ComponentKey, GameState, MarketId, Project, SegmentId, YearSummary } from './types';
import { computeCarStats } from './vehicle';

export const COST_KEYS = ['materials', 'labor', 'salaries', 'dealers', 'freight', 'marketing', 'rnd', 'warranty', 'interest', 'other', 'tax', 'investment'] as const;
import { clamp, earn, financeNow, log, money, pushModal, spend } from './util';

export const SAVE_VERSION = 1;
export const END_YEAR = 1961;

export interface NewGameOptions {
  companyName: string;
  /** Only the American market is played for now; the option stays for old callers. */
  hq?: MarketId;
  /** The town the factory stands in (Detroit if not given). */
  city?: CityId;
  seed?: number;
  difficulty?: DifficultyId;
}

export function newGame(opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const diff = difficultyDef(opts.difficulty);
  const markets = {} as GameState['markets'];
  for (const m of MARKETS) {
    // The American market only: the factory sells in its own state first (see network.ts).
    markets[m.id] = { unlocked: m.id === 'usa', dealerLevel: 0, awareness: m.id === 'usa' ? 0.15 : 0, adBudget: 0 };
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
      hq: 'usa',
      city: cityDef(opts.city).id,
      cash: diff.cash,
      loan: 0,
      reputation: diff.reputation,
      engineers: diff.engineers,
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
    research: { known: startingKnowledge(1900), active: [] },
    news: [],
    cardsSeen: CARDS.filter((c) => c.year <= 1900).map((c) => c.id),
    settings: { engineerMode: true, autoPauseCards: true, modeChosen: false, difficulty: diff.id },
    nextId: 1,
    decisions: [],
    errors: [],
  };
  updateRivals(state, makeRng(seed ^ 0x5eed), true);
  log(state, `${state.company.name} kuruldu. Bol şans!`, 'good');
  // The factory's own state is the whole market at first.
  network(state);
  return state;
}

// ---------- helpers used by UI and actions ----------

export const currentYear = (s: GameState) => yearFloat(s.week);

export function engineersBusy(s: GameState): number {
  return Math.round(s.projects.filter((p) => p.phase === 'development').reduce((a, p) => a + p.engineers, 0));
}

/** Engineers drawing a salary with nothing to do: no project in development or testing, no research. */
export function idleEngineers(s: GameState): number {
  const working = s.projects.some((p) => p.phase === 'development' || p.phase === 'testing') || (s.research?.active.length ?? 0) > 0;
  return working ? 0 : s.company.engineers;
}

/** Why engineers are idle, in words (the idle count is idleEngineers). */
export function idleReason(s: GameState): string {
  if (s.projects.some((p) => p.phase === 'production' || p.phase === 'ready'))
    return 'proje üretim hazırlığında ya da lansman bekliyor; o aşamada mühendis çalışmaz, geliştirme ya da araştırma da yok';
  if (s.projects.some((p) => p.phase === 'design')) return 'proje tasarım masasında, geliştirme henüz başlamadı; araştırma da yok';
  return 'ne geliştirmede bir proje var ne de araştırma';
}

export interface ModelMargin {
  id: string;
  name: string;
  /** Cars built per week lately. */
  built: number;
  net: number;
  material: number;
  /** Line labour per car at today's output (per week when nothing is built). */
  labour: number;
  labourWeek: number;
  margin: number;
}

/** What each car on sale earns or loses per car at the rate it is being built. */
export function modelMargins(s: GameState): ModelMargin[] {
  return s.models
    .filter((m) => m.status === 'active')
    .map((m) => {
      const h = m.history.slice(-8);
      const built = h.length ? h.reduce((a, x) => a + x.built, 0) / h.length : 0;
      const lines = s.lines.filter((l) => l.modelId === m.id && !l.military);
      const cap = lines.reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
      const labourWeek = lines.reduce((a, l) => a + lineUpkeep(s, l, cap > 0 ? built / cap : 0), 0);
      const net = priceNow(m, s.week) * (1 - DEALER_COMMISSION);
      const material = materialUnitCost(s, m);
      const labour = built > 0.05 ? labourWeek / built : labourWeek;
      return { id: m.id, name: m.name, built, net, material, labour, labourWeek, margin: built > 0.05 ? net - material - labour : -labourWeek };
    });
}

export interface CashReport {
  /** Last 52 weeks. */
  revenue: number;
  costs: { key: (typeof COST_KEYS)[number]; amount: number }[];
  /** Average cash flow of the last eight weeks, investments included. */
  weeklyNet: number;
  /** Credit the bank would still give. */
  room: number;
  rate: number;
  idle: number;
  idleWeekly: number;
  /** Weeks left to get the till back above zero. */
  weeksLeft: number;
}

/** Where the money goes: the year's costs, the recent cash flow, spare credit and idle engineers. */
export function cashReport(s: GameState): CashReport {
  const yf = yearFloat(s.week);
  const last = s.finance.slice(-52);
  const costs = COST_KEYS.map((key) => ({ key, amount: last.reduce((a, f) => a + (f[key] ?? 0), 0) }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const recent = s.finance.slice(-8);
  const weeklyNet = recent.length ? recent.reduce((a, f) => a + f.revenue - COST_KEYS.reduce((b, k) => b + (f[k] ?? 0), 0), 0) / recent.length : 0;
  const c = credit(s);
  const idle = idleEngineers(s);
  return {
    revenue: last.reduce((a, f) => a + f.revenue, 0),
    costs,
    weeklyNet,
    room: Math.max(0, c.limit - s.company.loan),
    rate: c.rate,
    idle,
    idleWeekly: idle * engineerSalary(yf),
    weeksLeft: Math.max(0, 13 - s.company.negativeWeeks),
  };
}

/** A loan that closes the gap and carries two months of the current losses. */
export function rescueLoan(s: GameState): number {
  const r = cashReport(s);
  const need = Math.max(0, -s.company.cash) + Math.max(0, -r.weeklyNet) * 8 + 1000 * costIndex(yearFloat(s.week));
  return Math.min(Math.floor(r.room / 500) * 500, Math.ceil(need / 500) * 500);
}

/** Every engineer works: projects in development share the whole team equally. */
export function shareEngineers(s: GameState) {
  const dev = s.projects.filter((p) => p.phase === 'development');
  for (const p of dev) p.engineers = s.company.engineers / dev.length;
}

/** Unit cost of the prototypes under test, in 1900 dollars (older saves did not store it). */
export function protoUnitCost(p: Project, yf: number): number {
  return p.protoUnitCost ?? computeCarStats(p.design, yf, p.bonus).unitCost;
}

export function materialUnitCost(s: GameState, model: Pick<CarModel, 'stats' | 'suppliers' | 'unitsBuilt' | 'tooling' | 'experience'>): number {
  const yf = yearFloat(s.week);
  let cost = model.stats.unitCost * toolingDef(model.tooling).materialMult;
  for (const k of Object.keys(model.suppliers) as ComponentKey[]) {
    const mult = SUPPLIERS.find((x) => x.id === model.suppliers[k])!.costMult;
    cost += model.stats.componentCost[k] * (mult - 1);
  }
  // Volume makes cars cheaper (jigs, purchasing, practice): a model built by the tens of thousands costs about 12% less.
  const learning = Math.max(0.88, Math.pow(1 + (model.unitsBuilt + (model.experience ?? 0)) / 4000, -0.05));
  const war = s.flags.materialsUntil && yf < s.flags.materialsUntil && yf >= 1914.6 ? 1.25 : 1;
  // Parts makers next door, or everything by train from the East.
  const local = cityDef(s.company.city).parts;
  return cost * costIndex(yf) * learning * war * local;
}

export function companyAssets(s: GameState): number {
  const lines = s.lines.reduce(
    (a, l) => a + Object.values(l.stations).flat().reduce((b, id) => b + stationPrice(id, s.week) * 0.5, 0),
    0,
  );
  const inventory = s.models.reduce((a, m) => a + m.inventory * materialUnitCost(s, m), 0);
  return lines + inventory + Math.max(0, s.company.cash);
}

/**
 * What the company is worth: its machines, stock and cash, less debt, plus the earning power of the
 * make (six years of the last year's operating profit).
 */
export function companyValue(s: GameState): number {
  const last = s.finance.slice(-52);
  const operating = last.reduce((a, f) => a + f.revenue - COST_KEYS.filter((k) => k !== 'investment').reduce((b, k) => b + (f[k] ?? 0), 0), 0);
  return companyAssets(s) - s.company.loan + Math.max(0, operating) * 6;
}

export interface FinalScore {
  total: number;
  max: number;
  parts: { label: string; value: string; points: number; max: number }[];
  rank: number;
  /** Where the total stands on the scale. */
  tier: string;
}

/** Score tiers from the top down; a good campaign reaches "Büyük üretici", a great one "Sanayi devi". */
export const SCORE_TIERS: { min: number; name: string }[] = [
  { min: 1400, name: 'Efsane' },
  { min: 1150, name: 'Sanayi devi' },
  { min: 900, name: 'Büyük üretici' },
  { min: 650, name: 'Saygın marka' },
  { min: 0, name: 'Butik atölye' },
];

/** The end-of-campaign score: sales rank, company value, reputation, best magazine verdict, racing wins. */
export function finalScore(s: GameState): FinalScore {
  const totalSold = s.models.reduce((a, m) => a + m.unitsSold, 0);
  const rank = [totalSold, ...s.rivals.map((r) => r.unitsSold)].sort((a, b) => b - a).indexOf(totalSold) + 1;
  const value = companyValue(s);
  // Reviews and races count for the last years of the campaign: an early hit does not carry a whole career.
  const recent = s.models.filter((m) => m.launchWeek >= s.week - 10 * 52);
  const latest = [...s.models].sort((a, b) => b.launchWeek - a.launchWeek)[0];
  const review = recent.length ? recent.reduce((a, m) => a + m.reviewScore, 0) / recent.length : latest ? latest.reviewScore * 0.7 : 0;
  const year = yearOf(s.week);
  const winYears = s.racing?.winYears ?? [];
  const wins = winYears.filter((y) => y > year - 20).length;
  const parts = [
    // 1st → 400, 2nd → 325, 5th → 225, 10th → 150, 20th → 75, 40th → 0
    { label: 'Tüm zamanların satış sırası', value: `${rank}.`, points: Math.max(0, Math.round(400 * (1 - Math.log(rank) / Math.log(40)))), max: 400 },
    // $1 mn → 300, $1 mr → 450, $10 mr and more → 500
    { label: 'Şirket değeri', value: money(value), points: Math.min(500, Math.max(0, Math.round(50 * Math.log10(Math.max(1, value))))), max: 500 },
    { label: 'İtibar', value: `${Math.round(s.company.reputation)}/100`, points: Math.round(3 * s.company.reputation), max: 300 },
    { label: recent.length ? 'Son on yılın dergi puanı (ortalama)' : 'Son arabanın dergi puanı (eski)', value: `${review.toFixed(1)}/10`, points: Math.round(30 * review), max: 300 },
    { label: 'Son yirmi yılın yarış zaferleri', value: String(wins), points: Math.min(200, 25 * wins), max: 200 },
  ];
  const total = parts.reduce((a, p) => a + p.points, 0);
  return { total, max: parts.reduce((a, p) => a + p.max, 0), parts, rank, tier: SCORE_TIERS.find((t) => total >= t.min)!.name };
}

export function credit(s: GameState) {
  const c = creditTerms(yearFloat(s.week), s.company.reputation, companyAssets(s));
  return { ...c, limit: c.limit * difficultyDef(s.settings.difficulty).credit };
}

/** Weekly cost of the dealer network (the American one is state by state: network.ts). */
export function dealerUpkeep(s: GameState, market: MarketId): number {
  if (market === 'usa') return networkWeekly(s);
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
  } else if (weekOfYear(s.week) % 13 === 0) payTaxInstalment(s);
  if (isMonthStart(s.week)) {
    checkStall(s);
    for (const n of updateRivals(s, stateRng(s))) log(s, n.text, n.tone, 'rival');
  }
  advanceProjects(s);
  advanceResearch(s);
  autoProductionRates(s);
  produce(s);
  sell(s);
  networkWeek(s);
  launchReports(s);
  field(s);
  fixedCosts(s);
  racingWeek(s);
  drift(s);
  if (isMonthStart(s.week)) {
    monthly(s);
    autoCapacity(s, (m) => materialUnitCost(s, m));
    checkBoom(s);
  }
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
  for (const t of fresh) s.unlockedTech.push(t.id);
  const toLearn = fresh.filter((t) => researchDef(t.id));
  const free = fresh.filter((t) => !researchDef(t.id));
  if (free.length) log(s, `Yeni teknolojiler: ${free.map((t) => t.name).join(', ')}`, 'good', 'tech');
  if (toLearn.length) log(s, `Yeni teknolojiler ortaya çıktı, Ar-Ge’de araştırılabilir: ${toLearn.map((t) => t.name).join(', ')}`, 'good', 'tech');
  const issue = techIssue(
    s,
    toLearn.map((t) => researchDef(t.id)!),
    year,
  );
  if (issue) publish(s, issue);
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
    (a, f) => a + f.materials + f.labor + f.salaries + f.dealers + f.marketing + f.rnd + f.warranty + f.interest + f.other + (f.tax ?? 0),
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
  for (const k of COST_KEYS) breakdown[k] = weeks.reduce((a, f) => a + (f[k] ?? 0), 0);
  s.years.push({ year, revenue, profit: revenue - costs, unitsSold: units, shareByMarket, cashEnd: s.company.cash, costs: breakdown });
  payCorporateTax(s, year, revenue - (costs - breakdown.tax) - 0.2 * breakdown.investment);
  if (year >= 1900 && s.week < s.endWeek) {
    // Only the latest year report is kept; it waits in a corner while time runs on.
    s.modals = s.modals.filter((m) => m.kind !== 'yearReport');
    pushModal(s, { kind: 'yearReport', year });
  }
}

/**
 * Monthly: stop the clock when the company is standing still, which is easy to miss while time runs
 * (players left designs on the desk for years, or let one car age a decade with no successor).
 */
function checkStall(s: GameState) {
  if (s.modals.some((m) => m.kind === 'stall')) return;
  const since = (k: string) => s.week - (s.flags[k] ?? -1e6);
  // A project waiting on the player: a design on the desk, tests done but no production prep, no
  // dies ordered, or a finished car never launched. Easy to miss while time runs (one company sat
  // three years with a tested car and no dies).
  for (const p of s.projects) {
    const w = waitingOn(p);
    if (!w) {
      delete p.waitKind;
      delete p.waitSince;
    } else if (p.waitKind !== w) {
      p.waitKind = w;
      p.waitSince = w === 'design' ? p.createdWeek : s.week;
    }
  }
  const stuck = s.projects.find(
    (p) => p.waitKind && s.week - (p.waitSince ?? s.week) >= (p.waitKind === 'design' ? 13 : 8) && since(`stall:${p.id}:${p.waitKind}`) >= 26,
  );
  if (stuck && stuck.waitKind) {
    s.flags[`stall:${stuck.id}:${stuck.waitKind}`] = s.week;
    pushModal(s, { kind: 'stall', reason: stuck.waitKind, projectId: stuck.id });
    return;
  }
  // A car developed far past its target gains nothing more: the engineers could be testing it.
  const polished = s.projects.find((p) => p.phase === 'development' && p.dev.done >= p.dev.required * 1.6);
  if (polished && !s.flags[`stallPolish:${polished.id}`]) {
    s.flags[`stallPolish:${polished.id}`] = s.week;
    pushModal(s, { kind: 'stall', reason: 'polish', projectId: polished.id });
    return;
  }
  if (s.projects.length) return;
  // While the lines work for the army there is no civilian car to bring out.
  if ((s.flags.militaryUntil ?? 0) > yearFloat(s.week)) return;
  const active = s.models.filter((m) => m.status === 'active');
  const newest = active.length ? Math.max(...active.map((m) => m.refreshWeek)) : -1;
  const aging = active.length ? s.week - newest >= 4 * 52 : s.week >= 13;
  if (aging && since('stallIdle') >= 52) {
    s.flags.stallIdle = s.week;
    pushModal(s, { kind: 'stall', reason: 'idle' });
  }
}

/** What a project is waiting for the player to do, if anything. */
function waitingOn(p: Project): Project['waitKind'] {
  if (p.phase === 'design') return 'design';
  if (p.phase === 'testing' && TESTS.every((t) => p.tests[t.id].done >= p.tests[t.id].planned)) return 'tested';
  if (p.phase === 'production' && p.productionReadyWeek === undefined) return 'tooling';
  if (p.phase === 'ready') return 'launch';
  return undefined;
}

/**
 * Corporate income tax on the year's profit (before last year's tax; a fifth of the year's investment
 * is written off). Losses are carried forward against later profits.
 */
function payCorporateTax(s: GameState, year: number, taxable: number) {
  let carry = s.company.lossCarry ?? 0;
  if (taxable <= 0) {
    s.company.lossCarry = carry - taxable;
    return;
  }
  const base = Math.max(0, taxable - carry);
  s.company.lossCarry = Math.max(0, carry - taxable);
  const rate = corporateTaxRate(year, s.company.hq);
  const tax = base * rate;
  if (tax < 1) return;
  // Paid in four instalments over the year (any unpaid rest of an older bill comes due now).
  if (s.company.taxOwed) spend(s, s.company.taxOwed, 'tax');
  s.company.taxOwed = tax;
  s.company.taxInstalments = 4;
  payTaxInstalment(s);
  log(s, `${year} kurumlar vergisi: ${money(tax)} (vergilenen kârın ${pctWith(rate, 'poss', Number.isInteger(Math.round(rate * 1000) / 10) ? 0 : 1)}), dört taksitte ödenecek.${carry > 0 ? ' Önceki yılların zararı düşüldü.' : ''}`, 'info');
}

/** A quarter of the year's tax bill (called at the new year and every thirteen weeks). */
function payTaxInstalment(s: GameState) {
  const owed = s.company.taxOwed ?? 0;
  const left = s.company.taxInstalments ?? 0;
  if (owed <= 0 || left <= 0) return;
  const part = owed / left;
  spend(s, part, 'tax');
  s.company.taxOwed = owed - part;
  s.company.taxInstalments = left - 1;
}

function advanceResearch(s: GameState) {
  if (!s.research) return;
  // Research staff hired mid-way speed up the work already under way.
  const speed = labSpeed(s);
  for (const a of s.research.active) a.weeksLeft -= speed / (a.speed ?? speed);
  const done = s.research.active.filter((a) => a.weeksLeft <= 0);
  if (!done.length) {
    // A queue held up by an empty till starts once the money is there.
    if (s.research.queue?.length) noteResearch(s, [], pumpResearchQueue(s, yearFloat(s.week)));
    return;
  }
  s.research.active = s.research.active.filter((a) => a.weeksLeft > 0);
  for (const a of done) {
    s.research.known.push(a.id);
    const def = researchDef(a.id);
    log(
      s,
      def?.passive
        ? `Ar-Ge tamamlandı: ${def.name} bundan sonraki bütün tasarımlara kendiliğinden girer.`
        : `Ar-Ge tamamlandı: ${def?.name ?? a.id} artık tasarımlarda kullanılabilir.`,
      'good',
      'tech',
    );
  }
  // Designs still on the drawing board pick up new know-how at once.
  for (const p of s.projects) if (p.phase === 'design') p.design = { ...p.design, knowhow: knownKnowhow(s) };
  noteResearch(s, done.map((a) => a.id), pumpResearchQueue(s, yearFloat(s.week)));
}

function advanceProjects(s: GameState) {
  const yf = yearFloat(s.week);
  shareEngineers(s);
  const rng = stateRng(s);
  for (const p of s.projects) {
    if (p.phase === 'development') {
      const work = devRate(p.engineers, s.company.skill);
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
        narrowForTest(ensureEstimate(p), t.id);
        spend(s, testWeekCost(t, protoUnitCost(p, yf), yf), 'rnd');
        for (const d of p.defects) {
          if (d.found) continue;
          if (rng() < detectionChance(t, d.area, d.severity, d.stubborn)) {
            d.found = true;
            d.fixed = true;
            spend(s, fixCost(d.severity, yf), 'rnd');
          }
        }
      }
      // Testing also tunes the car.
      if (running && p.bonus) {
        p.devBonus ??= p.bonus;
        p.bonus = withTuning(p.devBonus, p.tests);
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
    if (!model || lineOffline(s, line)) {
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
  /** Our buyers state by state (American market). */
  const where = new Map<string, Partial<Record<StateId, number>>>();
  const soldThisWeek = {} as Record<MarketId, number>;
  for (const market of MARKET_IDS) {
    soldThisWeek[market] = 0;
    for (const seg of SEGMENT_IDS) {
      const sm = segmentMarket(s, market, seg);
      if (sm.demand <= 0) continue;
      const key = `${year}:${market}:${seg}`;
      s.segmentSales[key] = (s.segmentSales[key] ?? 0) + sm.demand;
      for (const o of sm.offers) {
        if (o.kind === 'player') {
          const units = sm.player.units[o.id] ?? 0;
          const d = demand.get(o.id) ?? ({} as Record<MarketId, number>);
          d[market] = (d[market] ?? 0) + units;
          demand.set(o.id, d);
          if (market === 'usa') where.set(o.id, sm.player.byState[o.id] ?? {});
        } else {
          const units = (sm.demand * o.weight) / sm.totalWeight;
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
      // The dealer's cut (the factory showroom's staff cost the same).
      const commission = revenue * DEALER_COMMISSION;
      spend(s, commission, 'dealers');
      h.cost += commission;
      if (m === 'usa') {
        // Cars go by rail to the states that bought them; freight to all but the home state.
        for (const [id, u] of Object.entries(where.get(model.id) ?? {}) as [StateId, number][]) {
          const sent = u * ratio;
          h.cost += recordStateSales(s, id, sent, yf);
          noteStateSales(s, id, sent);
        }
      } else if (m !== s.company.hq) {
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
    // The American market's awareness is the states' (network.ts).
    if (m === 'usa') continue;
    const ms = s.markets[m];
    ms.awareness = clamp(ms.awareness * 0.996 + 0.0025 * Math.log1p(soldThisWeek[m]), 0, 1);
  }
}

function launchReports(s: GameState) {
  for (const m of s.models) {
    if (m.status !== 'active' || m.launchReportWeek !== s.week) continue;
    pushModal(s, { kind: 'launchReport', modelId: m.id, report: buildLaunchReport(s, m) });
  }
}

function field(s: GameState) {
  const yf = yearFloat(s.week);
  const ci = costIndex(yf);
  const serviceStrain = 1.4 - 0.4 * serviceSatisfaction(s, yf);
  for (const model of s.models) {
    const fieldUnits = modelFieldUnits(model, 156);
    if (fieldUnits <= 0) continue;
    const recent = modelFieldUnits(model, 52);
    const actual = actualReliability(model.stats.reliability, model.defects, model.suppliers, s.company.skill);
    const ref = eraReference(yf, model.segment).reliability;
    const actualScore = 50 + 50 * Math.tanh((0.85 * (actual - ref)) / 14);
    const rate = failureRate(actualScore, model.defects, model.suppliers, s.company.skill);
    // Where no workshop is near, a warranty repair means a mechanic on the train.
    const warranty = recent * rate * 45 * ci * serviceStrain;
    model.fieldFailures += fieldUnits * rate;
    model.warrantyCost += warranty;
    spend(s, warranty, 'warranty');
    // Buyers slowly learn how reliable the car really is.
    model.perceivedReliability += (actual - model.perceivedReliability) * Math.min(0.04, fieldUnits / 8000);

    for (const d of model.defects) {
      if (d.found || d.fixed) continue;
      if (!d.surfaced) {
        // The flaws no prototype meets need mileage: they show only after the car's first half year,
        // and slowly, so a well-tested first car is not undone in its first months.
        const age = s.week - model.launchWeek;
        const slow = d.stubborn ? (age < 26 ? 0 : 0.4) : 1;
        const k = (d.severity === 'critical' ? 0.00004 : d.severity === 'major' ? 0.00002 : 0) * slow;
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
  spend(s, s.company.engineers * engineerSalary(yf) + (s.company.researchers ?? 0) * researcherSalary(yf), 'salaries');
  s.company.idleSalary = (s.company.idleSalary ?? 0) + idleEngineers(s) * engineerSalary(yf);
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
    // American advertising works state by state (network.ts).
    if (m !== 'usa' && ms.adBudget > 0) {
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
    // Owners who wait weeks for a repair talk (once there are cars enough to matter).
    const service = totalParc(s) > 200 ? (serviceSatisfaction(s, yearFloat(s.week)) - 0.8) * 20 : 0;
    const target = clamp(22 + review * 4 + rel * 0.35 + Math.min(15, Math.log1p(sold) * 1.3) + Math.min(0, service), 0, 100);
    s.company.reputation += (target - s.company.reputation) * 0.01;
  }
}

function monthly(s: GameState) {
  const rng = stateRng(s);
  for (const model of s.models) {
    if (model.status !== 'active') continue;
    const recent = modelFieldUnits(model, 4);
    if (recent <= 0) continue;
    // One entry per car a month: what its buyers say, together.
    const lines = customerFeedback(s, model, rng);
    if (!lines.length) continue;
    const tone = lines.some((l) => l.tone === 'bad') ? (lines.some((l) => l.tone === 'good') ? 'info' : 'bad') : lines.some((l) => l.tone === 'good') ? 'good' : 'info';
    log(s, lines.map((l) => l.text).join(' '), tone, 'buyers');
  }
}

function checkSolvency(s: GameState) {
  if (s.company.cash >= 0) {
    s.company.negativeWeeks = 0;
    return;
  }
  s.company.negativeWeeks += 1;
  // Both warnings stop the clock: at 3x speed twelve weeks pass in seconds.
  if (s.company.negativeWeeks === 1) {
    log(s, 'Kasa eksiye düştü! 12 hafta içinde toparlanmazsan şirket iflas eder. Banka kredisi alabilir, masrafları kısabilirsin.', 'bad');
    pushModal(s, { kind: 'insolvency', stage: 'first' });
  }
  if (s.company.negativeWeeks === 8) {
    log(s, `Son uyarı: ${cashReport(s).weeksLeft} hafta içinde kasa artıya geçmezse iflas!`, 'bad');
    pushModal(s, { kind: 'insolvency', stage: 'last' });
  }
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
