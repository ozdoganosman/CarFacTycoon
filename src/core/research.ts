import { costIndex } from '../data/economy';
import { KNOWHOW, effectsText } from '../data/knowhow';
import { ASPIRATIONS, CHASSIS, CYLINDER_OPTIONS, FEATURES, FUEL_SYSTEMS, GEARBOX_TYPES, SUSPENSIONS, VALVETRAINS } from '../data/tech';
import { DIESEL_YEAR, boreStrokeFor, displacementCc } from './engine';
import type { CarDesign, GameState } from './types';
import { decide, log, money, pushModal, spend } from './util';

// Research: a technology that has appeared in the world still has to be
// learned before a company can build it. Being first is expensive and slow
// (no suppliers, no trained men, no licences); a few years later the same
// knowledge is cheap. Rivals adopt technology on their own schedule.

export interface ResearchDef {
  id: string;
  name: string;
  category: 'Motor' | 'Şanzıman' | 'Şasi ve süspansiyon' | 'Güvenlik' | 'Donanım';
  year: number;
  desc: string;
  /** Mature price in 1900 dollars, before researchScale. */
  cost: number;
  /** Mature duration in weeks for a team of about ten engineers. */
  weeks: number;
  /** Technologies that must be known first. */
  requires: string[];
  /** Know-how goes into every new design by itself; the rest are options in the designer. */
  passive: boolean;
  /** What it does to a car, in a few words. */
  effects?: string;
}

/** Which technology leads to which (beyond what the data itself says). */
const REQUIRES: Record<string, string[]> = {
  'vt:ohc': ['vt:ohv'],
  'vt:dohc': ['vt:ohc'],
  'cyl:6v': ['cyl:6inline'],
  'cyl:12v': ['cyl:8v'],
  'cyl:16v': ['cyl:12v'],
  'fuel:injection': ['fuel:carb2'],
  'gb:automatic': ['gears:4'],
  'gears:5': ['gears:4'],
  'susp:allind': ['susp:ifs'],
  'chassis:monocoque': ['feat:steelBody'],
  'feat:airCon': ['feat:heater'],
  'feat:radio': ['feat:electricLights'],
};

const COST: Record<string, [number, number]> = {
  'cyl:3inline': [3000, 8],
  'cyl:6inline': [8000, 14],
  'cyl:6v': [12000, 16],
  'cyl:8v': [15000, 20],
  'cyl:8inline': [12000, 18],
  'cyl:12v': [25000, 26],
  'cyl:16v': [40000, 32],
  'vt:ioe': [5000, 10],
  'vt:ohv': [10000, 16],
  'vt:ohc': [16000, 22],
  'vt:dohc': [25000, 30],
  'fuel:carb2': [6000, 10],
  'fuel:injection': [30000, 30],
  'fuel:diesel': [22000, 26],
  'asp:supercharger': [16000, 20],
  'gb:synchro': [12000, 18],
  'gb:automatic': [35000, 34],
  'gears:4': [6000, 10],
  'gears:5': [10000, 14],
  'susp:ifs': [15000, 20],
  'susp:allind': [22000, 26],
  'chassis:monocoque': [30000, 30],
  'feat:steelBody': [10000, 14],
  'feat:fourWheelBrakes': [6000, 10],
  'feat:hydraulicBrakes': [9000, 14],
  'feat:safetyGlass': [4000, 8],
  'feat:discBrakes': [12000, 16],
  'feat:paddedDash': [3000, 6],
  'feat:seatBelt': [3000, 6],
  'feat:electricStart': [8000, 14],
  'feat:electricLights': [4000, 8],
  'feat:heater': [3000, 6],
  'feat:radio': [6000, 10],
  'feat:powerSteering': [12000, 16],
  'feat:airCon': [20000, 22],
  'feat:windshield': [2000, 4],
  'feat:speedometer': [2500, 5],
  'feat:spareWheel': [1500, 4],
  'feat:rearMirror': [1000, 3],
  'feat:wipers': [2500, 5],
  'feat:fuelGauge': [2000, 4],
  'feat:turnSignals': [3000, 6],
  'feat:sealedBeam': [4000, 8],
};

let cache: ResearchDef[] | null = null;

