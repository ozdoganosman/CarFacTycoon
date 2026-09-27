import { costIndex, realWage } from '../data/economy';
import { STAGES, stationDef } from '../data/stations';
import type { GameState, ProductionLine, StageId } from './types';
import { yearFloat } from './time';

export interface LineReport {
  perStage: Record<StageId, number>;
  throughput: number;
  bottleneck: StageId;
}

/** Wage policy (1914 "five dollar day") raises productivity. */
export const labourEfficiency = (state: GameState) =>
  (state.company.highWages ? 1.15 : 1) * (state.flags.layoffs ? 0.85 : 1);

export function lineReport(state: GameState, line: ProductionLine, complexity: number): LineReport {
  const eff = labourEfficiency(state);
  const perStage = {} as Record<StageId, number>;
  let throughput = Infinity;
  let bottleneck: StageId = 'press';
  for (const st of STAGES) {
    const cap = line.stations[st.id].reduce((s, id) => s + stationDef(id).capacity, 0);
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
    (s, st) => s + line.stations[st.id].reduce((a, id) => a + stationDef(id).upkeep, 0),
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
