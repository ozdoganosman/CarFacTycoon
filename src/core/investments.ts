import { costIndex } from '../data/economy';
import { ENGINEERING_LEVELS, ENGINEERING_UPKEEP, MIN_PLANT, SUPPLIER_PLANTS, type EngineeringLevel, type SupplierPlant, type SupplierPlantId } from '../data/investments';
import { t } from '../i18n';
import { fmtPercent } from '../i18n/format';
import { yearFloat } from './time';
import type { GameState } from './types';
import { decide, log, money, num, spend } from './util';

// A grown company's engineering and its own suppliers (data/investments.ts).
//
// A big maker's car takes more engineering than a workshop's: tooling for high volume, more variants,
// suppliers to coordinate, manuals for thousands of dealers. The work a new car needs grows with the
// company's yearly sales; the engineering organisation decides how many engineers can work on it at
// once. Its supplier plants make the material of every car cheaper, at a volume that pays for them.

type Result = { ok: true } | { ok: false; error: string };

/** Cars the company sold a year, over its last two years: its size. */
export function annualUnits(s: GameState): number {
  const ys = s.years.slice(-2);
  return ys.length ? ys.reduce((a, y) => a + y.unitsSold, 0) / ys.length : 0;
}

/**
 * How much more engineering a new car needs at the company's size: none for a workshop, about half
 * again at 20,000 cars a year, more than twice at 100,000 and three times at a million.
 */
export const devWorkScale = (units: number) => 1 + 0.8 * Math.log10(1 + Math.max(0, units) / 2000);

export const companyWorkScale = (s: GameState) => devWorkScale(annualUnits(s));

export const engineeringLevel = (s: GameState): EngineeringLevel => ENGINEERING_LEVELS[Math.min(ENGINEERING_LEVELS.length - 1, s.engineering ?? 0)];

/** At most how many engineers' work one team turns out (see teamOutput). */
export const teamSpan = (s: GameState) => engineeringLevel(s).span;

/** The next level of the engineering organisation, if there is one. */
export const nextEngineering = (s: GameState): EngineeringLevel | undefined => ENGINEERING_LEVELS[(s.engineering ?? 0) + 1];

export const engineeringCost = (lv: EngineeringLevel, yf: number) => lv.cost * costIndex(yf);

export function buildEngineering(s: GameState): Result {
  const yf = yearFloat(s.week);
  const next = nextEngineering(s);
  if (!next) return { ok: false, error: t('Mühendislik teşkilatı en üst düzeyde.') };
  if (next.year > yf) return { ok: false, error: t('{name} {year} yılından itibaren kurulabilir.', { name: t(next.name), year: next.year }) };
  const cost = engineeringCost(next, yf);
  if (s.company.cash < cost) return { ok: false, error: t('{name} için {cost} gerekiyor.', { name: t(next.name), cost: money(cost) }) };
  spend(s, cost, 'investment');
  s.engineering = next.level;
  log(s, t('{name} kuruldu: bir projede {span} mühendisin işi birden yürüyebilir.', { name: t(next.name), span: next.span }), 'good');
  decide(s, 'engineering', `${next.name} kuruldu (${money(cost)})`);
  return { ok: true };
}

/** The engineering buildings' running cost a week (staff, power, the proving ground's upkeep). */
export function engineeringUpkeep(s: GameState, yf = yearFloat(s.week)): number {
  const built = ENGINEERING_LEVELS.slice(1, (s.engineering ?? 0) + 1);
  return (built.reduce((a, lv) => a + lv.cost, 0) * costIndex(yf) * ENGINEERING_UPKEEP) / 52;
}

/** Cars sold over the last 52 weeks (the same weeks as the material bought: what the plants are measured against). */
export function recentUnits(s: GameState): number {
  // Material costs ask for it for every car: summed again only when the week or a model's latest sales change.
  const key = `${s.week}|${s.models.map((m) => {
    const last = m.history[m.history.length - 1];
    return last ? `${m.history.length}:${last.week}:${last.sold}` : '0';
  }).join('|')}`;
  const hit = unitsCache.get(s);
  if (hit && hit.key === key) return hit.units;
  const from = s.week - 52;
  const units = s.models.reduce((a, m) => a + m.history.reduce((b, h) => b + (h.week > from ? h.sold : 0), 0), 0);
  unitsCache.set(s, { key, units });
  return units;
}
const unitsCache = new WeakMap<GameState, { key: string; units: number }>();

