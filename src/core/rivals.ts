import { labourShare, priceLevel, priceMarkup } from '../data/economy';
import { RIVALS, type RivalDef } from '../data/rivals';
import { segmentDef } from '../data/segments';
import { aiDesign } from './ai';
import type { Rng } from './rng';
import { yearFloat, yearOf } from './time';
import { computeCarStats } from './vehicle';
import type { CarDesign, GameState, MarketId, RivalCompany, RivalModel, SegmentId } from './types';

const STYLE_MARKUP = { mass: 1, utility: 1, premium: 1.22, sport: 1.18 } as const;

export function rivalDef(id: string): RivalDef {
  return RIVALS.find((r) => r.id === id)!;
}

export function initRival(r: RivalDef): RivalCompany {
  return {
    id: r.id,
    name: r.name,
    home: r.home,
    founded: r.founded,
    closes: r.closes,
    skill: r.skill,
    size: 0,
    style: r.style,
    segments: r.segments.map((s) => s.seg),
    color: r.color,
    unitsSold: 0,
    yearSold: {},
  };
}

export function initRivals(): RivalCompany[] {
  return RIVALS.map(initRival);
}

/**
 * Saves from other builds: give companies added since a fresh record, and let
 * go of companies (and their cars) that no longer exist.
 */
export function ensureRivals(state: GameState) {
  const known = new Set(RIVALS.map((r) => r.id));
  if (state.rivals.some((c) => !known.has(c.id))) {
    state.rivals = state.rivals.filter((c) => known.has(c.id));
    state.rivalModels = state.rivalModels.filter((m) => known.has(m.companyId));
  }
  for (const def of RIVALS) if (!state.rivals.some((c) => c.id === def.id)) state.rivals.push(initRival(def));
}

export const isRivalActive = (def: RivalDef, yf: number) => def.founded <= yf && (!def.closes || yf < def.closes);

/** Civilian car launches stop while the country is at war. */
function atWar(market: MarketId, yf: number): boolean {
  if (market === 'usa') return yf >= 1942 && yf < 1945.7;
  return (yf >= 1914.6 && yf < 1918.9) || (yf >= 1939.7 && yf < 1945.5);
}

/** Horsepower in a model's name: brake horsepower in America, the taxable rating in Britain and France. */
const HP_NAMES: [RegExp, number][] = [
  [/\bTenner\b|\bTen\b|\b10 CV\b/, 10],
  [/\b8 CV\b/, 8],
  [/\bTwelve\b|\b12 CV\b/, 12],
  [/\bFourteen\b/, 14],
  [/\b15 CV\b/, 15],
  [/\bSixteen\b/, 16],
  [/\bTwenty\b/, 20],
  [/\bThirty-Five\b/, 35],
  [/\bThirty\b/, 30],
  [/\bForty\b/, 40],
];

/** A name that promises something (six cylinders, thirty horsepower, a roadster body) must be true of the car. */
export function nameFits(name: string, design: CarDesign, hp: number): boolean {
  const cyl = design.engine.cylinders;
  if (/\bSix\b|Six-/.test(name) && cyl !== 6) return false;
  if (/\bEight\b/.test(name) && cyl !== 8) return false;
  if (/\bFour\b|\bQuatre\b/.test(name) && cyl !== 4) return false;
  for (const [re, n] of HP_NAMES) if (re.test(name)) return Math.abs(hp - n) / n < 0.35;
  if (/\bRoadster\b|\bSpeedster\b/.test(name) && design.body !== 'roadster') return false;
  if (/\bTourer\b|\bTonneau\b/.test(name) && design.body !== 'phaeton') return false;
  return true;
}

function modelName(state: GameState, def: RivalDef, week: number, design: CarDesign, hp: number): string {
  const count = state.rivalModels.filter((m) => m.companyId === def.id).length;
  const n = def.names.length;
  // The next name in the maker's list that fits this car; a plain letter model if none does.
  let base: string | undefined;
  for (let i = 0; i < n && !base; i++) {
    const cand = def.names[(count + i) % n];
    if (nameFits(cand, design, hp)) base = cand;
  }
  base ??= `${def.home === 'usa' ? 'Model' : 'Type'} ${String.fromCharCode(65 + (count % 26))}`;
  const taken = state.rivalModels.some((m) => m.companyId === def.id && m.name === base);
  return taken || count >= n ? `${base} '${String(yearOf(week)).slice(2)}` : base;
}

export function launchRivalModel(
  state: GameState,
  def: RivalDef,
  seg: SegmentId,
  week: number,
  rng: Rng,
  special?: { name: string; priceMult: number },
  skillBonus = 0,
): RivalModel {
  const yf = yearFloat(week);
  const year = Math.floor(yf);
  // Leading makers put new technology into their cars a year or two before it is common knowledge.
  const lead = def.skill >= 64 ? 2 : def.skill >= 57 ? 1 : 0;
  const { design, bonus } = aiDesign(seg, year + lead, { style: def.style, skill: Math.min(95, def.skill + skillBonus), market: def.home }, rng);
  const stats = computeCarStats(design, yf, bonus);
  const labour = def.massProduction && yf >= def.massProduction ? Math.min(0.2, labourShare(yf)) : labourShare(yf);
  const price = stats.unitCost * priceLevel(yf) * (1 + labour) * priceMarkup(yf) * STYLE_MARKUP[def.style] * (special?.priceMult ?? 1) * (0.95 + rng() * 0.1);
  const markets: MarketId[] = [def.home];
  for (const ex of def.exports ?? []) {
    if (yf >= ex.from && (!ex.segments || ex.segments.includes(seg))) markets.push(ex.market);
  }
  const rm: RivalModel = {
    id: `r${state.nextId++}`,
    companyId: def.id,
    name: special?.name ?? modelName(state, def, week, design, def.home === 'usa' ? stats.engine.powerHp : stats.engine.taxHp),
    segment: seg,
    launchWeek: week,
    design,
    stats,
    price,
    priceIndexAtLaunch: priceLevel(yf),
    markets,
    active: true,
    unitsSold: 0,
  };
  state.rivalModels.push(rm);
  return rm;
}

