import type { SegmentId } from '../core/types';
import { msg } from '../i18n';

// The 48 states (the District of Columbia counts with Maryland; Alaska and Hawaii only
// joined in 1959 and are left out). Where a car can be sold, and how many.

export type StateId =
  | 'AL' | 'AZ' | 'AR' | 'CA' | 'CO' | 'CT' | 'DE' | 'FL' | 'GA' | 'ID' | 'IL' | 'IN' | 'IA' | 'KS' | 'KY' | 'LA'
  | 'ME' | 'MD' | 'MA' | 'MI' | 'MN' | 'MS' | 'MO' | 'MT' | 'NE' | 'NV' | 'NH' | 'NJ' | 'NM' | 'NY' | 'NC' | 'ND'
  | 'OH' | 'OK' | 'OR' | 'PA' | 'RI' | 'SC' | 'SD' | 'TN' | 'TX' | 'UT' | 'VT' | 'VA' | 'WA' | 'WV' | 'WI' | 'WY';

export type RegionId = 'newEngland' | 'mideast' | 'greatLakes' | 'plains' | 'southeast' | 'southwest' | 'rockies' | 'farWest';

export interface StateDef {
  id: StateId;
  name: string;
  region: RegionId;
  /** Census population in thousands: 1900, 1910 … 1960. */
  pop: [number, number, number, number, number, number, number];
  /** Admitted to the Union (before that a territory, still open to trade). */
  statehood?: number;
}

const S = (id: StateId, name: string, region: RegionId, pop: StateDef['pop'], statehood?: number): StateDef => ({ id, name, region, pop, statehood });

