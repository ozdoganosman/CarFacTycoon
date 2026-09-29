import { cityDef } from '../data/cities';
import { MAX_SLOTS, capexScale, costIndex, newLineCost, realWage, slotCost, toolingMultiple } from '../data/economy';
import { STAGES, STATIONS, stationDef, type StationDef } from '../data/stations';
import { CHASSIS, byId } from '../data/tech';
import type { CarModel, GameState, ProductionLine, Project, StageId } from './types';
import { yearFloat } from './time';
import { msg, t } from '../i18n';

/** A night shift keeps a section working around the clock: more output, dearer labour. */
export const NIGHT_SHIFT_OUTPUT = 1.6;
export const NIGHT_SHIFT_COST = 1.9;
const shiftFactor = (line: ProductionLine, stage: StageId) => (line.nightShift?.[stage] ? NIGHT_SHIFT_OUTPUT : 1);
const shiftCost = (line: ProductionLine, stage: StageId) => (line.nightShift?.[stage] ? NIGHT_SHIFT_COST : 1);

export interface LineReport {
  perStage: Record<StageId, number>;
  throughput: number;
  bottleneck: StageId;
}

/** Wage policy (1914 "five dollar day") raises productivity. */
export const labourEfficiency = (state: GameState) =>
  (state.company.highWages ? 1.3 : 1) * (state.flags.layoffs ? 0.85 : 1);

export function lineReport(state: GameState, line: ProductionLine, complexity: number): LineReport {
  const eff = labourEfficiency(state);
  const perStage = {} as Record<StageId, number>;
  let throughput = Infinity;
  let bottleneck: StageId = 'press';
  for (const st of STAGES) {
    const cap = line.stations[st.id].reduce((s, id) => s + stationDef(id).capacity, 0) * shiftFactor(line, st.id);
    perStage[st.id] = (cap / Math.max(0.3, complexity)) * eff;
    if (perStage[st.id] < throughput) {
      throughput = perStage[st.id];
      bottleneck = st.id;
    }
  }
  return { perStage, throughput: Number.isFinite(throughput) ? throughput : 0, bottleneck };
}

/** Weekly running cost of a line. Idle stations still cost 40% (foremen, buildings). */
export function lineUpkeep(state: GameState, line: ProductionLine, utilisation: number): number {
  const base = STAGES.reduce(
    (s, st) => s + line.stations[st.id].reduce((a, id) => a + stationDef(id).upkeep, 0) * shiftCost(line, st.id),
    0,
  );
  const wage = (state.company.highWages ? 1.4 : 1) * cityDef(state.company.city).wages;
  const lay = state.flags.layoffs ? 0.75 : 1;
  const yf = yearFloat(state.week);
  return base * costIndex(yf) * realWage(yf) * (0.4 + 0.6 * Math.min(1, Math.max(0, utilisation))) * wage * lay;
}

export function stationPrice(id: string, week: number): number {
  return stationPriceAt(id, yearFloat(week));
}

/** Hand tools (the craftsmen's benches of 1900) never got dear like machines: they pay the square root of the plant premium. */
export const isCraftStation = (def: StationDef) => def.year <= 1900;

export function stationPriceAt(id: string, yf: number): number {
  const def = stationDef(id);
  return def.cost * costIndex(yf) * (isCraftStation(def) ? Math.sqrt(capexScale(yf)) : capexScale(yf));
}

export function stationResale(id: string, week: number): number {
  return stationPrice(id, week) * 0.3;
}

/** Dies and fixtures to build a model on one more line (or to move it to another). */
export function retoolCost(s: GameState, m: CarModel): number {
  const yf = yearFloat(s.week);
  return Math.max(5, 0.5 * toolingMultiple(yf)) * m.stats.unitCost * costIndex(yf) * byId(CHASSIS, m.design.chassis).tooling;
}

/** A line builds nothing while it is being put up or retooled. */
export const lineOffline = (s: GameState, l: ProductionLine) => s.week < Math.max(l.retoolUntilWeek ?? -1, l.buildUntilWeek ?? -1);

/** Lines other projects have already ordered their dies for. */
export function reservedLines(s: GameState, exceptProjectId?: string): Set<string> {
  return new Set(s.projects.filter((p) => p.id !== exceptProjectId && p.lineId).map((p) => p.lineId!));
}

/**
 * The line a project would naturally go to: the one it has, the replaced car's, or a line no car and
 * no other project uses. None when every line is taken: the project needs a new one.
 */
export function suggestedLine(s: GameState, p: Project): ProductionLine | undefined {
  const own = p.lineId ? s.lines.find((l) => l.id === p.lineId) : undefined;
  if (own) return own;
  const reserved = reservedLines(s, p.id);
  const open = (l: ProductionLine) => !l.military && !reserved.has(l.id);
  const replaced = p.replacesModelId ? s.lines.find((l) => l.modelId === p.replacesModelId && open(l)) : undefined;
  if (replaced) return replaced;
  const live = (l: ProductionLine) => s.models.some((m) => m.id === l.modelId && m.status === 'active');
  return s.lines.find((l) => open(l) && !live(l));
}

/**
 * A name no line has had yet ("Hat 7"): numbers are not reused after a line is closed. The prefix is
 * shown in the player's language; the number stays last, where the next call looks for it.
 */
export function nextLineName(s: GameState, prefix: string = msg('Hat')): string {
  const used = s.lines.map((l) => Number(/(\d+)$/.exec(l.name)?.[1] ?? 0));
  const n = Math.max(s.nextLineNo ?? 0, s.lines.length, ...used) + 1;
  s.nextLineNo = n;
  return `${t(prefix)} ${n}`;
}