/** Everything that has to be researched before it can go into a design. */
export function researchDefs(): ResearchDef[] {
  if (cache) return cache;
  const out: ResearchDef[] = [];
  const add = (id: string, name: string, category: ResearchDef['category'], year: number, desc: string, extra: Partial<ResearchDef> = {}) => {
    const c = COST[id];
    if (c && year > 1900)
      out.push({ id, name, category, year, desc, cost: c[0], weeks: c[1], passive: false, ...extra, requires: [...(REQUIRES[id] ?? []), ...(extra.requires ?? [])] });
  };
  CYLINDER_OPTIONS.forEach((x) => add(`cyl:${x.cylinders}${x.layout}`, x.label, 'Motor', x.year, x.desc));
  VALVETRAINS.forEach((x) => add(`vt:${x.id}`, x.name, 'Motor', x.year, x.desc));
  FUEL_SYSTEMS.forEach((x) => add(`fuel:${x.id}`, x.name, 'Motor', x.year, x.desc));
  add('fuel:diesel', 'Dizel motor', 'Motor', DIESEL_YEAR, 'Yakıtı sıkıştırmanın ısısı tutuşturur: çok az yakar, uzun ömürlüdür; ağır, gürültülü ve pahalıdır.');
  ASPIRATIONS.forEach((x) => add(`asp:${x.id}`, x.name, 'Motor', x.year, x.desc));
  GEARBOX_TYPES.forEach((x) => add(`gb:${x.id}`, x.name, 'Şanzıman', x.year, x.desc));
  add('gears:4', '4 ileri vites', 'Şanzıman', 1925, 'Vitesler birbirine yaklaşır; motor güçlü olduğu devirde kalır.');
  add('gears:5', '5 ileri vites', 'Şanzıman', 1955, 'Uzun bir son vitesle yolda az yakar, kısa ilk vitesle çevik kalkar.');
  CHASSIS.forEach((x) => add(`chassis:${x.id}`, x.name, 'Şasi ve süspansiyon', x.year, x.desc));
  SUSPENSIONS.forEach((x) => add(`susp:${x.id}`, x.name, 'Şasi ve süspansiyon', x.year, x.desc));
  FEATURES.forEach((x) =>
    add(`feat:${x.id}`, x.name, x.group === 'safety' ? 'Güvenlik' : 'Donanım', x.year, x.desc, {
      requires: (x.requires ?? []).map((r) => `feat:${r}`),
      effects: [effectsText({ comfort: x.comfort, handling: x.handling, safety: x.safety, reliability: x.reliability, practicality: x.practicality, prestige: x.prestige }), `araç başına ~$${x.cost}`]
        .filter(Boolean)
        .join(', '),
    }),
  );
  for (const k of KNOWHOW) {
    out.push({ id: k.id, name: k.name, category: k.area, year: k.year, desc: k.desc, cost: k.cost, weeks: k.weeks, requires: k.requires ?? [], passive: true, effects: effectsText(k.effects) });
  }
  cache = out;
  return out;
}

export const researchDef = (id: string) => researchDefs().find((r) => r.id === id);

/** Technologies known at the start: whatever existed when the company opened. */
export function startingKnowledge(year: number): string[] {
  return researchDefs()
    .filter((r) => r.year <= year)
    .map((r) => r.id);
}

/** Older saves had no research: they know everything that exists so far. */
export function ensureResearch(s: GameState, year: number) {
  s.research ??= { known: startingKnowledge(year), active: [] };
}

export function isKnown(s: GameState, id: string): boolean {
  if (!researchDef(id)) return true;
  return !s.research || s.research.known.includes(id);
}

export type TechState = 'future' | 'available' | 'researching' | 'known';

export function techState(s: GameState, id: string, yf: number): TechState {
  const def = researchDef(id);
  if (!def) return 'known';
  if (isKnown(s, id)) return 'known';
  if (def.year > yf) return 'future';
  return s.research?.active.some((a) => a.id === id) ? 'researching' : 'available';
}

/** Prerequisites still missing for a technology. */
export function missingRequirements(s: GameState, id: string): ResearchDef[] {
  return (researchDef(id)?.requires ?? []).filter((r) => !isKnown(s, r)).map((r) => researchDef(r)!).filter(Boolean);
}

