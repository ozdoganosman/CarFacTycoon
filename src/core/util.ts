import type { FinanceWeek, GameState, LogCategory, LogEntry, ModalItem } from './types';
import { fmtMoney, fmtNumber } from '../i18n/format';

export function log(state: GameState, text: string, tone: LogEntry['tone'] = 'info', cat?: LogCategory) {
  state.log.push(cat && cat !== 'company' ? { week: state.week, text, tone, cat } : { week: state.week, text, tone });
  // Each kind of news keeps its own recent history, so a flood of buyer letters or rival launches
  // never pushes the company's own warnings out.
  const kind = cat ?? 'company';
  const same = state.log.reduce((n, e) => n + ((e.cat ?? 'company') === kind ? 1 : 0), 0);
  if (same > LOG_KEEP[kind]) {
    const i = state.log.findIndex((e) => (e.cat ?? 'company') === kind);
    state.log.splice(i, 1);
  }
}

const LOG_KEEP: Record<LogCategory, number> = { company: 300, buyers: 80, rival: 150, tech: 80 };

export function pushModal(state: GameState, modal: ModalItem) {
  state.modals.push(modal);
}

/** Informational pop-ups (the year report) do not stop the clock; everything else waits for the player. */
export const isBlockingModal = (m: ModalItem) => m.kind !== 'yearReport' && m.kind !== 'news' && m.kind !== 'research';

/** Close the pop-up the player is looking at: the first blocking one, otherwise the first one. */
export function shiftModal(state: GameState) {
  const i = state.modals.findIndex(isBlockingModal);
  state.modals.splice(i >= 0 ? i : 0, 1);
}

export function newId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}

/** The finance record for the current week (created on demand). */
export function financeNow(state: GameState): FinanceWeek {
  let f = state.finance[state.finance.length - 1];
  if (!f || f.week !== state.week) {
    f = {
      week: state.week,
      revenue: 0,
      parts: 0,
      materials: 0,
      labor: 0,
      salaries: 0,
      dealers: 0,
      freight: 0,
      marketing: 0,
      rnd: 0,
      warranty: 0,
      interest: 0,
      tax: 0,
      other: 0,
      investment: 0,
    };
    state.finance.push(f);
    if (state.finance.length > 260) state.finance.splice(0, state.finance.length - 260);
  }
  return f;
}

export type CostCategory = Exclude<keyof FinanceWeek, 'week' | 'revenue' | IncomeCategory>;
/** Income kept on a line of its own besides the revenue it is part of. */
export type IncomeCategory = 'parts';

export function spend(state: GameState, amount: number, category: CostCategory) {
  state.company.cash -= amount;
  const f = financeNow(state);
  f[category] = (f[category] ?? 0) + amount;
}

/** Money coming in: revenue, and with a category also on that income line (the service shops' parts and repairs). */
export function earn(state: GameState, amount: number, category?: IncomeCategory) {
  state.company.cash += amount;
  const f = financeNow(state);
  f.revenue += amount;
  if (category) f[category] = (f[category] ?? 0) + amount;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Dollars, shortened in the player's language ("$1.25 mn" in Turkish). */
export function money(v: number): string {
  return fmtMoney(v);
}

/** A whole number with the language's digit grouping. */
export function num(v: number): string {
  return fmtNumber(v);
}

/**
 * Note a player decision for playtest analysis. Repeated tweaks of the same
 * thing in the same week (a price slider) collapse into one entry.
 */
export function decide(state: GameState, key: string, text: string) {
  const list = (state.decisions ??= []);
  const last = list[list.length - 1];
  if (last && last.key === key && last.week === state.week) last.text = text;
  else list.push({ week: state.week, key, text });
  if (list.length > 600) list.splice(0, list.length - 600);
}

/** Keep an error the game survived, so it reaches the bug report. */
export function recordError(state: GameState, at: string, e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  const list = (state.errors ??= []);
  list.push({ week: state.week, at, message: err.message, stack: err.stack?.split('\n').slice(0, 8).join('\n') });
  if (list.length > 30) list.splice(0, list.length - 30);
}