export function emptyLine(id: string, name: string): ProductionLine {
  return { id, name, slots: 3, stations: { press: [], body: [], paint: [], assembly: [] } };
}

/** Military production for war contracts: a simple truck/jeep. */
export const MILITARY_COMPLEXITY = 1.2;
export const militaryMargin = (week: number) => 55 * costIndex(yearFloat(week));

// ---------------- Line planning ----------------

/** The fastest station available in each section today. */
export function bestStations(yf: number, allowBlack: boolean): Record<StageId, StationDef> {
  const best = {} as Record<StageId, StationDef>;
  for (const st of STAGES) {
    const options = STATIONS.filter((x) => x.stage === st.id && x.year <= yf && (allowBlack || !x.blackOnly));
    best[st.id] = options.reduce((a, b) => (b.capacity > a.capacity ? b : a));
  }
  return best;
}

/** Is there a faster paint shop that only does black? */
export function blackPaintIsFaster(yf: number): boolean {
  return bestStations(yf, true).paint.capacity > bestStations(yf, false).paint.capacity;
}

/**
 * A balanced line: as many cars a week as the slowest section can make with today's fastest machines
 * in every place, and each section reaching that pace in the cheapest way over three years (price plus
 * wages). A small hall making a few cars a week keeps craftsmen's benches where a moving line would
 * stand idle. Full size by default; a smaller hall (`slots`) for a smaller demand.
 */
export function planBalancedLine(yf: number, allowBlack: boolean, slots = MAX_SLOTS): Record<StageId, string[]> {
  const best = bestStations(yf, allowBlack);
  const target = Math.min(...STAGES.map((st) => best[st.id].capacity * slots));
  const wages = costIndex(yf) * realWage(yf) * PLAN_WEEKS;
  const plan = {} as Record<StageId, string[]>;
  for (const st of STAGES) {
    let pick = { id: best[st.id].id, n: Math.min(slots, Math.ceil(target / best[st.id].capacity - 1e-9)), cost: Infinity };
    for (const def of STATIONS.filter((x) => x.stage === st.id && x.year <= yf && (allowBlack || !x.blackOnly))) {
      const n = Math.ceil(target / def.capacity - 1e-9);
      if (n > slots) continue;
      // Wages at the share of the machines' pace the line uses (the same curve as lineUpkeep).
      const use = target / (n * def.capacity);
      const cost = n * (stationPriceAt(def.id, yf) + def.upkeep * wages * (0.4 + 0.6 * use));
      if (cost < pick.cost) pick = { id: def.id, n, cost };
    }
    plan[st.id] = Array.from({ length: pick.n }, () => pick.id);
  }
  return plan;
}

/** Years of wages the planner weighs against a machine's price. */
const PLAN_WEEKS = 150;

/** Money to widen a line from `from` to `to` slots. */
export function expansionCost(yf: number, from: number, to: number): number {
  let c = 0;
  for (let k = from; k < to; k++) c += slotCost(yf, k);
  return c;
}

/** A small workshop line like the one the company starts with: the cheapest machines of the day, one per section. */
export function workshopPlan(yf: number): Record<StageId, string[]> {
  const plan = {} as Record<StageId, string[]>;
  for (const st of STAGES) {
    const cheapest = STATIONS.filter((x) => x.stage === st.id && x.year <= yf && !x.blackOnly).reduce((a, b) => (b.cost < a.cost ? b : a));
    plan[st.id] = [cheapest.id];
  }
  return plan;
}

export function workshopLineCost(week: number): number {
  const plan = workshopPlan(yearFloat(week));
  return newLineCost(yearFloat(week)) + STAGES.reduce((a, st) => a + plan[st.id].reduce((b, id) => b + stationPrice(id, week), 0), 0);
}

/** Price of a new, fully equipped, balanced line of `slots` places per section (without tooling for a model). */
export function turnkeyLineCost(week: number, allowBlack: boolean, slots = MAX_SLOTS): number {
  const yf = yearFloat(week);
  const plan = planBalancedLine(yf, allowBlack, slots);
  const stations = STAGES.reduce((a, st) => a + plan[st.id].reduce((b, id) => b + stationPrice(id, week), 0), 0);
  return newLineCost(yf) + expansionCost(yf, emptyLine('x', 'x').slots, Math.max(emptyLine('x', 'x').slots, slots)) + stations;
}

export interface ModernizeQuote {
  plan: Record<StageId, string[]>;
  buy: number;
  resale: number;
  expand: number;
  /** Net cash needed. */
  cost: number;
  /** Raw throughput (cars per week at complexity 1) before and after. */
  before: number;
  after: number;
}

/** What it takes to rebuild a line to today's balanced plan, keeping the stations it can reuse. */
export function modernizeQuote(line: ProductionLine, week: number, allowBlack: boolean, slots = MAX_SLOTS): ModernizeQuote {
  const yf = yearFloat(week);
  const size = Math.max(line.slots, slots);
  const plan = planBalancedLine(yf, allowBlack, size);
  let buy = 0;
  let resale = 0;
  for (const st of STAGES) {
    const keep = [...line.stations[st.id]];
    for (const id of plan[st.id]) {
      const i = keep.indexOf(id);
      if (i >= 0) keep.splice(i, 1);
      else buy += stationPrice(id, week);
    }
    resale += keep.reduce((a, id) => a + stationResale(id, week), 0);
  }
  const expand = expansionCost(yf, line.slots, size);
  const raw = (stations: Record<StageId, string[]>) =>
    Math.min(...STAGES.map((st) => stations[st.id].reduce((a, id) => a + stationDef(id).capacity, 0) * shiftFactor(line, st.id)));
  return { plan, buy, resale, expand, cost: buy + expand - resale, before: raw(line.stations), after: raw(plan) };
}
