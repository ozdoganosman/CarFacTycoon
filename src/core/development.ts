import { withTuning } from './testing';
import type { DevBonus, FocusKey } from './types';

export const FOCUS_KEYS: FocusKey[] = ['performance', 'efficiency', 'comfort', 'safety', 'cost', 'quality'];

export const FOCUS_NAMES: Record<FocusKey, string> = {
  performance: 'Performans',
  efficiency: 'Verim',
  comfort: 'Konfor',
  safety: 'Güvenlik',
  cost: 'Maliyet',
  quality: 'Kalite',
};

export const FOCUS_HINTS: Record<FocusKey, string> = {
  performance: 'Motor gücü ↑, ağırlık ↓',
  efficiency: 'Yakıt tüketimi ↓',
  comfort: 'Konfor ↑',
  safety: 'Güvenlik ↑',
  cost: 'Birim maliyet ↓',
  quality: 'Güvenilirlik ↑, gizli kusur ↓',
};

const b = (r: number) => 1 - Math.exp(-2.2 * Math.max(0, r));

/** Engineering skill multiplier for development bonuses. */
export const skillFactor = (skill: number) => 0.6 + skill / 250;

/** Engineer output per week (work units). */
export const productivity = (skill: number) => 0.6 + skill / 100;

/**
 * Turns the development points spent per focus area into concrete improvements.
 * The effects are large (a car developed for power is a different car), with
 * diminishing returns per area; working past 100% keeps adding points.
 */
export function bonusFromPoints(
  points: Record<FocusKey, number>,
  required: number,
  done: number,
  skill: number,
): DevBonus {
  const sf = skillFactor(skill);
  const r = (k: FocusKey) => (points[k] ?? 0) / Math.max(1, required);
  const polish = Math.max(0, done / Math.max(1, required) - 1);
  return {
    powerMult: 1 + 0.35 * b(r('performance')) * sf,
    massMult: 1 - 0.1 * b(r('performance')) * sf,
    fuelMult: 1 - 0.3 * b(r('efficiency')) * sf,
    comfort: 25 * b(r('comfort')) * sf,
    safety: 25 * b(r('safety')) * sf,
    costMult: 1 - 0.28 * b(r('cost')) * sf,
    reliability: 20 * b(r('quality')) * sf + 7 * (1 - Math.exp(-2.5 * polish)) * sf + (skill - 50) * 0.08,
    defectMult: 1 - 0.5 * b(r('quality')) * sf,
  };
}

export function evenFocus(): Record<FocusKey, number> {
  const e = 1 / FOCUS_KEYS.length;
  return { performance: e, efficiency: e, comfort: e, safety: e, cost: e, quality: e };
}

export function normalizeFocus(f: Record<FocusKey, number>): Record<FocusKey, number> {
  const total = FOCUS_KEYS.reduce((s, k) => s + Math.max(0, f[k] ?? 0), 0) || 1;
  const out = {} as Record<FocusKey, number>;
  for (const k of FOCUS_KEYS) out[k] = Math.max(0, f[k] ?? 0) / total;
  return out;
}

/** A rival's usual test programme: its cars are tuned as well as developed. */
const AI_TESTS = { dyno: { done: 8 }, road: { done: 10 }, crash: { done: 4 }, durability: { done: 10 } };

/**
 * Development work behind an established maker's car, relative to a project's
 * requirement: big, practised engineering departments put far more hours into
 * each car than a new company's handful of engineers can.
 */
export const aiDevPoints = (skill: number) => 1 + skill / 150;

/** Bonus for an AI rival: a fully developed and tested car with focus spread by the given weights. */
export function aiBonus(focus: Record<FocusKey, number>, skill: number): DevBonus {
  const f = normalizeFocus(focus);
  const points = {} as Record<FocusKey, number>;
  for (const k of FOCUS_KEYS) points[k] = f[k] * aiDevPoints(skill);
  return withTuning(bonusFromPoints(points, 1, 1.1, skill), AI_TESTS);
}
