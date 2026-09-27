import type { MarketId, SegmentId } from '../core/types';
import { interp } from './tech';

export interface TaxRule {
  from: number;
  to: number;
  kind: 'racHp' | 'cc';
  /** Tax capitalised into the purchase decision, in 1900 dollars per unit (hp or cc). */
  rate: number;
  label: string;
}

export interface MarketDef {
  id: MarketId;
  name: string;
  flag: string;
  desc: string;
  /** New-car sales per year (historical, rounded). */
  size: [number, number][];
  segmentShare: Record<number, Partial<Record<SegmentId, number>>>;
  tariff: [number, number][]; // import duty for foreign-built cars
  taxes: TaxRule[];
  shipping: number; // 1900 dollars per exported car
}

export const MARKETS: MarketDef[] = [
  {
    id: 'usa',
    name: 'ABD',
    flag: '🇺🇸',
    desc: 'Geniş yollar, ucuz benzin. Büyük motor, hız ve konfor sever. 1910’lardan sonra dünyanın en büyük pazarı.',
    size: [
      [1900, 4000], [1903, 11000], [1905, 24000], [1907, 43000], [1909, 124000], [1910, 181000],
      [1912, 356000], [1914, 548000], [1916, 1500000], [1917, 1750000], [1918, 940000], [1919, 1650000],
      [1920, 1900000], [1921, 1470000], [1923, 3600000], [1925, 3700000], [1926, 3700000], [1927, 2900000],
      [1928, 3800000], [1929, 4450000], [1930, 2800000], [1931, 1900000], [1932, 1100000], [1933, 1560000],
      [1934, 2160000], [1935, 3270000], [1936, 3670000], [1937, 3900000], [1938, 2000000], [1939, 2900000],
      [1940, 3700000], [1941, 3800000], [1942, 220000], [1943, 5000], [1944, 5000], [1945, 70000],
      [1946, 2100000], [1947, 3500000], [1948, 3900000], [1949, 5100000], [1950, 6700000], [1951, 5300000],
      [1952, 4300000], [1953, 6100000], [1954, 5500000], [1955, 7900000], [1956, 5800000], [1957, 6100000],
      [1958, 4300000], [1959, 5600000], [1960, 6700000],
    ],
    segmentShare: {
      1900: { city: 0.25, family: 0.45, sport: 0.08, luxury: 0.22 },
      1910: { city: 0.18, family: 0.52, sport: 0.06, pickup: 0.04, luxury: 0.2 },
      1920: { city: 0.12, family: 0.58, sport: 0.04, pickup: 0.14, luxury: 0.12 },
      1929: { city: 0.1, family: 0.6, sport: 0.03, pickup: 0.15, luxury: 0.12 },
      1933: { city: 0.15, family: 0.62, sport: 0.02, pickup: 0.16, luxury: 0.05 },
      1940: { city: 0.06, family: 0.64, sport: 0.03, pickup: 0.16, luxury: 0.11 },
      1946: { city: 0.05, family: 0.62, sport: 0.03, pickup: 0.16, luxury: 0.11, suv: 0.03 },
      1950: { city: 0.04, family: 0.6, sport: 0.03, pickup: 0.15, luxury: 0.12, suv: 0.06 },
      1960: { city: 0.08, family: 0.55, sport: 0.05, pickup: 0.14, luxury: 0.1, suv: 0.08 },
    },
    tariff: [[1900, 0.45], [1921, 0.45], [1922, 0.25], [1929, 0.25], [1930, 0.1], [1960, 0.1]],
    taxes: [],
    shipping: 70,
  },
  {
    id: 'europe',
    name: 'Avrupa',
    flag: '🇪🇺',
    desc: 'Dar yollar, pahalı benzin, vergiler. Küçük, az yakan ve iyi yol tutan araç sever. İngiltere 1910-1947 arası arabaları silindir çapına göre vergilendirir.',
    size: [
      [1900, 5000], [1905, 20000], [1910, 60000], [1913, 100000], [1914, 80000], [1915, 30000],
      [1918, 20000], [1920, 90000], [1925, 300000], [1929, 450000], [1930, 400000], [1932, 330000],
      [1935, 500000], [1937, 700000], [1938, 650000], [1939, 400000], [1940, 100000], [1942, 20000],
      [1945, 20000], [1946, 150000], [1948, 400000], [1950, 1100000], [1955, 2300000], [1960, 4500000],
    ],
    segmentShare: {
      1900: { city: 0.3, family: 0.35, sport: 0.1, luxury: 0.25 },
      1910: { city: 0.3, family: 0.38, sport: 0.1, pickup: 0.04, luxury: 0.18 },
      1920: { city: 0.38, family: 0.35, sport: 0.08, pickup: 0.09, luxury: 0.1 },
      1929: { city: 0.4, family: 0.36, sport: 0.07, pickup: 0.09, luxury: 0.08 },
      1933: { city: 0.46, family: 0.35, sport: 0.05, pickup: 0.1, luxury: 0.04 },
      1940: { city: 0.42, family: 0.36, sport: 0.06, pickup: 0.1, luxury: 0.06 },
      1946: { city: 0.46, family: 0.34, sport: 0.05, pickup: 0.1, luxury: 0.04, suv: 0.01 },
      1960: { city: 0.45, family: 0.34, sport: 0.07, pickup: 0.07, luxury: 0.05, suv: 0.02 },
    },
    tariff: [[1900, 0.15], [1914, 0.15], [1915, 0.33], [1956, 0.33], [1957, 0.2], [1960, 0.2]],
    taxes: [
      { from: 1910, to: 1947, kind: 'racHp', rate: 14, label: 'Vergi beygiri (RAC): silindir çapı² × silindir sayısı' },
      { from: 1948, to: 1999, kind: 'cc', rate: 0.12, label: 'Motor hacmi vergisi' },
    ],
    shipping: 70,
  },
];

