import { costIndex } from '../data/economy';
import { poisson, type Rng } from './rng';
import type {
  CarStats,
  ComponentKey,
  Defect,
  DefectArea,
  Severity,
  SupplierChoice,
  TestId,
} from './types';

// Latent defects are created when development ends. Testing finds (and fixes) them;
// whatever is left over shows up later in customers' hands.

export interface TestDef {
  id: TestId;
  name: string;
  year: number;
  desc: string;
  costPerWeek: number; // 1900 dollars
  rates: Partial<Record<DefectArea, number>>;
  criticalBoost: number;
}

export const TESTS: TestDef[] = [
  {
    id: 'dyno',
    name: 'Dinamometre',
    year: 1900,
    desc: 'Motor ve şanzıman test standında saatlerce tam yükte çalıştırılır.',
    costPerWeek: 30,
    rates: { engine: 0.14, gearbox: 0.09 },
    criticalBoost: 1,
  },
  {
    id: 'road',
    name: 'Yol testi',
    year: 1900,
    desc: 'Prototip her türlü yolda binlerce kilometre sürülür.',
    costPerWeek: 50,
    rates: { chassis: 0.09, gearbox: 0.06, electrics: 0.08, brakes: 0.08, body: 0.05, engine: 0.04 },
    criticalBoost: 1,
  },
  {
    id: 'crash',
    name: 'Çarpışma testi',
    year: 1934,
    desc: 'Prototipler duvara çarptırılır; gövde, şasi ve frenler incelenir.',
    costPerWeek: 150,
    rates: { body: 0.16, chassis: 0.1, brakes: 0.05 },
    criticalBoost: 1.3,
  },
  {
    id: 'durability',
    name: 'Dayanıklılık',
    year: 1900,
    desc: 'Prototip gece gündüz aylarca yorulur. Yavaş ama sinsi arızaları bulur.',
    costPerWeek: 40,
    rates: { engine: 0.045, gearbox: 0.045, chassis: 0.045, electrics: 0.045, brakes: 0.045, body: 0.045 },
    criticalBoost: 1.8,
  },
];

export const AREA_NAMES: Record<DefectArea, string> = {
  engine: 'Motor',
  gearbox: 'Şanzıman',
  chassis: 'Şasi / süspansiyon',
  electrics: 'Elektrik',
  brakes: 'Frenler',
  body: 'Gövde',
};

export const SEVERITY_NAMES: Record<Severity, string> = {
  minor: 'Küçük',
  major: 'Ciddi',
  critical: 'Kritik',
};

const AREA_SHARE: Record<DefectArea, number> = {
  engine: 0.25,
  gearbox: 0.12,
  chassis: 0.18,
  electrics: 0.12,
  brakes: 0.13,
  body: 0.2,
};
const SEVERITY_SHARE: Record<Severity, number> = { minor: 0.55, major: 0.32, critical: 0.13 };
const SEVERITY_VISIBILITY: Record<Severity, number> = { minor: 0.8, major: 1, critical: 1.25 };

export function expectedDefects(stats: CarStats, skill: number): number {
  return (2 + 3.5 * stats.complexity) * (1.35 - skill / 100) * (1 + Math.max(0, 60 - stats.reliability) / 40);
}

function pickWeighted<K extends string>(rng: Rng, weights: Record<K, number>): K {
  const keys = Object.keys(weights) as K[];
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let r = rng() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

export function generateDefects(lambda: number, rng: Rng, idPrefix: string): Defect[] {
  const n = poisson(rng, lambda);
  const out: Defect[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `${idPrefix}-d${i}`,
      area: pickWeighted(rng, AREA_SHARE),
      severity: pickWeighted(rng, SEVERITY_SHARE),
      found: false,
    });
  }
  return out;
}

export function detectionChance(test: TestDef, area: DefectArea, severity: Severity): number {
  const base = test.rates[area] ?? 0;
  const sev = SEVERITY_VISIBILITY[severity] * (severity === 'critical' ? test.criticalBoost : 1);
  return Math.min(0.9, base * sev);
}