export const STATES: StateDef[] = [
  S('AL', 'Alabama', 'southeast', [1829, 2138, 2348, 2646, 2833, 3062, 3267]),
  S('AZ', 'Arizona', 'southwest', [123, 204, 334, 436, 499, 750, 1302], 1912),
  S('AR', 'Arkansas', 'southeast', [1312, 1574, 1752, 1854, 1949, 1910, 1786]),
  S('CA', 'California', 'farWest', [1485, 2378, 3427, 5677, 6907, 10586, 15717]),
  S('CO', 'Colorado', 'rockies', [540, 799, 940, 1036, 1123, 1325, 1754]),
  S('CT', 'Connecticut', 'newEngland', [908, 1115, 1381, 1607, 1709, 2007, 2535]),
  S('DE', 'Delaware', 'mideast', [185, 202, 223, 238, 267, 318, 446]),
  S('FL', 'Florida', 'southeast', [529, 753, 968, 1468, 1897, 2771, 4952]),
  S('GA', 'Georgia', 'southeast', [2216, 2609, 2896, 2909, 3124, 3445, 3943]),
  S('ID', 'Idaho', 'rockies', [162, 326, 432, 445, 525, 589, 667]),
  S('IL', 'Illinois', 'greatLakes', [4822, 5639, 6485, 7631, 7897, 8712, 10081]),
  S('IN', 'Indiana', 'greatLakes', [2516, 2701, 2930, 3239, 3428, 3934, 4662]),
  S('IA', 'Iowa', 'plains', [2232, 2225, 2404, 2471, 2538, 2621, 2758]),
  S('KS', 'Kansas', 'plains', [1470, 1691, 1769, 1881, 1801, 1905, 2179]),
  S('KY', 'Kentucky', 'southeast', [2147, 2290, 2417, 2615, 2846, 2945, 3038]),
  S('LA', 'Louisiana', 'southeast', [1382, 1656, 1799, 2102, 2364, 2684, 3257]),
  S('ME', 'Maine', 'newEngland', [694, 742, 768, 797, 847, 914, 969]),
  S('MD', 'Maryland', 'mideast', [1467, 1626, 1888, 2119, 2484, 3145, 3865]),
  S('MA', 'Massachusetts', 'newEngland', [2805, 3366, 3852, 4250, 4317, 4691, 5149]),
  S('MI', 'Michigan', 'greatLakes', [2421, 2810, 3668, 4842, 5256, 6372, 7823]),
  S('MN', 'Minnesota', 'plains', [1751, 2076, 2387, 2564, 2792, 2982, 3414]),
  S('MS', 'Mississippi', 'southeast', [1551, 1797, 1791, 2010, 2184, 2179, 2178]),
  S('MO', 'Missouri', 'plains', [3107, 3293, 3404, 3629, 3785, 3955, 4320]),
  S('MT', 'Montana', 'rockies', [243, 376, 549, 538, 559, 591, 675]),
  S('NE', 'Nebraska', 'plains', [1066, 1192, 1296, 1378, 1316, 1326, 1411]),
  S('NV', 'Nevada', 'farWest', [42, 82, 77, 91, 110, 160, 285]),
  S('NH', 'New Hampshire', 'newEngland', [412, 431, 443, 465, 492, 533, 607]),
  S('NJ', 'New Jersey', 'mideast', [1884, 2537, 3156, 4041, 4160, 4835, 6067]),
  S('NM', 'New Mexico', 'southwest', [195, 327, 360, 423, 532, 681, 951], 1912),
  S('NY', 'New York', 'mideast', [7269, 9114, 10385, 12588, 13479, 14830, 16782]),
  S('NC', 'North Carolina', 'southeast', [1894, 2206, 2559, 3170, 3572, 4062, 4556]),
  S('ND', 'North Dakota', 'plains', [319, 577, 647, 681, 642, 620, 632]),
  S('OH', 'Ohio', 'greatLakes', [4158, 4767, 5759, 6647, 6908, 7947, 9706]),
  S('OK', 'Oklahoma', 'southwest', [790, 1657, 2028, 2396, 2336, 2233, 2328], 1907),
  S('OR', 'Oregon', 'farWest', [414, 673, 783, 954, 1090, 1521, 1769]),
  S('PA', 'Pennsylvania', 'mideast', [6302, 7665, 8720, 9631, 9900, 10498, 11319]),
  S('RI', 'Rhode Island', 'newEngland', [429, 543, 604, 687, 713, 792, 859]),
  S('SC', 'South Carolina', 'southeast', [1340, 1515, 1684, 1739, 1900, 2117, 2383]),
  S('SD', 'South Dakota', 'plains', [402, 584, 637, 693, 643, 653, 681]),
  S('TN', 'Tennessee', 'southeast', [2021, 2185, 2338, 2617, 2916, 3292, 3567]),
  S('TX', 'Texas', 'southwest', [3049, 3897, 4663, 5825, 6415, 7711, 9580]),
  S('UT', 'Utah', 'rockies', [277, 373, 449, 508, 550, 689, 891]),
  S('VT', 'Vermont', 'newEngland', [344, 356, 352, 360, 359, 378, 390]),
  S('VA', 'Virginia', 'southeast', [1854, 2062, 2309, 2422, 2678, 3319, 3967]),
  S('WA', 'Washington', 'farWest', [518, 1142, 1357, 1563, 1736, 2379, 2853]),
  S('WV', 'West Virginia', 'southeast', [959, 1221, 1464, 1729, 1902, 2006, 1860]),
  S('WI', 'Wisconsin', 'greatLakes', [2069, 2334, 2632, 2939, 3138, 3435, 3952]),
  S('WY', 'Wyoming', 'rockies', [93, 146, 194, 226, 251, 291, 330]),
];

export const STATE_IDS = STATES.map((s) => s.id);
const BY_ID = Object.fromEntries(STATES.map((s) => [s.id, s])) as Record<StateId, StateDef>;
export const stateDef = (id: StateId) => BY_ID[id];

export const REGION_NAMES: Record<RegionId, string> = {
  newEngland: msg('Yeni İngiltere'),
  mideast: msg('Doğu Kıyısı'),
  greatLakes: msg('Büyük Göller'),
  plains: msg('Ovalar'),
  southeast: msg('Güney'),
  southwest: msg('Güneybatı'),
  rockies: msg('Kayalık Dağlar'),
  farWest: msg('Batı Kıyısı'),
};