export function marketDef(id: MarketId): MarketDef {
  return MARKETS.find((m) => m.id === id)!;
}

export function marketSize(id: MarketId, year: number): number {
  return interp(marketDef(id).size, year);
}

export function tariff(id: MarketId, year: number): number {
  return interp(marketDef(id).tariff, year);
}

export function segmentShares(id: MarketId, year: number): Record<SegmentId, number> {
  const table = marketDef(id).segmentShare;
  const years = Object.keys(table).map(Number).sort((a, b) => a - b);
  const segs: SegmentId[] = ['city', 'family', 'sport', 'pickup', 'luxury', 'suv'];
  const out = {} as Record<SegmentId, number>;
  for (const s of segs) {
    out[s] = interp(
      years.map((y) => [y, table[y][s] ?? 0] as [number, number]),
      year,
    );
  }
  const total = segs.reduce((a, s) => a + out[s], 0);
  for (const s of segs) out[s] /= total;
  return out;
}

export function activeTax(id: MarketId, year: number): TaxRule | undefined {
  return marketDef(id).taxes.find((t) => year >= t.from && year <= t.to);
}

/** Dealer network coverage by level (share of buyers who can reach you). */
export function dealerCoverage(level: number, isHome: boolean): number {
  if (level <= 0) return isHome ? 0.12 : 0.02;
  return 1 - 0.75 * Math.pow(0.8, level) - 0.03;
}

export const MAX_DEALER_LEVEL = 10;

/** Scale factor for dealer costs: bigger markets need bigger networks. */
export function marketScale(id: MarketId, year: number): number {
  return Math.max(0.5, Math.sqrt(marketSize(id, Math.max(1900, year)) / 10000));
}

/** Share of buyers who still pick one of many tiny makers (industry consolidation over time). */
export const othersMass = (year: number) =>
  interp([[1900, 4.5], [1910, 3.6], [1920, 2.2], [1930, 1.1], [1940, 0.6], [1960, 0.4]], year);