/** The player's share of a class in a market last year (0..1). */
function playerShareLastYear(state: GameState, market: MarketId, seg: SegmentId): number {
  const y = yearOf(state.week) - 1;
  const total = state.segmentSales[`${y}:${market}:${seg}`] ?? 0;
  const mine = state.segmentSales[`${y}:${market}:${seg}:p`] ?? 0;
  return total > 0 ? mine / total : 0;
}

/** Years between a rival's new models: cars date quickly, so rivals keep them fresh. */
function cycleYears(yf: number): number {
  if (yf < 1946) return 5;
  return 4;
}

export interface RivalNews {
  text: string;
  tone: 'info' | 'warn';
}

/**
 * Monthly rival housekeeping: open/close companies, launch & retire models.
 * `initial` populates the market at game start with models of varied age.
 */
export function updateRivals(state: GameState, rng: Rng, initial = false): RivalNews[] {
  const news: RivalNews[] = [];
  const week = state.week;
  const yf = yearFloat(week);
  ensureRivals(state);
  for (const def of RIVALS) {
    const company = state.rivals.find((c) => c.id === def.id)!;
    const active = isRivalActive(def, yf) && !state.acquired?.includes(def.id) && !company.mergedInto;
    const ownModels = state.rivalModels.filter((m) => m.companyId === def.id && m.active);
    if (!active) {
      if (def.closes && yf >= def.closes && ownModels.length && !state.acquired?.includes(def.id)) {
        ownModels.forEach((m) => (m.active = false));
        news.push({ text: `${def.name} kapılarını kapattı. Pazarında boşluk oluştu.`, tone: 'warn' });
      }
      continue;
    }
    company.size = 0; // derived on demand; kept for serialisation compatibility
    if (atWar(def.home, yf) && !initial) continue;

    for (const sp of def.special ?? []) {
      const key = `special:${def.id}:${sp.name}`;
      if (!state.flags[key] && yf >= sp.year) {
        state.flags[key] = week;
        ownModels.filter((m) => m.segment === sp.seg).forEach((m) => (m.active = false));
        const rm = launchRivalModel(state, def, sp.seg, week, rng, { name: sp.name, priceMult: sp.priceMult });
        news.push({ text: `${def.name} ${rm.name} modelini tanıttı. ${sp.note}`, tone: 'warn' });
      }
    }

    for (const entry of def.segments) {
      const segActive = entry.from <= yf && (!entry.to || yf < entry.to) && segmentDef(entry.seg).year <= yf;
      const current = ownModels.filter((m) => m.segment === entry.seg && m.active);
      if (!segActive) {
        current.forEach((m) => (m.active = false));
        continue;
      }
      const special = (def.special ?? []).find(
        (sp) => sp.seg === entry.seg && state.flags[`special:${def.id}:${sp.name}`] !== undefined && yf < sp.year + sp.life,
      );
      if (current.length === 0) {
        if (initial || rng() < 0.25) {
          // At game start, pretend existing models were launched some time ago.
          const launchWeek = initial ? Math.max(0, week - Math.floor(rng() * 52 * 3)) : week;
          const rm = launchRivalModel(state, def, entry.seg, week, rng);
          rm.launchWeek = launchWeek;
          if (!initial && def.founded < yf - 0.2) news.push({ text: `${def.name} yeni ${segmentDef(entry.seg).name.toLowerCase()} modelini çıkardı: ${rm.name}.`, tone: 'info' });
          else if (!initial) news.push({ text: `${def.name} kuruldu. İlk modeli: ${rm.name}.`, tone: 'info' });
        }
        continue;
      }
      if (special && current.some((m) => m.name === special.name)) continue;
      const newest = current.reduce((a, b) => (a.launchWeek > b.launchWeek ? a : b));
      const age = (week - newest.launchWeek) / 52;
      // Rivals answer a player who takes their buyers: earlier and better new models.
      const pressure = Math.min(0.5, playerShareLastYear(state, def.home, entry.seg) * 2.5);
      if (age > cycleYears(yf) * (1 - pressure) && rng() < 0.2 + pressure * 0.4) {
        current.forEach((m) => (m.active = false));
        const rm = launchRivalModel(state, def, entry.seg, week, rng, undefined, Math.round(pressure * 16));
        if (pressure > 0.2 && age < cycleYears(yf))
          news.push({ text: `${def.name}, ${segmentDef(entry.seg).name.toLowerCase()} pazarında kaybettiği alıcılar için ${rm.name} modelini erkenden çıkardı.`, tone: 'warn' });
        else news.push({ text: `${def.name}, ${newest.name} modelinin yerine ${rm.name} modelini getirdi.`, tone: 'info' });
      }
    }

    // Update export markets of existing models (e.g. Hartwell reaching Europe in 1911).
    for (const rm of state.rivalModels.filter((m) => m.companyId === def.id && m.active)) {
      if (rm.priceCut && week >= rm.priceCut.until) delete rm.priceCut;
      for (const ex of def.exports ?? []) {
        if (yf >= ex.from && (!ex.segments || ex.segments.includes(rm.segment)) && !rm.markets.includes(ex.market)) {
          rm.markets.push(ex.market);
        }
      }
    }
  }
  // Keep the save small: forget long-retired rival models.
  state.rivalModels = state.rivalModels.filter((m) => m.active || week - m.launchWeek < 52 * 12);
  return news;
}