/**
 * Income per head against the national average (1900, 1930, 1960): the old East and the
 * mining and gold West were rich, the South poor; the gaps narrowed over the century.
 */
const INCOME: Record<RegionId, [number, number, number]> = {
  newEngland: [1.3, 1.25, 1.1],
  mideast: [1.35, 1.35, 1.15],
  greatLakes: [1.05, 1.1, 1.05],
  plains: [0.85, 0.8, 0.92],
  southeast: [0.5, 0.55, 0.75],
  southwest: [0.65, 0.7, 0.88],
  rockies: [1.15, 0.9, 0.95],
  farWest: [1.45, 1.25, 1.15],
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Population (thousands) in a (fractional) year, between census counts. */
export function statePop(id: StateId, yf: number): number {
  const p = BY_ID[id].pop;
  const t = Math.max(0, Math.min(6, (yf - 1900) / 10));
  const i = Math.min(5, Math.floor(t));
  return lerp(p[i], p[i + 1], t - i);
}

export function stateIncome(id: StateId, yf: number): number {
  const r = INCOME[BY_ID[id].region];
  const t = Math.max(0, Math.min(2, (yf - 1900) / 30));
  return t <= 1 ? lerp(r[0], r[1], t) : lerp(r[1], r[2], t - 1);
}

/**
 * How strongly car buying follows income: in 1900 the car was a rich man's toy, by the
 * 1950s nearly every family could have one.
 */
const incomeElasticity = (yf: number) => lerp(2.2, 1.1, Math.max(0, Math.min(1, (yf - 1900) / 50)));

/** The farm-car years: on the plains and around the lakes a cheap car replaced the horse first. */
function farmBoost(region: RegionId, yf: number): number {
  if (region !== 'plains' && region !== 'greatLakes' && region !== 'farWest') return 1;
  if (yf < 1908 || yf > 1940) return 1;
  const peak = yf < 1920 ? (yf - 1908) / 12 : 1 - (yf - 1920) / 20;
  return 1 + 0.35 * peak;
}

/** What a region buys more (or less) of, against the national mix. */
const SEGMENT_TILT: Partial<Record<RegionId, Partial<Record<SegmentId, number>>>> = {
  newEngland: { luxury: 1.3, sport: 1.15, pickup: 0.7 },
  mideast: { luxury: 1.35, sport: 1.1, pickup: 0.7, city: 1.1 },
  plains: { pickup: 1.6, family: 1.1, luxury: 0.6, sport: 0.7 },
  southeast: { pickup: 1.3, luxury: 0.7 },
  southwest: { pickup: 1.5, suv: 1.3, luxury: 0.8 },
  rockies: { pickup: 1.4, suv: 1.8, luxury: 0.7, city: 0.8 },
  farWest: { sport: 1.3, luxury: 1.1 },
};

/** Each state's weight in the country's car buying (sums to 1 across states). */
export function stateWeights(yf: number): Record<StateId, number> {
  const e = incomeElasticity(yf);
  const w = {} as Record<StateId, number>;
  let sum = 0;
  for (const s of STATES) {
    w[s.id] = statePop(s.id, yf) * Math.pow(stateIncome(s.id, yf), e) * farmBoost(s.region, yf);
    sum += w[s.id];
  }
  for (const id of STATE_IDS) w[id] /= sum;
  return w;
}

/**
 * A state's share of one class's buyers: its weight, tilted by what the region likes,
 * renormalised so the classes still add up nationally.
 */
export function stateSegmentWeights(yf: number, segment: SegmentId): Record<StateId, number> {
  const base = stateWeights(yf);
  const w = {} as Record<StateId, number>;
  let sum = 0;
  for (const s of STATES) {
    w[s.id] = base[s.id] * (SEGMENT_TILT[s.region]?.[segment] ?? 1);
    sum += w[s.id];
  }
  for (const id of STATE_IDS) w[id] /= sum;
  return w;
}