/** Know-how the company has learned: it goes into every new design. */
export function knownKnowhow(s: GameState): string[] {
  return KNOWHOW.filter((k) => isKnown(s, k.id)).map((k) => k.id);
}

/** First in the field pays for it: twice the mature price at release, falling over about five years. */
const pioneer = (def: ResearchDef, yf: number) => Math.exp(-Math.max(0, yf - def.year) / 5);

/**
 * Research grows into a company-sized investment. A workshop of 1905 pays the table price; once
 * the industry has big firms (from about 1918) the same knowledge costs ten times as much.
 */
export const researchScale = (yf: number) => 1 + 9 * Math.min(1, Math.max(0, (yf - 1906) / 12));

export function researchCost(def: ResearchDef, yf: number): number {
  return def.cost * researchScale(yf) * (1 + pioneer(def, yf)) * costIndex(yf);
}

/** A bigger engineering department learns faster. */
export const researchSpeed = (engineers: number) => 0.6 + Math.min(2.4, engineers / 10);

/** Pay for a subject and put the engineers on it (checks are the caller's). */
export function beginResearch(s: GameState, def: ResearchDef, yf: number): { cost: number; weeks: number } {
  const cost = researchCost(def, yf);
  spend(s, cost, 'rnd');
  const weeks = researchWeeks(def, yf, s.company.engineers);
  s.research!.active.push({ id: def.id, weeksLeft: weeks, weeks });
  log(s, `Ar-Ge: ${def.name} araştırması başladı (${money(cost)}, ${weeks} hafta).`, 'info', 'tech');
  decide(s, 'research:' + def.id, `Ar-Ge: ${def.name} (${def.year}) ${money(cost)}, ${weeks} hafta`);
  return { cost, weeks };
}

/** Why the head of the queue is not running yet, if it is not. */
export function queueHold(s: GameState, yf: number): { id: string; reason: 'cash' | 'requires' | 'slots' } | null {
  const r = s.research;
  const q = r?.queue ?? [];
  if (!r || !q.length) return null;
  if (r.active.length >= researchSlots(s.company.engineers)) return { id: q[0], reason: 'slots' };
  const next = q.find((id) => missingRequirements(s, id).length === 0);
  if (!next) return { id: q[0], reason: 'requires' };
  const def = researchDef(next)!;
  if (s.company.cash < researchCost(def, yf)) return { id: next, reason: 'cash' };
  return null;
}

/**
 * Start queued subjects while there are free slots: in order, skipping only those still waiting for
 * a prerequisite. A subject the till cannot pay for holds the queue (it is the next priority).
 */
export function pumpResearchQueue(s: GameState, yf: number): string[] {
  const r = s.research;
  const started: string[] = [];
  if (!r?.queue?.length) return started;
  // Drop what is already known or running (learned some other way).
  r.queue = r.queue.filter((id) => !r.known.includes(id) && !r.active.some((a) => a.id === id) && researchDef(id));
  while (r.active.length < researchSlots(s.company.engineers)) {
    const id: string | undefined = r.queue.find((x) => researchDef(x)!.year <= yf && missingRequirements(s, x).length === 0);
    if (!id) break;
    const def = researchDef(id)!;
    if (s.company.cash < researchCost(def, yf)) break;
    beginResearch(s, def, yf);
    r.queue = r.queue.filter((x: string) => x !== id);
    started.push(id);
  }
  return started;
}

/** Tell the player what finished and what the queue started next (one corner note per week). */
export function noteResearch(s: GameState, done: string[], started: string[]) {
  if (!done.length && !started.length) return;
  const prev = s.modals.find((m) => m.kind === 'research');
  if (prev && prev.kind === 'research') {
    prev.done.push(...done);
    prev.started.push(...started);
  } else pushModal(s, { kind: 'research', done, started });
}

export function researchWeeks(def: ResearchDef, yf: number, engineers: number): number {
  return Math.max(2, Math.ceil((def.weeks * (1 + pioneer(def, yf))) / researchSpeed(engineers)));
}

/** How many subjects the department can work on at once. */
export const researchSlots = (engineers: number) => 1 + Math.floor(engineers / 15);

