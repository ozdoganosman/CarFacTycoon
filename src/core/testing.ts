import { costIndex } from '../data/economy';
import { poisson, type Rng } from './rng';
import type {
  CarStats,
  DevBonus,
  ComponentKey,
  Defect,
  DefectArea,
  Severity,
  SupplierChoice,
  TestId,
} from './types';
import { msg, t } from '../i18n';

// Latent defects are created when development ends. Testing finds (and fixes) them;
// whatever is left over shows up later in customers' hands.

export interface TestDef {
  id: TestId;
  name: string;
  year: number;
  desc: string;
  /** Crew, fuel and test bench per week (1900 dollars). */
  costPerWeek: number;
  /** Prototype wear per week as a share of the car's unit cost (crash tests use up whole cars). */
  protoShare: number;
  rates: Partial<Record<DefectArea, number>>;
  criticalBoost: number;
}

export const TESTS: TestDef[] = [
  {
    id: 'dyno',
    name: msg('Dinamometre'),
    year: 1900,
    desc: msg('Motor ve şanzıman test standında saatlerce tam yükte çalıştırılır.'),
    protoShare: 0.15,
    costPerWeek: 25,
    rates: { engine: 0.14, gearbox: 0.09 },
    criticalBoost: 1,
  },
  {
    id: 'road',
    name: msg('Yol testi'),
    year: 1900,
    desc: msg('Prototip her türlü yolda binlerce kilometre sürülür.'),
    protoShare: 0.26,
    costPerWeek: 40,
    rates: { chassis: 0.09, gearbox: 0.06, electrics: 0.08, brakes: 0.08, body: 0.05, engine: 0.04 },
    criticalBoost: 1,
  },
  {
    id: 'crash',
    name: msg('Çarpışma testi'),
    year: 1934,
    desc: msg('Prototipler duvara çarptırılır; gövde, şasi ve frenler incelenir.'),
    protoShare: 1.2,
    costPerWeek: 150,
    rates: { body: 0.16, chassis: 0.1, brakes: 0.05 },
    criticalBoost: 1.3,
  },
  {
    id: 'durability',
    name: msg('Dayanıklılık'),
    year: 1900,
    desc: msg('Prototip gece gündüz aylarca yorulur. Yavaş ama sinsi arızaları bulur.'),
    protoShare: 0.22,
    costPerWeek: 32,
    rates: { engine: 0.045, gearbox: 0.045, chassis: 0.045, electrics: 0.045, brakes: 0.045, body: 0.045 },
    criticalBoost: 1.8,
  },
];

export const AREA_NAMES: Record<DefectArea, string> = {
  engine: msg('Motor'),
  gearbox: msg('Şanzıman'),
  chassis: msg('Şasi / süspansiyon'),
  electrics: msg('Elektrik'),
  brakes: msg('Frenler'),
  body: msg('Gövde'),
};

export const SEVERITY_NAMES: Record<Severity, string> = {
  minor: msg('Küçük'),
  major: msg('Ciddi'),
  critical: msg('Kritik'),
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

/**
 * Latent defects a design comes out of development with. A company building
 * its first cars makes many more mistakes; each launch teaches it.
 */
export function expectedDefects(stats: CarStats, skill: number, modelsLaunched = 3): number {
  const novice = 1 + 1.0 * Math.exp(-modelsLaunched / 1.5);
  return (2 + 3.5 * stats.complexity) * (1.35 - skill / 100) * (1 + Math.max(0, 60 - stats.reliability) / 40) * novice;
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

/**
 * Some flaws only show after tens of thousands of kilometres in every kind of
 * weather and hand: prototypes almost never meet them, so even the longest
 * test programme lets a few through.
 */
export const STUBBORN_SHARE = 0.15;
const STUBBORN_VISIBILITY = 0.12;

export function generateDefects(lambda: number, rng: Rng, idPrefix: string): Defect[] {
  const n = poisson(rng, lambda);
  const out: Defect[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `${idPrefix}-d${i}`,
      area: pickWeighted(rng, AREA_SHARE),
      severity: pickWeighted(rng, SEVERITY_SHARE),
      found: false,
      stubborn: rng() < STUBBORN_SHARE || undefined,
    });
  }
  return out;
}