export const plantCapacity = (s: GameState, id: SupplierPlantId) => s.plants?.[id] ?? 0;
export const ownsPlant = (s: GameState, id: SupplierPlantId) => plantCapacity(s, id) > 0;

/** The share of the company's cars a plant supplies (all of them while it sells fewer than it can make). */
export function plantCoverage(s: GameState, id: SupplierPlantId): number {
  const cap = plantCapacity(s, id);
  if (cap <= 0) return 0;
  const units = recentUnits(s);
  return units > 0 ? Math.min(1, cap / units) : 1;
}

/** The share of the material cost the company's own plants save. */
export const plantCut = (s: GameState) => (s.plants ? SUPPLIER_PLANTS.reduce((a, p) => a + p.cut * plantCoverage(s, p.id), 0) : 0);

/** Material bought over the last year, before what the company's own plants already save. */
export function yearlyMaterial(s: GameState): number {
  const paid = s.finance.slice(-52).reduce((a, f) => a + f.materials, 0);
  return paid / Math.max(0.5, 1 - plantCut(s));
}

/** The capacity a plant is built or grown to: the cars sold a year with a quarter to spare, at least MIN_PLANT. */
export const plantTarget = (s: GameState) => Math.max(MIN_PLANT, Math.ceil((recentUnits(s) * 1.25) / 1000) * 1000);

export interface PlantStep {
  /** Capacity after the step, cars a year. */
  to: number;
  cost: number;
  /** What it adds to the yearly saving at the present output. */
  saving: number;
  /** Years it takes to pay for itself (Infinity with no cars built). */
  payback: number;
}

/** Building the plant, or growing it to the company's size; null when it already supplies every car. */
export function plantStep(s: GameState, p: SupplierPlant, yf = yearFloat(s.week)): PlantStep | null {
  const now = plantCapacity(s, p.id);
  const units = recentUnits(s);
  if (now > 0 && now >= units) return null;
  const to = Math.max(now, plantTarget(s));
  const cost = p.costPerCar * costIndex(yf) * (to - now);
  const perCar = units > 0 ? yearlyMaterial(s) / units : 0;
  const saving = p.cut * perCar * (Math.min(units, to) - Math.min(units, now));
  return { to, cost, saving, payback: saving > 0 ? cost / saving : Infinity };
}

/** What a plant saves a year at the present output. */
export function plantSaving(s: GameState, p: SupplierPlant): number {
  const units = recentUnits(s);
  return units > 0 ? p.cut * (yearlyMaterial(s) / units) * Math.min(units, plantCapacity(s, p.id)) : 0;
}

/** Build the plant, or grow it to the company's present size (see plantStep). */
export function buildPlant(s: GameState, id: SupplierPlantId): Result {
  const yf = yearFloat(s.week);
  const p = SUPPLIER_PLANTS.find((x) => x.id === id);
  if (!p) return { ok: false, error: t('Böyle bir fabrika yok.') };
  if (p.year > yf) return { ok: false, error: t('{name} {year} yılından itibaren kurulabilir.', { name: t(p.name), year: p.year }) };
  const step = plantStep(s, p, yf);
  if (!step) return { ok: false, error: t('{name} bütün arabalarına yetiyor.', { name: t(p.name) }) };
  if (s.company.cash < step.cost) return { ok: false, error: t('{name} için {cost} gerekiyor.', { name: t(p.name), cost: money(step.cost) }) };
  const grown = ownsPlant(s, id);
  spend(s, step.cost, 'investment');
  (s.plants ??= {})[id] = step.to;
  log(
    s,
    grown
      ? t('{name} büyütüldü: yılda {count} arabaya yetiyor.', { name: t(p.name), count: num(step.to) })
      : t('{name} kuruldu: yılda {count} arabanın malzemesi {cut} ucuzladı.', { name: t(p.name), count: num(step.to), cut: fmtPercent(p.cut, 1) }),
    'good',
  );
  decide(s, 'plant:' + id, `${p.name}: ${step.to} araç/yıl (${money(step.cost)})`);
  return { ok: true };
}

/** What the engineering buildings and the plants are worth in the books: half of what they would cost today. */
export function investmentsValue(s: GameState, yf = yearFloat(s.week)): number {
  const eng = ENGINEERING_LEVELS.slice(1, (s.engineering ?? 0) + 1).reduce((a, lv) => a + lv.cost, 0);
  const plants = SUPPLIER_PLANTS.reduce((a, p) => a + p.costPerCar * plantCapacity(s, p.id), 0);
  return 0.5 * (eng + plants) * costIndex(yf);
}