/** Tech ids a design needs. */
export function designTech(d: CarDesign): string[] {
  const e = d.engine;
  const out = [`cyl:${e.cylinders}${e.layout}`, `vt:${e.valvetrain}`, `asp:${e.aspiration}`, `chassis:${d.chassis}`, `gb:${d.gearbox.type}`, `susp:${d.suspension}`];
  out.push(e.fuel === 'diesel' ? 'fuel:diesel' : `fuel:${e.fuelSystem}`);
  // An automatic brings its own four speeds.
  if (d.gearbox.type !== 'automatic' && d.gearbox.gears >= 4) out.push('gears:4');
  if (d.gearbox.gears >= 5) out.push('gears:5');
  for (const f of d.features) out.push(`feat:${f}`);
  return out;
}

/** Names of the technologies in a design the company has not researched yet. */
export function unknownTech(s: GameState, d: CarDesign): string[] {
  return designTech(d)
    .filter((id) => !isKnown(s, id))
    .map((id) => researchDef(id)?.name ?? id);
}

/** Most forward gears the company can build this year. */
export function knownMaxGears(s: GameState, eraMax: number): number {
  let g = 3;
  if (eraMax >= 4 && isKnown(s, 'gears:4')) g = 4;
  if (eraMax >= 5 && isKnown(s, 'gears:5')) g = 5;
  return g;
}

/**
 * The nearest design the company can actually build: unknown technology is
 * replaced with the best known alternative (engine displacement is kept).
 */
export function restrictToKnown(s: GameState, d: CarDesign, eraMaxGears: number): CarDesign {
  const e = { ...d.engine };
  if (e.fuel === 'diesel' && !isKnown(s, 'fuel:diesel')) {
    e.fuel = 'petrol';
    e.compression = Math.min(e.compression, 5);
  }
  if (!isKnown(s, `vt:${e.valvetrain}`)) {
    const order = VALVETRAINS.map((v) => v.id);
    const want = order.indexOf(e.valvetrain);
    e.valvetrain = order.filter((id, i) => i <= want && isKnown(s, `vt:${id}`)).pop() ?? 'sv';
  }
  if (!isKnown(s, `fuel:${e.fuelSystem}`)) e.fuelSystem = 'carb';
  if (!isKnown(s, `asp:${e.aspiration}`)) e.aspiration = 'na';
  if (!isKnown(s, `cyl:${e.cylinders}${e.layout}`)) {
    const cc = displacementCc(e);
    const ratio = e.stroke / e.bore;
    const opts = CYLINDER_OPTIONS.filter((c) => isKnown(s, `cyl:${c.cylinders}${c.layout}`));
    const best = opts.reduce((a, c) => (Math.abs(c.cylinders - e.cylinders) < Math.abs(a.cylinders - e.cylinders) ? c : a), opts[0]);
    e.cylinders = best.cylinders;
    e.layout = best.layout;
    Object.assign(e, boreStrokeFor(cc, best.cylinders, ratio));
  }
  const gearbox = { ...d.gearbox };
  if (!isKnown(s, `gb:${gearbox.type}`)) gearbox.type = isKnown(s, 'gb:synchro') && gearbox.type === 'automatic' ? 'synchro' : 'sliding';
  gearbox.gears = gearbox.type === 'automatic' ? 4 : Math.min(gearbox.gears, knownMaxGears(s, eraMaxGears));
  let suspension = d.suspension;
  if (!isKnown(s, `susp:${suspension}`)) suspension = isKnown(s, 'susp:ifs') ? 'ifs' : 'leaf';
  const chassis = isKnown(s, `chassis:${d.chassis}`) ? d.chassis : 'ladder';
  const features = d.features.filter((f) => isKnown(s, `feat:${f}`) && (FEATURES.find((x) => x.id === f)?.requires ?? []).every((r) => isKnown(s, `feat:${r}`)));
  return { ...d, engine: e, gearbox, suspension, chassis, features, knowhow: knownKnowhow(s) };
}

/** Share of the rivals' cars on sale that already use each technology. */
export function rivalAdoption(s: GameState): Record<string, number> {
  const active = s.rivalModels.filter((m) => m.active);
  const counts: Record<string, number> = {};
  for (const m of active) for (const id of new Set([...designTech(m.design), ...(m.design.knowhow ?? [])])) counts[id] = (counts[id] ?? 0) + 1;
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(counts)) out[id] = n / Math.max(1, active.length);
  return out;
}
