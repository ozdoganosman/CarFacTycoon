import { ATTRS } from '../data/segments';
import type { Rng } from './rng';
import type { AttrKey, Estimate, Project, TestId } from './types';

// Before launch the player only sees engineers' estimates: a range per attribute.
// Buyers' verdict (the appeal) stays hidden until the launch. Tests narrow the ranges.

const INITIAL_WIDTH: Record<AttrKey, number> = {
  accel: 10,
  topSpeed: 8,
  economy: 12,
  comfort: 16,
  handling: 16,
  safety: 18,
  reliability: 20,
  prestige: 14,
  practicality: 10,
};

const MIN_WIDTH: Record<AttrKey, number> = {
  accel: 2,
  topSpeed: 2,
  economy: 3,
  comfort: 4,
  handling: 4,
  safety: 3,
  reliability: 5,
  prestige: 9, // taste is only settled by the public at launch
  practicality: 3,
};

/** Weekly shrink factor of each test on the attributes it measures. */
const TEST_NARROW: Record<TestId, Partial<Record<AttrKey, number>>> = {
  dyno: { accel: 0.75, topSpeed: 0.75, economy: 0.85 },
  road: { handling: 0.85, comfort: 0.85, practicality: 0.85, economy: 0.9, accel: 0.9, topSpeed: 0.9 },
  crash: { safety: 0.75 },
  durability: { reliability: 0.88, comfort: 0.95 },
};

export function newEstimate(rng: Rng): Estimate {
  const offsets = {} as Record<AttrKey, number>;
  const width = {} as Record<AttrKey, number>;
  for (const k of ATTRS) {
    offsets[k] = rng() * 2 - 1;
    width[k] = INITIAL_WIDTH[k];
  }
  return { offsets, width };
}

/** Older saves have no estimate: give them a neutral one. */
export function ensureEstimate(p: Project): Estimate {
  if (!p.estimate) p.estimate = newEstimate(() => 0.5);
  return p.estimate;
}

export function narrowForTest(est: Estimate, test: TestId) {
  for (const [k, f] of Object.entries(TEST_NARROW[test]) as [AttrKey, number][]) {
    est.width[k] = Math.max(MIN_WIDTH[k], est.width[k] * f);
  }
}

/** Is the estimate for this attribute still rough? */
export const isRough = (est: Estimate, k: AttrKey) => est.width[k] > MIN_WIDTH[k] + 1.5;

export function estimateRange(est: Estimate, k: AttrKey, trueScore: number): { lo: number; hi: number; mid: number } {
  const w = est.width[k];
  // The centre wanders by up to 60% of the width, so a wide range is genuinely uncertain.
  const mid = trueScore + est.offsets[k] * w * 0.6;
  return { lo: Math.max(0, mid - w), hi: Math.min(100, mid + w), mid: Math.max(0, Math.min(100, mid)) };
}
