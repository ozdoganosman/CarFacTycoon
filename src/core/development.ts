import type { DevBonus, FocusKey } from './types';

export const FOCUS_KEYS: FocusKey[] = ['performance', 'efficiency', 'comfort', 'safety', 'cost'];

export const FOCUS_NAMES: Record<FocusKey, string> = {
  performance: 'Performans',
  efficiency: 'Verim',
  comfort: 'Konfor',
  safety: 'Güvenlik',
  cost: 'Maliyet',
};

export const FOCUS_HINTS: Record<FocusKey, string> = {
  performance: 'Motor gücü ↑, ağırlık ↓',
  efficiency: 'Yakıt tüketimi ↓',
  comfort: 'Konfor ↑',
  safety: 'Güvenlik ↑',
  cost: 'Birim maliyet ↓',
};

const b = (r: number) => 1 - Math.exp(-3 * Math.max(0, r));

/** Engineering skill multiplier for development bonuses. */
export const skillFactor = (skill: number) => 0.6 + skill / 250;

/** Engineer output per week (work units). */
export const productivity = (skill: number) => 0.6 + skill / 100;

/**
 * Turns the development points spent per focus area into concrete improvements.
 * Returns diminishing returns per area, so spreading effort usually beats dumping it in one.
 */
export function bonusFromPoints(
  points: Record<FocusKey, number>,
  required: number,
  done: number,
  skill: number,
): DevBonus {
  const sf = skillFactor(skill);
  const r = (k: FocusKey) => points[k] / Math.max(1, required);
  const polish = Math.max(0, done / Math.max(1, required) - 1);
  return {
    powerMult: 1 + 0.12 * b(r('performance')) * sf,
    massMult: 1 - 0.04 * b(r('performance')) * sf,
    fuelMult: 1 - 0.14 * b(r('efficiency')) * sf,
    comfort: 10 * b(r('comfort')) * sf,
    safety: 10 * b(r('safety')) * sf,
    costMult: 1 - 0.14 * b(r('cost')) * sf,
    reliability: 7 * (1 - Math.exp(-2.5 * polish)) * sf + (skill - 50) * 0.08,
  };
}

export function evenFocus(): Record<FocusKey, number> {
  return { performance: 0.2, efficiency: 0.2, comfort: 0.2, safety: 0.2, cost: 0.2 };
}

export function normalizeFocus(f: Record<FocusKey, number>): Record<FocusKey, number> {
  const total = FOCUS_KEYS.reduce((s, k) => s + Math.max(0, f[k]), 0) || 1;
  const out = {} as Record<FocusKey, number>;
  for (const k of FOCUS_KEYS) out[k] = Math.max(0, f[k]) / total;
  return out;
}

/** Bonus for an AI rival: a fully developed car with focus spread by the given weights. */
export function aiBonus(focus: Record<FocusKey, number>, skill: number): DevBonus {
  const f = normalizeFocus(focus);
  const points = {} as Record<FocusKey, number>;
  for (const k of FOCUS_KEYS) points[k] = f[k] * 1.1;
  return bonusFromPoints(points, 1, 1.1, skill);
}
