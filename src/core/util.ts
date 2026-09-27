import type { FinanceWeek, GameState, LogEntry, ModalItem } from './types';

export function log(state: GameState, text: string, tone: LogEntry['tone'] = 'info') {
  state.log.push({ week: state.week, text, tone });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}

export function pushModal(state: GameState, modal: ModalItem) {
  state.modals.push(modal);
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
      materials: 0,
      labor: 0,
      salaries: 0,
      dealers: 0,
      marketing: 0,
      rnd: 0,
      warranty: 0,
      interest: 0,
      other: 0,
      investment: 0,
    };
    state.finance.push(f);
    if (state.finance.length > 260) state.finance.splice(0, state.finance.length - 260);
  }
  return f;
}

export type CostCategory = Exclude<keyof FinanceWeek, 'week' | 'revenue'>;

export function spend(state: GameState, amount: number, category: CostCategory) {
  state.company.cash -= amount;
  financeNow(state)[category] += amount;
}

export function earn(state: GameState, amount: number) {
  state.company.cash += amount;
  financeNow(state).revenue += amount;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function money(v: number): string {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)} mr`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)} mn`;
  if (a >= 1e4) return `${sign}$${Math.round(a / 1000)} bin`;
  return `${sign}$${Math.round(a).toLocaleString('tr-TR')}`;
}

export function num(v: number): string {
  return Math.round(v).toLocaleString('tr-TR');
}
