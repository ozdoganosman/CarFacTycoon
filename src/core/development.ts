import { withTuning } from './testing';
import type { AttrKey, DevBonus, FocusKey, SegmentId } from './types';
import { msg } from '../i18n';

export const FOCUS_KEYS: FocusKey[] = ['performance', 'efficiency', 'comfort', 'handling', 'safety', 'practicality', 'cost', 'quality'];

/** Marked with msg(): show with t(). */
export const FOCUS_NAMES: Record<FocusKey, string> = {
  performance: msg('Performans'),
  efficiency: msg('Verim'),
  comfort: msg('Konfor'),
  handling: msg('Yol tutuş'),
  safety: msg('Güvenlik'),
  practicality: msg('Pratiklik'),
  cost: msg('Maliyet'),
  quality: msg('Kalite'),
};

/** Marked with msg(): show with t(). */
export const FOCUS_HINTS: Record<FocusKey, string> = {
  performance: msg('Motor gücü ↑, ağırlık ↓'),
  efficiency: msg('Yakıt tüketimi ↓'),
  comfort: msg('Konfor ↑'),
  handling: msg('Yol tutuş ↑ (şasi ve süspansiyon ayarı)'),
  safety: msg('Güvenlik ↑'),
  practicality: msg('Pratiklik ↑ (iç düzen, bagaj, bakım kolaylığı)'),
  cost: msg('Birim maliyet ↓'),
  quality: msg('Güvenilirlik ↑, gizli kusur ↓'),
};

const b = (r: number) => 1 - Math.exp(-2.2 * Math.max(0, r));

/** Engineering skill multiplier for development bonuses. */
export const skillFactor = (skill: number) => 0.6 + skill / 250;

/** Engineer output per week (work units). */
export const productivity = (skill: number) => 0.6 + skill / 100;

/**
 * A bigger team is faster, but not in proportion: past a dozen or so engineers on one car they wait
 * for each other's drawings. Two engineers do the work of two; twenty the work of eight.
 */
export const teamOutput = (engineers: number) => (engineers <= 2 ? engineers : engineers / (1 + (engineers - 2) / 12));

/** Work a project's team gets done per week. */
export const devRate = (engineers: number, skill: number) => teamOutput(engineers) * productivity(skill);

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
    handling: 22 * b(r('handling')) * sf,
    safety: 25 * b(r('safety')) * sf,
    practicality: 22 * b(r('practicality')) * sf,
    costMult: 1 - 0.28 * b(r('cost')) * sf,
    reliability: 20 * b(r('quality')) * sf + 7 * (1 - Math.exp(-2.5 * polish)) * sf + (skill - 50) * 0.08,
    defectMult: 1 - 0.5 * b(r('quality')) * sf,
  };
}

export function evenFocus(): Record<FocusKey, number> {
  const e = 1 / FOCUS_KEYS.length;
  return { performance: e, efficiency: e, comfort: e, handling: e, safety: e, practicality: e, cost: e, quality: e };
}

/** Ready-made ways to spend the engineers' time, chosen when a project starts (and changeable later). Name and desc marked with msg(): show with t(). */
export const FOCUS_PRESETS: { id: string; name: string; desc: string; focus: Partial<Record<FocusKey, number>> }[] = [
  { id: 'even', name: msg('Dengeli'), desc: msg('Her alana eşit emek.'), focus: {} },
  { id: 'people', name: msg('Halk arabası'), desc: msg('Ucuz, dayanıklı, az yakan: çok satacak bir araba.'), focus: { cost: 0.35, quality: 0.25, efficiency: 0.2, practicality: 0.1, comfort: 0.05, safety: 0.05 } },
  { id: 'family', name: msg('Aile arabası'), desc: msg('Geniş, konforlu, güvenli.'), focus: { practicality: 0.25, comfort: 0.2, safety: 0.2, quality: 0.15, efficiency: 0.1, cost: 0.1 } },
  { id: 'fast', name: msg('Hız ve güç'), desc: msg('Güçlü motor, hafif gövde, iyi yol tutuş.'), focus: { performance: 0.45, handling: 0.25, quality: 0.1, safety: 0.1, efficiency: 0.05, comfort: 0.05 } },
  { id: 'driver', name: msg('Sürücü arabası'), desc: msg('Virajda keyif: yol tutuş ve performans.'), focus: { handling: 0.4, performance: 0.3, safety: 0.1, quality: 0.1, comfort: 0.1 } },
  { id: 'luxury', name: msg('Konfor ve prestij'), desc: msg('Sessiz, rahat, kusursuz işçilik.'), focus: { comfort: 0.35, quality: 0.25, safety: 0.15, performance: 0.1, handling: 0.05, practicality: 0.1 } },
  { id: 'work', name: msg('İş aracı'), desc: msg('Yük taşır, bozulmaz, ucuza çalışır.'), focus: { practicality: 0.3, quality: 0.3, cost: 0.25, efficiency: 0.15 } },
];

/** How much of the engineers' time each chosen priority takes; the other areas share the rest. */
export const PRIORITY_SHARE = 0.3;
export const MAX_PRIORITIES = 2;

/** The focus that puts extra work into up to two areas and spreads the rest evenly. */
export function priorityFocus(keys: FocusKey[]): Record<FocusKey, number> {
  const picked = FOCUS_KEYS.filter((k) => keys.includes(k)).slice(0, MAX_PRIORITIES);
  if (!picked.length) return evenFocus();
  const rest = (1 - PRIORITY_SHARE * picked.length) / (FOCUS_KEYS.length - picked.length);
  return Object.fromEntries(FOCUS_KEYS.map((k) => [k, picked.includes(k) ? PRIORITY_SHARE : rest])) as Record<FocusKey, number>;
}

/** Where the engineers start for each class of car (the player changes them in the engineers' estimate). */
export const SEGMENT_PRIORITIES: Record<SegmentId, FocusKey[]> = {
  city: ['cost', 'quality'],
  family: ['practicality', 'comfort'],
  sport: ['handling', 'performance'],
  luxury: ['comfort', 'quality'],
  pickup: ['practicality', 'quality'],
  suv: ['practicality', 'comfort'],
};

/** The focus area that improves each of the buyers' scores (prestige comes from the design itself). */
export const ATTR_FOCUS: Partial<Record<AttrKey, FocusKey>> = {
  accel: 'performance',
  topSpeed: 'performance',
  economy: 'efficiency',
  comfort: 'comfort',
  handling: 'handling',
  safety: 'safety',
  reliability: 'quality',
  practicality: 'practicality',
};

export function presetFocus(id: string): Record<FocusKey, number> {
  const p = FOCUS_PRESETS.find((x) => x.id === id);
  if (!p || !Object.keys(p.focus).length) return evenFocus();
  return normalizeFocus(Object.fromEntries(FOCUS_KEYS.map((k) => [k, p.focus[k] ?? 0])) as Record<FocusKey, number>);
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
