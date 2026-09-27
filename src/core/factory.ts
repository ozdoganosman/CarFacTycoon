import { MAX_SLOTS, costIndex, newLineCost, realWage, slotCost } from '../data/economy';
import { STAGES, STATIONS, stationDef, type StationDef } from '../data/stations';
import type { GameState, ProductionLine, StageId } from './types';
import { yearFloat } from './time';

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
  const wage = state.company.highWages ? 1.4 : 1;
  const lay = state.flags.layoffs ? 0.75 : 1;
  const yf = yearFloat(state.week);
  return base * costIndex(yf) * realWage(yf) * (0.4 + 0.6 * Math.min(1, Math.max(0, utilisation))) * wage * lay;
}

export function stationPrice(id: string, week: number): number {
  return stationDef(id).cost * costIndex(yearFloat(week));
}

export function stationResale(id: string, week: number): number {
  return stationPrice(id, week) * 0.3;
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
 * A full-size line with today's best stations, balanced: no section gets more
 * stations than the slowest one can feed.
 */
export function planBalancedLine(yf: number, allowBlack: boolean): Record<StageId, string[]> {
  const best = bestStations(yf, allowBlack);
  const target = Math.min(...STAGES.map((st) => best[st.id].capacity * MAX_SLOTS));
  const plan = {} as Record<StageId, string[]>;
  for (const st of STAGES) {
    const n = Math.min(MAX_SLOTS, Math.ceil(target / best[st.id].capacity - 1e-9));
    plan[st.id] = Array.from({ length: n }, () => best[st.id].id);
  }
  return plan;
}

/** Money to widen a line from `from` to `to` slots. */
export function expansionCost(yf: number, from: number, to: number): number {
  let c = 0;
  for (let k = from; k < to; k++) c += slotCost(yf, k);
  return c;
}

/** Price of a new, fully equipped, balanced line (without tooling for a model). */
export function turnkeyLineCost(week: number, allowBlack: boolean): number {
  const yf = yearFloat(week);
  const plan = planBalancedLine(yf, allowBlack);
  const stations = STAGES.reduce((a, st) => a + plan[st.id].reduce((b, id) => b + stationPrice(id, week), 0), 0);
  return newLineCost(yf) + expansionCost(yf, emptyLine('x', 'x').slots, MAX_SLOTS) + stations;
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
export function modernizeQuote(line: ProductionLine, week: number, allowBlack: boolean): ModernizeQuote {
  const yf = yearFloat(week);
  const plan = planBalancedLine(yf, allowBlack);
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
  const expand = expansionCost(yf, line.slots, MAX_SLOTS);
  const raw = (stations: Record<StageId, string[]>) =>
    Math.min(...STAGES.map((st) => stations[st.id].reduce((a, id) => a + stationDef(id).capacity, 0) * shiftFactor(line, st.id)));
  return { plan, buy, resale, expand, cost: buy + expand - resale, before: raw(line.stations), after: raw(plan) };
}
