import { ATTRS, MARKET_TASTE, segmentDef } from '../data/segments';
import { referenceBonus, referenceDesigns } from './ai';
import { computeCarStats } from './vehicle';
import { INDUSTRY_RESIDUAL_DEFECTS } from './testing';
import type { AttrKey, CarStats, MarketId, Scores, SegmentId } from './types';
import { t } from '../i18n';

// Scores are relative to the average new car of the same class in the same year
// (50 = class average), so a 1930 car that was great at launch slowly becomes
// mediocre as the era moves on.

export interface EraReference {
  year: number;
  topSpeed: number;
  accel50: number;
  accel100: number | null;
  fuel: number;
  comfort: number;
  handling: number;
  safety: number;
  reliability: number;
  prestige: number;
  practicality: number;
  powerHp: number;
  unitCost: number;
  taxHp: number;
  displacementCc: number;
  /** The typical car of this class built for each market (for price anchors). */
  byMarket: Record<MarketId, { unitCost: number; taxHp: number; displacementCc: number }>;
}

const refCache = new Map<string, EraReference>();

export function eraReference(yearFloat: number, segment: SegmentId): EraReference {
  const year = Math.floor(yearFloat);
  // Classes that do not exist yet borrow the family car as their yardstick.
  const seg: SegmentId = (segment === 'pickup' && year < 1913) || (segment === 'suv' && year < 1946) ? 'family' : segment;
  const key = `${year}:${seg}`;
  const cached = refCache.get(key);
  if (cached) return cached;
  const stats = referenceDesigns(year, seg).map((d) => computeCarStats(d, year, referenceBonus()));
  const avg = (f: (s: CarStats) => number) => stats.reduce((a, s) => a + f(s), 0) / stats.length;
  const geo = (f: (s: CarStats) => number) => Math.exp(stats.reduce((a, s) => a + Math.log(f(s)), 0) / stats.length);
  const t100s = stats.map((s) => s.accel100);
  const ref: EraReference = {
    year,
    topSpeed: geo((s) => s.topSpeed),
    accel50: geo((s) => s.accel50),
    accel100: t100s.every((t) => t !== null) ? Math.exp(t100s.reduce((a, t) => a + Math.log(t!), 0) / t100s.length) : null,
    fuel: geo((s) => s.fuel),
    comfort: avg((s) => s.comfort),
    handling: avg((s) => s.handling),
    safety: avg((s) => s.safety),
    reliability: avg((s) => s.reliability) - INDUSTRY_RESIDUAL_DEFECTS,
    prestige: avg((s) => s.prestige),
    practicality: avg((s) => s.practicality),
    powerHp: geo((s) => s.engine.powerHp),
    unitCost: avg((s) => s.unitCost),
    taxHp: avg((s) => s.engine.taxHp),
    displacementCc: avg((s) => s.engine.displacementCc),
    byMarket: {
      usa: { unitCost: stats[0].unitCost, taxHp: stats[0].engine.taxHp, displacementCc: stats[0].engine.displacementCc },
      europe: { unitCost: stats[1].unitCost, taxHp: stats[1].engine.taxHp, displacementCc: stats[1].engine.displacementCc },
    },
  };
  refCache.set(key, ref);
  return ref;
}

const squash = (z: number) => 50 + 50 * Math.tanh(0.85 * z);

/** Which acceleration metric the era uses for display & scoring (the label in the player's language). */
export function accelMetric(stats: Pick<CarStats, 'accel50' | 'accel100'>, ref: EraReference): { label: string; value: number | null; refValue: number } {
  if (ref.accel100 !== null) return { label: t('0-100 km/s'), value: stats.accel100, refValue: ref.accel100 };
  return { label: t('0-50 km/s'), value: stats.accel50, refValue: ref.accel50 };
}

export function scoreStats(stats: CarStats, yearFloat: number, segment: SegmentId, reliabilityOverride?: number): Scores {
  const ref = eraReference(yearFloat, segment);
  const accel = accelMetric(stats, ref);
  // A car that cannot reach 100 km/h at all in a 0-100 era is scored as if it took 3x the average.
  const accelTime = accel.value ?? accel.refValue * 3;
  const pts = (v: number, r: number) => squash((v - r) / 14);
  return {
    accel: squash(-Math.log(accelTime / accel.refValue) / 0.35),
    topSpeed: squash(Math.log(stats.topSpeed / ref.topSpeed) / 0.28),
    economy: squash(-Math.log(stats.fuel / ref.fuel) / 0.3),
    comfort: pts(stats.comfort, ref.comfort),
    handling: pts(stats.handling, ref.handling),
    safety: pts(stats.safety, ref.safety),
    reliability: pts(reliabilityOverride ?? stats.reliability, ref.reliability),
    prestige: pts(stats.prestige, ref.prestige),
    practicality: pts(stats.practicality, ref.practicality),
  };
}

export interface EraMods {
  weights: Partial<Record<AttrKey, number>>;
  priceSens: number;
}

/** Historical shifts in taste (Depression thrift, the 1950s horsepower race, Suez fuel scare). */
export function eraMods(market: MarketId, yearFloat: number): EraMods {
  const w: Partial<Record<AttrKey, number>> = {};
  let priceSens = 1;
  if (yearFloat >= 1930 && yearFloat < 1936) priceSens *= 1.4;
  if (yearFloat >= 1946 && yearFloat < 1950) priceSens *= 0.85; // sellers' market after the war
  if (market === 'usa' && yearFloat >= 1950) {
    w.accel = 1.3;
    w.topSpeed = 1.2;
    w.prestige = 1.2;
  }
  if (market === 'europe' && yearFloat >= 1946 && yearFloat < 1951) w.economy = 1.4;
  if (market === 'europe' && yearFloat >= 1956.8 && yearFloat < 1958) w.economy = 1.8;
  return { weights: w, priceSens };
}

export function segmentWeights(segment: SegmentId, market: MarketId, yearFloat: number): Record<AttrKey, number> {
  const base = segmentDef(segment).weights;
  const taste = MARKET_TASTE[market];
  const mods = eraMods(market, yearFloat).weights;
  const out = {} as Record<AttrKey, number>;
  let total = 0;
  for (const k of ATTRS) {
    out[k] = base[k] * (taste[k] ?? 1) * (mods[k] ?? 1);
    total += out[k];
  }
  for (const k of ATTRS) out[k] /= total;
  return out;
}

export function appeal(scores: Scores, segment: SegmentId, market: MarketId, yearFloat: number): number {
  const w = segmentWeights(segment, market, yearFloat);
  let a = 0;
  for (const k of ATTRS) a += w[k] * scores[k];
  return a;
}
