import { devWeeksLeft } from './budget';
import { TESTS } from './testing';
import type { GameState, Project, ProjectPhase } from './types';

// The way to the first car. A new game is guided: one step at a time on a bar at the top of
// every screen, and the menu opens screen by screen as the first car needs them. Everything is
// open from the first launch on, in games that turned the guide off, and in older saves.

/** Screens that open one by one before the first launch (the rest are always there). */
export type Area = NonNullable<GameState['opened']>[number];
export const AREAS: Area[] = ['research', 'finance', 'factory', 'markets', 'company'];

const ORDER: Record<ProjectPhase, number> = { design: 1, development: 2, testing: 3, production: 4, ready: 5 };

export const guided = (s: GameState) => s.settings.guided === true && s.models.length === 0;

/**
 * Time waits for the first project: with nothing being designed, weeks only cost wages. About half the
 * players of October 2026 ran the clock for months without ever opening one.
 */
export const timeLocked = (s: GameState) => !s.gameOver && s.models.length === 0 && s.projects.length === 0;

/** The areas the company's progress calls for. */
function areasDue(s: GameState): Area[] {
  if (!guided(s)) return AREAS;
  const furthest = s.projects.reduce((n, p) => Math.max(n, ORDER[p.phase]), 0);
  const out: Area[] = [];
  // The designer points to research for what rivals have and the company lacks.
  if (furthest >= 1) out.push('research');
  // Money starts to flow with development (salaries, prototypes); a loan or an empty till needs the bank.
  if (furthest >= 2 || s.company.loan > 0 || s.company.cash < 0) out.push('finance');
  // Production preparation picks a line: the factory is where lines are built.
  if (furthest >= 4) out.push('factory');
  return out;
}

export function areaOpen(s: GameState, a: Area): boolean {
  return !guided(s) || (s.opened ?? []).includes(a) || areasDue(s).includes(a);
}

/**
 * Open what has become due; returns the areas opened just now (shown as new until visited). The rest
 * (the map and the company) open with the first launch, marked new too; a game that turned the guide
 * off, or an older save, has everything open and nothing new.
 */
export function updateAreas(s: GameState): Area[] {
  if (s.settings.guided !== true) return [];
  const opened = (s.opened ??= []);
  const fresh = areasDue(s).filter((a) => !opened.includes(a));
  // A save from before this was added, long past its first car: open them without a fuss.
  const launched = s.models.reduce((w, m) => Math.min(w, m.launchWeek), Infinity);
  if (fresh.length && s.week - launched > 26) {
    opened.push(...fresh);
    return [];
  }
  if (fresh.length) {
    opened.push(...fresh);
    (s.openedNew ??= []).push(...fresh);
  }
  return fresh;
}

/** The player looked at an area: it is no longer new. */
export function areaSeen(s: GameState, a: string) {
  if (s.openedNew?.includes(a as Area)) s.openedNew = s.openedNew.filter((x) => x !== a);
}

export type GuideStep =
  | { n: 1; kind: 'newProject' }
  | { n: 2; kind: 'design'; p: Project }
  | { n: 3; kind: 'development'; p: Project; done: boolean; weeks: number }
  | { n: 4; kind: 'testing'; p: Project; done: boolean; weeks: number }
  | { n: 5; kind: 'tooling'; p: Project; ordered: boolean; weeks: number }
  | { n: 6; kind: 'launch'; p: Project };

export const GUIDE_STEPS = 6;

/** Where the first car stands, or null once it is on sale (or the guide is off). */
export function guideStep(s: GameState): GuideStep | null {
  if (!guided(s) || s.gameOver) return null;
  // The project furthest along (the first one started when two are as far).
  const p = s.projects.reduce<Project | null>((best, x) => (!best || ORDER[x.phase] > ORDER[best.phase] ? x : best), null);
  if (!p) return { n: 1, kind: 'newProject' };
  switch (p.phase) {
    case 'design':
      return { n: 2, kind: 'design', p };
    case 'development':
      return { n: 3, kind: 'development', p, done: p.dev.done >= p.dev.required, weeks: devWeeksLeft(s, p) };
    case 'testing': {
      const weeks = Math.max(0, ...TESTS.map((t) => p.tests[t.id].planned - p.tests[t.id].done));
      return { n: 4, kind: 'testing', p, done: weeks === 0, weeks };
    }
    case 'production':
      return { n: 5, kind: 'tooling', p, ordered: p.productionReadyWeek !== undefined, weeks: Math.max(0, (p.productionReadyWeek ?? s.week) - s.week) };
    case 'ready':
      return { n: 6, kind: 'launch', p };
  }
}