export function detectionChance(test: TestDef, area: DefectArea, severity: Severity, stubborn = false): number {
  const base = test.rates[area] ?? 0;
  const sev = SEVERITY_VISIBILITY[severity] * (severity === 'critical' ? test.criticalBoost : 1);
  return Math.min(0.9, base * sev) * (stubborn ? STUBBORN_VISIBILITY : 1);
}

/** What a week of a test costs for a car with this unit cost (1900 dollars). */
export function testWeekCost(test: TestDef, unitCost1900: number, year: number): number {
  return (test.costPerWeek + test.protoShare * unitCost1900) * costIndex(year);
}

/** Expected number of defects still hidden, given only the prior and the test plan (no peeking). */
export function expectedRemaining(prior: number, weeks: Record<TestId, number>): number {
  let total = 0;
  for (const area of Object.keys(AREA_SHARE) as DefectArea[]) {
    for (const sev of Object.keys(SEVERITY_SHARE) as Severity[]) {
      for (const stubborn of [false, true]) {
        let survive = 1;
        for (const t of TESTS) survive *= Math.pow(1 - detectionChance(t, area, sev, stubborn), weeks[t.id] ?? 0);
        total += prior * AREA_SHARE[area] * SEVERITY_SHARE[sev] * (stubborn ? STUBBORN_SHARE : 1 - STUBBORN_SHARE) * survive;
      }
    }
  }
  return total;
}

