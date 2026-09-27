import { costIndex, labourShare, priceMarkup } from '../data/economy';
import {
  MARKETS,
  activeTax,
  dealerCoverage,
  marketDef,
  marketSize,
  othersMass,
  segmentShares,
  tariff,
} from '../data/markets';
import { RIVALS } from '../data/rivals';
import { stationDef } from '../data/stations';
import { SEGMENTS, segmentDef } from '../data/segments';
import { interp } from '../data/tech';
import { appeal, eraMods, eraReference, scoreStats } from './scoring';
import { INDUSTRY_RESIDUAL_DEFECTS } from './testing';
import { yearFloat } from './time';
import type { CarModel, CarStats, GameState, MarketId, RivalModel, Scores, SegmentId } from './types';

export const TAU = 7;
/**
 * Dealer reach has diminishing returns: a car only sold in a few showrooms still
 * finds the enthusiasts who look for it, so a small specialist is not wiped out
 * by a big maker's network.
 */
const REACH_EXP = 0.6;
const offerWeight = (reach: number, utility: number) => Math.pow(reach, REACH_EXP) * Math.exp(utility / TAU);
/** The many tiny coachbuilders and assemblers behave like an average car of the class. */
const OTHERS_UTILITY = 50;

/** Base price adjusted for inflation since it was set (if indexing is on). */
export function priceNow(model: Pick<CarModel, 'price' | 'priceWeek' | 'indexPrice'>, week: number): number {
  if (!model.indexPrice) return model.price;
  return (model.price * costIndex(yearFloat(week))) / costIndex(yearFloat(model.priceWeek));
}

/** Ownership tax capitalised into the purchase decision (e.g. the British RAC horsepower tax). */
export function ownershipTax(market: MarketId, stats: Pick<CarStats, 'engine'>, yf: number): number {
  const rule = activeTax(market, yf);
  if (!rule) return 0;
  const base = rule.kind === 'racHp' ? stats.engine.taxHp : stats.engine.displacementCc;
  return base * rule.rate * costIndex(yf);
}

export interface PriceBreakdown {
  base: number;
  tariff: number;
  tax: number;
  total: number;
}

export function consumerPrice(base: number, market: MarketId, isImport: boolean, stats: Pick<CarStats, 'engine'>, yf: number): PriceBreakdown {
  const t = isImport ? base * tariff(market, yf) : 0;
  const tax = ownershipTax(market, stats, yf);
  return { base, tariff: t, tax, total: base + t + tax };
}

/** A stable price anchor for a class: what the typical car of that class costs buyers. */
export function referencePrice(market: MarketId, segment: SegmentId, yf: number): number {
  const ref = eraReference(yf, segment).byMarket[market];
  const segFactor = { city: 1, family: 1.02, sport: 1.18, luxury: 1.28, pickup: 1, suv: 1.02 }[segment];
  const base = ref.unitCost * costIndex(yf) * (1 + labourShare(yf)) * priceMarkup(yf) * segFactor;
  return base + ownershipTax(market, { engine: { taxHp: ref.taxHp, displacementCc: ref.displacementCc } as CarStats['engine'] }, yf);
}

/**
 * Utility points per unit of log price. With TAU = 7 a small maker's own-price
 * elasticity is about priceSens × PRICE_COEF / TAU (family car ≈ 7): charging
 * far above the class price loses most buyers, so profit comes from volume.
 */
export const PRICE_COEF = 40;
/** Launch buzz counts, but less than the car itself. */
const HYPE_WEIGHT = 0.6;

export function priceTerm(segment: SegmentId, market: MarketId, consumer: number, yf: number): number {
  const sens = segmentDef(segment).priceSens * eraMods(market, yf).priceSens;
  return -sens * PRICE_COEF * Math.log(consumer / referencePrice(market, segment, yf));
}

export const brandTerm = (reputation: number, segment: SegmentId) => (reputation - 50) * 0.12 * segmentDef(segment).brandSens;

