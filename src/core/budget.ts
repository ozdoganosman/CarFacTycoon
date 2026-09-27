import { requiredWork, startProject as startProjectFn, toolingQuote } from './actions';
import { productivity } from './development';
import { engineerSalary, overhead } from '../data/economy';
import { COST_KEYS, credit, dealerUpkeep, materialUnitCost } from './game';
import { MARKET_IDS } from './market';
import { TESTS, testWeekCost } from './testing';
import { yearFloat } from './time';
import type { GameState, Project } from './types';
import { NO_BONUS, computeCarStats } from './vehicle';

// "Can I finish this?" What a project will still cost before its car is on
// sale, set against what the company earns meanwhile and what it can pay with.

export interface LaunchBudget {
  /** Weeks until the car can be launched: development, tests, tooling. */
  weeks: number;
  protos: number;
  tests: number;
  tooling: number;
  /** The company's cash flow per week meanwhile, before project costs (negative while nothing sells). */
  weeklyNet: number;
  /** Money needed on top of what the company earns in the meantime. */
  need: number;
  cash: number;
  creditRoom: number;
}

/** Operating cash flow per week over the last two months, without research, prototypes, tests or investments. */
export function operatingWeekly(s: GameState): number {
  const recent = s.finance.slice(-8);
  // A new company has no books yet: its salaries, rent and agents are the whole story.
  if (recent.length < 4) {
    const yf = yearFloat(s.week);
    return -(s.company.engineers * engineerSalary(yf) + overhead(yf, s.lines.length) + MARKET_IDS.reduce((a, m) => a + dealerUpkeep(s, m), 0));
  }
  const keys = COST_KEYS.filter((k) => k !== 'investment' && k !== 'rnd');
  return recent.reduce((a, f) => a + f.revenue - keys.reduce((b, k) => b + f[k], 0), 0) / recent.length;
}

export function launchBudget(s: GameState, p: Project): LaunchBudget {
  const yf = yearFloat(s.week);
  const stats = computeCarStats(p.design, yf, p.bonus ?? NO_BONUS);
  // Development: the whole team shares the projects in development.
  let devWeeks = 0;
  if (p.phase === 'design' || p.phase === 'development') {
    const sharing = s.projects.filter((x) => x.phase === 'development' && x.id !== p.id).length + 1;
    const rate = (s.company.engineers / sharing) * productivity(s.company.skill);
    const required = p.phase === 'design' ? requiredWork(s, p) : p.dev.required;
    devWeeks = Math.ceil(Math.max(0, required - p.dev.done) / Math.max(0.1, rate));
  }
  const protos = p.phase === 'design' || p.phase === 'development' ? (p.kind === 'facelift' ? 1 : 3) * materialUnitCost(s, { stats, suppliers: p.suppliers, unitsBuilt: 0 }) : 0;
  // Tests run side by side; each costs its weeks.
  let tests = 0;
  let testWeeks = 0;
  if (p.phase === 'design' || p.phase === 'development' || p.phase === 'testing') {
    const unit1900 = p.protoUnitCost ?? stats.unitCost;
    for (const t of TESTS) {
      if (t.year > yf) continue;
      const left = Math.max(0, p.tests[t.id].planned - p.tests[t.id].done);
      tests += left * testWeekCost(t, unit1900, yf);
      testWeeks = Math.max(testWeeks, left);
    }
  }
  // Tooling on the line the car would most likely go to.
  let tooling = 0;
  let toolWeeks = 0;
  if (p.phase !== 'ready' && p.productionReadyWeek === undefined) {
    const replaced = p.replacesModelId ? s.lines.find((l) => l.modelId === p.replacesModelId) : undefined;
    const line = s.lines.find((l) => l.id === p.lineId) ?? replaced ?? s.lines.find((l) => !l.modelId) ?? s.lines[0];
    if (line) {
      const q = toolingQuote(s, p, line.id, p.tooling ?? 'standard');
      tooling = q.cost;
      toolWeeks = Math.max(q.weeks, q.leadWeeks);
    }
  } else if (p.productionReadyWeek !== undefined) toolWeeks = Math.max(0, p.productionReadyWeek - s.week);
  const weeks = devWeeks + testWeeks + toolWeeks;
  const weeklyNet = operatingWeekly(s);
  const need = protos + tests + tooling - weeklyNet * weeks;
  return { weeks, protos, tests, tooling, weeklyNet, need, cash: s.company.cash, creditRoom: Math.max(0, credit(s).limit - s.company.loan) };
}

/** 'ok' when cash covers it, 'credit' when only with a loan, 'short' when not even then. */
export function budgetVerdict(b: LaunchBudget): 'ok' | 'credit' | 'short' {
  if (b.need <= b.cash * 0.9) return 'ok';
  if (b.need <= b.cash + b.creditRoom * 0.9) return 'credit';
  return 'short';
}

/** The budget of a project not started yet, as it would begin today (on a copy of the game). */
export function newProjectBudget(s: GameState, segment: Project['segment'], replacesModelId?: string, start = startProjectFn): LaunchBudget | null {
  const copy = structuredClone(s);
  const r = start(copy, { name: 'x', segment, targetPrice: 0, replacesModelId });
  if (!r.ok) return null;
  return launchBudget(copy, copy.projects.find((x) => x.id === r.id)!);
}