/** How risky the hidden defects are, in the player's language. */
export function riskLabel(expected: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (expected < 1) return { label: t('Düşük'), tone: 'good' };
  if (expected < 2.5) return { label: t('Orta'), tone: 'warn' };
  return { label: t('Yüksek'), tone: 'bad' };
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
  { id: 'inhouse', name: msg('Kendin üret'), desc: msg('Atölye yatırımı gerekir. Ucuz; kalite mühendislik becerine bağlı.'), costMult: 0.85, leadWeeks: 0 },
  { id: 'cheap', name: msg('Ucuz tedarikçi'), desc: msg('En düşük fiyat, kısa teslim. Kalite kontrolü zayıf: geri çağırma riski.'), costMult: 0.8, leadWeeks: 3 },
  { id: 'quality', name: msg('Kaliteli tedarikçi'), desc: msg('Pahalı ve teslimi uzun, ama parçalar sağlam.'), costMult: 1.12, leadWeeks: 8 },
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

// ---------------- What a defect is ----------------

const DEFECT_TEXTS: Record<DefectArea, Record<Severity, string[]>> = {
  engine: {
    minor: [msg('Rölanti düzensiz'), msg('Yağ keçesi sızdırıyor'), msg('Karbüratör ayarı kayıyor'), msg('Egzoz manifoldu çatırdıyor')],
    major: [msg('Silindir kapağı contası üflüyor'), msg('Supaplar erken yanıyor'), msg('Motor tırmanışta aşırı ısınıyor'), msg('Su pompası sızdırıyor')],
    critical: [msg('Krank mili yatağı eriyor'), msg('Biyel kolu kırılıyor'), msg('Motor bloğu soğukta çatlıyor')],
  },
  gearbox: {
    minor: [msg('Vites geçişleri sert'), msg('Şanzıman uğulduyor'), msg('Vites kolu titriyor')],
    major: [msg('İkinci vites boşa atıyor'), msg('Debriyaj kayıyor'), msg('Diferansiyel ısınıp uğulduyor')],
    critical: [msg('Dişliler yük altında kırılıyor'), msg('Aks mili kırılıyor')],
  },
  chassis: {
    minor: [msg('Makaslar gıcırdıyor'), msg('Direksiyon titriyor'), msg('Bijonlar gevşiyor')],
    major: [msg('Makas yaprakları çatlıyor'), msg('Direksiyon boşluğu hızla artıyor'), msg('Rot başları çabuk aşınıyor')],
    critical: [msg('Şasi kaynağı çatlıyor'), msg('Ön aks yerinden oynuyor')],
  },
  electrics: {
    minor: [msg('Farlar sarsıntıda sönüyor'), msg('Korna ara sıra susuyor'), msg('Arka lamba bağlantısı kopuyor')],
    major: [msg('Ateşleme nemli havada tekliyor'), msg('Dinamo aküyü dolduramıyor'), msg('Akü çabuk bitiyor')],
    critical: [msg('Kablo tesisatı ısınıp tutuşuyor'), msg('Ateşleme bobini yolda yanıyor')],
  },
  brakes: {
    minor: [msg('Balatalar gıcırdıyor'), msg('Fren pedalı boşluk yapıyor'), msg('El freni yokuşta tutmuyor')],
    major: [msg('Frenler bir yana çekiyor'), msg('Balatalar çok erken bitiyor'), msg('Kampanalar ısınınca fren zayıflıyor')],
    critical: [msg('Fren çubuğu kopuyor'), msg('Fren kampanası çatlıyor')],
  },
  body: {
    minor: [msg('Kapılar tıkırdıyor'), msg('Boya çabuk çatlıyor'), msg('Çamurluklar titriyor')],
    major: [msg('Gövde yağmurda su alıyor'), msg('Menteşeler sarkıyor'), msg('Kaporta sacı titreşimden çatlıyor')],
    critical: [msg('Kapı kilidi yolda açılıyor'), msg('Gövde bağlantıları şasiden sökülüyor')],
  },
};

/** A defect in words, in the player's language; the same defect always reads the same. */
export function defectText(d: Defect): string {
  const list = DEFECT_TEXTS[d.area][d.severity];
  let h = 0;
  for (const c of d.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return t(list[h % list.length]);
}

/** Rough range for a Poisson count: what "about λ" means in practice. */
export function defectRange(lambda: number): [number, number] {
  const sd = Math.sqrt(Math.max(0, lambda));
  return [Math.max(0, Math.round(lambda - sd)), Math.round(lambda + sd)];
}

// ---------------- What testing teaches the car ----------------

/** Each test also tunes the car; gains flatten out over about ten weeks. */
const TUNING: Record<TestId, Partial<Record<'power' | 'fuel' | 'comfort' | 'handling' | 'safety' | 'reliability', number>>> = {
  dyno: { power: 0.06, fuel: 0.06 },
  road: { comfort: 5, handling: 6 },
  crash: { safety: 8 },
  durability: { reliability: 5 },
};

export interface Tuning {
  power: number;
  fuel: number;
  comfort: number;
  handling: number;
  safety: number;
  reliability: number;
}

export function testTuning(tests: Record<TestId, { done: number }>): Tuning {
  const t: Tuning = { power: 0, fuel: 0, comfort: 0, handling: 0, safety: 0, reliability: 0 };
  for (const [id, gains] of Object.entries(TUNING) as [TestId, Partial<Tuning>][]) {
    const f = 1 - Math.exp(-(tests[id]?.done ?? 0) / 10);
    for (const [k, v] of Object.entries(gains) as [keyof Tuning, number][]) t[k] += v * f;
  }
  return t;
}

export function withTuning(bonus: DevBonus, tests: Record<TestId, { done: number }>): DevBonus {
  const t = testTuning(tests);
  return {
    ...bonus,
    powerMult: bonus.powerMult * (1 + t.power),
    fuelMult: bonus.fuelMult * (1 - t.fuel),
    comfort: bonus.comfort + t.comfort,
    handling: (bonus.handling ?? 0) + t.handling,
    safety: bonus.safety + t.safety,
    reliability: bonus.reliability + t.reliability,
  };
}