export function playerReach(state: GameState, market: MarketId): number {
  const m = state.markets[market];
  return dealerCoverage(m.dealerLevel, market === state.company.hq) * (0.35 + 0.65 * m.awareness);
}

export function rivalSize(companyId: string, yf: number): number {
  const def = RIVALS.find((r) => r.id === companyId)!;
  return interp(def.size, yf);
}

export const rivalReputation = (companyId: string) => 45 + 0.3 * RIVALS.find((r) => r.id === companyId)!.skill;

export function segmentAvailable(segment: SegmentId, yf: number): boolean {
  return segmentDef(segment).year <= yf;
}

export function weeklySegmentDemand(market: MarketId, segment: SegmentId, yf: number): number {
  if (!segmentAvailable(segment, yf)) return 0;
  return (marketSize(market, yf) * segmentShares(market, yf)[segment]) / 52;
}

// ---- cached scores ----

/**
 * A new maker's cars rattle: fit, finish and an unknown name on the grille.
 * 1 for a first car, fading as the company builds cars and launches models.
 */
export function workshopPenalty(state: GameState): number {
  const built = state.models.reduce((a, m) => a + m.unitsBuilt, 0);
  return Math.exp(-built / 3000) * Math.exp(-(state.company.modelsLaunched ?? 0) / 4);
}

export function applyWorkshopPenalty(scores: Scores, pen: number): Scores {
  scores.reliability = Math.max(0, scores.reliability - 10 * pen);
  scores.comfort = Math.max(0, scores.comfort - 5 * pen);
  scores.prestige = Math.max(0, scores.prestige - 7 * pen);
  scores.handling = Math.max(0, scores.handling - 3 * pen);
  return scores;
}

export function modelScores(state: GameState, model: CarModel): { scores: Scores; appeal: Record<MarketId, number> } {
  if (model.cache && state.week - model.cache.week < 4) return model.cache;
  const yf = yearFloat(state.week);
  const scores = applyWorkshopPenalty(scoreStats(model.stats, yf, model.segment, model.perceivedReliability), workshopPenalty(state));
  // Platform over-sharing ("they are all the same car") hurts prestige.
  const siblings = state.models.filter((m) => m.status === 'active' && m.platformId === model.platformId).length;
  if (siblings > 3) scores.prestige = Math.max(0, scores.prestige - 6 * (siblings - 3));
  // "Any colour so long as it's black": the fast-drying black enamel oven limits choice.
  const blackOnly = state.lines.some((l) => l.modelId === model.id && l.stations.paint.some((id) => stationDef(id).blackOnly));
  if (blackOnly) scores.prestige = Math.max(0, scores.prestige - 5);
  const ap = {} as Record<MarketId, number>;
  for (const m of MARKETS) ap[m.id] = appeal(scores, model.segment, m.id, yf);
  model.cache = { week: state.week, scores, appeal: ap };
  return model.cache;
}

export function rivalScores(state: GameState, rm: RivalModel): { scores: Scores; appeal: Record<MarketId, number> } {
  if (rm.cache && state.week - rm.cache.week < 4) return rm.cache;
  const yf = yearFloat(state.week);
  const scores = scoreStats(rm.stats, yf, rm.segment, rm.stats.reliability - INDUSTRY_RESIDUAL_DEFECTS);
  const ap = {} as Record<MarketId, number>;
  for (const m of MARKETS) ap[m.id] = appeal(scores, rm.segment, m.id, yf);
  rm.cache = { week: state.week, scores, appeal: ap };
  return rm.cache;
}

export function rivalPriceNow(rm: RivalModel, week: number): number {
  return (rm.price * costIndex(yearFloat(week))) / rm.priceIndexAtLaunch;
}

// ---- offers & shares ----

export interface Offer {
  kind: 'player' | 'rival';
  id: string;
  name: string;
  companyId: string;
  appeal: number;
  price: number;
  priceTerm: number;
  brand: number;
  hype: number;
  reach: number;
  utility: number;
  weight: number;
}