/** Expected number of defects still hidden, given only the prior and the test plan (no peeking). */
export function expectedRemaining(prior: number, weeks: Record<TestId, number>): number {
  let total = 0;
  for (const area of Object.keys(AREA_SHARE) as DefectArea[]) {
    for (const sev of Object.keys(SEVERITY_SHARE) as Severity[]) {
      let survive = 1;
      for (const t of TESTS) survive *= Math.pow(1 - detectionChance(t, area, sev), weeks[t.id] ?? 0);
      total += prior * AREA_SHARE[area] * SEVERITY_SHARE[sev] * survive;
    }
  }
  return total;
}

export function riskLabel(expected: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (expected < 1) return { label: 'Düşük', tone: 'good' };
  if (expected < 2.5) return { label: 'Orta', tone: 'warn' };
  return { label: 'Yüksek', tone: 'bad' };
}

export const fixCost = (sev: Severity, year: number) => ({ minor: 80, major: 250, critical: 600 })[sev] * costIndex(year);

const DEFECT_RELIABILITY: Record<Severity, number> = { minor: 1.5, major: 5, critical: 8 };

/** Rivals also ship with a few hidden flaws: this is the industry's average reliability loss from them. */
export const INDUSTRY_RESIDUAL_DEFECTS = 4;

export const COMPONENT_AREA: Record<ComponentKey, DefectArea> = {
  engine: 'engine',
  gearbox: 'gearbox',
  electrics: 'electrics',
};

export interface SupplierDef {
  id: SupplierChoice;
  name: string;
  desc: string;
  costMult: number;
  leadWeeks: number;
}

export const SUPPLIERS: SupplierDef[] = [
  { id: 'inhouse', name: 'Kendin üret', desc: 'Atölye yatırımı gerekir. Ucuz; kalite mühendislik becerine bağlı.', costMult: 0.85, leadWeeks: 0 },
  { id: 'cheap', name: 'Ucuz tedarikçi', desc: 'En düşük fiyat, kısa teslim. Kalite kontrolü zayıf: geri çağırma riski.', costMult: 0.8, leadWeeks: 3 },
  { id: 'quality', name: 'Kaliteli tedarikçi', desc: 'Pahalı ve teslimi uzun, ama parçalar sağlam.', costMult: 1.12, leadWeeks: 8 },
];

export function supplierReliability(choice: SupplierChoice, skill: number): number {
  if (choice === 'cheap') return -3;
  if (choice === 'quality') return 1;
  return (skill - 50) / 15;
}

export function supplierFailureMult(choice: SupplierChoice, skill: number): number {
  if (choice === 'cheap') return 1.8;
  if (choice === 'quality') return 0.6;
  return 1.4 - skill / 100;
}

/** Real reliability once hidden defects and part quality are counted. */
export function actualReliability(
  designReliability: number,
  defects: Defect[],
  suppliers: Record<ComponentKey, SupplierChoice>,
  skill: number,
): number {
  const hidden = defects.filter((d) => !d.found && !d.fixed);
  const penalty = hidden.reduce((s, d) => s + DEFECT_RELIABILITY[d.severity], 0);
  const parts = (Object.keys(suppliers) as ComponentKey[]).reduce((s, k) => s + supplierReliability(suppliers[k], skill), 0);
  return designReliability - penalty + parts;
}

/** Weekly failure probability per car in the field. */
export function failureRate(
  reliabilityScore: number,
  defects: Defect[],
  suppliers: Record<ComponentKey, SupplierChoice>,
  skill: number,
): number {
  let r = 0.0006 * (1 + Math.max(-0.6, (55 - reliabilityScore) / 40));
  for (const d of defects) {
    if (d.found || d.fixed) continue;
    const comp = (Object.keys(COMPONENT_AREA) as ComponentKey[]).find((k) => COMPONENT_AREA[k] === d.area);
    const mult = comp ? supplierFailureMult(suppliers[comp], skill) : 1;
    r += { minor: 0.0003, major: 0.0008, critical: 0.0005 }[d.severity] * mult;
  }
  return r;
}