export function playerOffer(state: GameState, model: CarModel, market: MarketId): Offer {
  const yf = yearFloat(state.week);
  const { appeal: ap } = modelScores(state, model);
  const isImport = market !== state.company.hq;
  const price = consumerPrice(priceNow(model, state.week), market, isImport, model.stats, yf).total;
  const pt = priceTerm(model.segment, market, price, yf);
  const brand = brandTerm(state.company.reputation, model.segment);
  const reach = playerReach(state, market);
  const hype = model.hype * HYPE_WEIGHT;
  const utility = ap[market] + pt + brand + hype;
  return {
    kind: 'player',
    id: model.id,
    name: model.name,
    companyId: 'player',
    appeal: ap[market],
    price,
    priceTerm: pt,
    brand,
    hype,
    reach,
    utility,
    weight: offerWeight(reach, utility),
  };
}

export function rivalOffer(state: GameState, rm: RivalModel, market: MarketId): Offer {
  const yf = yearFloat(state.week);
  const def = RIVALS.find((r) => r.id === rm.companyId)!;
  const { appeal: ap } = rivalScores(state, rm);
  const isImport = market !== def.home;
  const price = consumerPrice(rivalPriceNow(rm, state.week), market, isImport, rm.stats, yf).total;
  const pt = priceTerm(rm.segment, market, price, yf);
  const brand = brandTerm(rivalReputation(rm.companyId), rm.segment);
  const hype = 4 * HYPE_WEIGHT * Math.exp(-(state.week - rm.launchWeek) / 40);
  const reach = rivalSize(rm.companyId, yf) * (isImport ? 0.45 : 1);
  const utility = ap[market] + pt + brand + hype;
  return {
    kind: 'rival',
    id: rm.id,
    name: rm.name,
    companyId: rm.companyId,
    appeal: ap[market],
    price,
    priceTerm: pt,
    brand,
    hype,
    reach,
    utility,
    weight: offerWeight(reach, utility),
  };
}

export interface SegmentMarket {
  demand: number; // cars per week, whole segment
  offers: Offer[];
  othersWeight: number;
  totalWeight: number;
}

export function segmentMarket(state: GameState, market: MarketId, segment: SegmentId): SegmentMarket {
  const yf = yearFloat(state.week);
  const offers: Offer[] = [];
  for (const m of state.models) {
    if (m.status === 'active' && m.segment === segment && m.markets.includes(market) && state.markets[market].unlocked) {
      offers.push(playerOffer(state, m, market));
    }
  }
  for (const rm of state.rivalModels) {
    if (rm.active && rm.segment === segment && rm.markets.includes(market)) offers.push(rivalOffer(state, rm, market));
  }
  // Where few named rivals compete, the many small makers fill the gap.
  const rivalCount = offers.filter((o) => o.kind === 'rival').length;
  const othersWeight = othersMass(yf) * (1 + 0.35 * Math.max(0, 3 - rivalCount)) * Math.exp(OTHERS_UTILITY / TAU);
  const totalWeight = offers.reduce((s, o) => s + o.weight, 0) + othersWeight;
  return { demand: weeklySegmentDemand(market, segment, yf), offers, othersWeight, totalWeight };
}

/** Preview: expected weekly demand for a hypothetical price (used by the launch & pricing UI). */
export function demandAtPrice(state: GameState, model: CarModel, market: MarketId, basePrice: number): number {
  const sm = segmentMarket(state, market, model.segment);
  const original = model.price;
  const originalWeek = model.priceWeek;
  model.price = basePrice;
  model.priceWeek = state.week;
  const o = playerOffer(state, model, market);
  model.price = original;
  model.priceWeek = originalWeek;
  const others = sm.totalWeight - (sm.offers.find((x) => x.id === model.id)?.weight ?? 0);
  return (sm.demand * o.weight) / (others + o.weight);
}

export const SEGMENT_IDS: SegmentId[] = SEGMENTS.map((s) => s.id);
export const MARKET_IDS: MarketId[] = MARKETS.map((m) => m.id);
export { marketDef };
