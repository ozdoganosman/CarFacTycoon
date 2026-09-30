import { costIndex, labourShare, priceLevel, priceMarkup } from '../data/economy';
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
import { toolingDef } from '../data/tooling';
import { SEGMENTS, segmentDef } from '../data/segments';
import { interp } from '../data/tech';
import { nationalReach, playerStateDemand } from './network';
import { appeal, eraMods, eraReference, scoreStats } from './scoring';
import { INDUSTRY_RESIDUAL_DEFECTS } from './testing';
import { yearFloat } from './time';
import type { StateId } from '../data/states';
import type { AttrKey, CarModel, CarStats, GameState, MarketId, RivalModel, Scores, SegmentId } from './types';

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
/**
 * Buyers notice a better car, but the tenth improvement matters less than the first: past the class
 * average appeal counts less and less (75 → 69, 90 → 73), so a great car cannot also charge anything.
 */
export const appealUtility = (ap: number) => 50 + 25 * Math.tanh((ap - 50) / 25);

/**
 * The price today. An indexed price follows its class: what a typical car of the class costs now against
 * when the price was set (inflation, and also the thinner margins and cheaper mass-produced cars that
 * keep class prices from rising as fast as prices in general).
 */
export function priceNow(model: Pick<CarModel, 'price' | 'priceWeek' | 'indexPrice' | 'segment'>, week: number): number {
  if (!model.indexPrice || model.priceWeek === week) return model.price;
  return (model.price * referencePrice('usa', model.segment, yearFloat(week))) / referencePrice('usa', model.segment, yearFloat(model.priceWeek));
}

/** How far a price stands from its class (0.2 = 20% above), and when it is far enough to say so. */
export const classGap = (price: number, segment: SegmentId, yf: number) => price / referencePrice('usa', segment, yf) - 1;
export const CLASS_GAP_WARN = 0.15;

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
  const base = ref.unitCost * priceLevel(yf) * (1 + labourShare(yf)) * priceMarkup(yf) * segFactor;
  return base + ownershipTax(market, { engine: { taxHp: ref.taxHp, displacementCc: ref.displacementCc } as CarStats['engine'] }, yf);
}

/**
 * Utility points per unit of log price. With TAU = 7 a small maker's own-price
 * elasticity is about priceSens × PRICE_COEF / TAU (family car ≈ 7): charging
 * far above the class price loses most buyers, so profit comes from volume.
 */
export const PRICE_COEF = 40;
/**
 * Past 15% over the class price a car leaves most of its buyers' budgets: each further step up the price
 * loses buyers PRICE_OVER times faster, so a good car cannot also charge double.
 */
export const PRICE_OVER_FROM = 0.15;
const PRICE_OVER = 1.5;
/** Launch buzz counts, but less than the car itself. */
const HYPE_WEIGHT = 0.4;

/** The price's pull on buyers against the class price, in log terms, with the steeper slope past +15%. */
const priceSlope = (ratio: number) => {
  const lr = Math.log(ratio);
  return lr + PRICE_OVER * Math.max(0, lr - Math.log(1 + PRICE_OVER_FROM));
};

export function priceTerm(segment: SegmentId, market: MarketId, consumer: number, yf: number): number {
  const sens = segmentDef(segment).priceSens * eraMods(market, yf).priceSens;
  return -sens * PRICE_COEF * priceSlope(consumer / referencePrice(market, segment, yf));
}

/** Past this many utility points either way, magazines and buyers talk about the price. */
export const PRICE_REMARK = 8;

/** How far above the class price (as a ratio) a car can go before it is called steep. */
export function steepPriceRatio(segment: SegmentId, market: MarketId, yf: number): number {
  const sens = segmentDef(segment).priceSens * eraMods(market, yf).priceSens;
  const lr = PRICE_REMARK / (sens * PRICE_COEF);
  const knee = Math.log(1 + PRICE_OVER_FROM);
  // Undo the steeper slope past the knee.
  return Math.exp(lr <= knee ? lr : knee + (lr - knee) / (1 + PRICE_OVER));
}

export const brandTerm = (reputation: number, segment: SegmentId) => (reputation - 50) * 0.12 * segmentDef(segment).brandSens;

/** Share of the country's buyers our showrooms reach (the dealer network, state by state). */
export function playerReach(state: GameState, market: MarketId): number {
  if (market === 'usa') return nationalReach(state, yearFloat(state.week));
  const m = state.markets[market];
  return dealerCoverage(m.dealerLevel, market === state.company.hq) * (0.35 + 0.65 * m.awareness);
}

/** A rival's reach: its own dealer network, plus the dealers it took over in mergers. */
export function rivalSize(companyId: string, yf: number, state?: GameState): number {
  const def = RIVALS.find((r) => r.id === companyId)!;
  return interp(def.size, yf) + (state?.rivals.find((c) => c.id === companyId)?.sizeBoost ?? 0);
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

/** Fit and finish from the body dies the car is built with. */
export function applyTooling(scores: Scores, tier: CarModel['tooling']): Scores {
  for (const [k, v] of Object.entries(toolingDef(tier).scores) as [AttrKey, number][]) scores[k] = Math.max(0, scores[k] + v);
  return scores;
}

export function modelScores(state: GameState, model: CarModel): { scores: Scores; appeal: Record<MarketId, number> } {
  if (model.cache && state.week - model.cache.week < 4) return model.cache;
  const yf = yearFloat(state.week);
  const scores = applyTooling(
    applyWorkshopPenalty(scoreStats(model.stats, yf, model.segment, model.perceivedReliability), workshopPenalty(state)),
    model.tooling,
  );
  // Platform over-sharing ("they are all the same car") hurts prestige.
  const siblings = state.models.filter((m) => m.status === 'active' && m.platformId === model.platformId).length;
  if (siblings > 3) scores.prestige = Math.max(0, scores.prestige - 6 * (siblings - 3));
  // "Any colour so long as it's black": the fast-drying black enamel oven limits choice.
  const blackOnly = state.lines.some((l) => l.modelId === model.id && l.stations.paint.some((id) => stationDef(id).blackOnly));
  if (blackOnly) scores.prestige = Math.max(0, scores.prestige - 5);
  // The racing team's fame rubs off on every car of the make.
  scores.prestige = Math.min(100, scores.prestige + Math.min(8, state.racing?.fame ?? 0));
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
  // A price war cuts the list price for a while.
  const cut = rm.priceCut && week < rm.priceCut.until ? rm.priceCut.mult : 1;
  return (rm.price * priceLevel(yearFloat(week)) * cut) / rm.priceIndexAtLaunch;
}

// ---- offers & shares ----

/**
 * Buyers tire of a design little by little from the day it comes out (about an eighth of its buyers a
 * year), and faster once it is past four years old, whatever its specification.
 */
export const DATED_PER_YEAR = 1;
const DATED_OLD_FROM = 4;
const DATED_PER_OLD_YEAR = 2.5;
export function datedPenalty(ageYears: number): number {
  const a = Math.max(0, ageYears);
  return -Math.min(20, a * DATED_PER_YEAR + Math.max(0, a - DATED_OLD_FROM) * DATED_PER_OLD_YEAR);
}

/** How old a model looks: a facelift takes about three quarters of the years off. */
export function modelAgeYears(model: Pick<CarModel, 'launchWeek' | 'refreshWeek'>, week: number): number {
  const refresh = model.refreshWeek ?? model.launchWeek;
  return (week - refresh) / 52 + 0.25 * ((refresh - model.launchWeek) / 52);
}

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
  /** Negative: how dated the design looks. */
  age: number;
  /** Negative: a luxury or sports car everybody drives is no longer special. */
  exclusive?: number;
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
  const age = datedPenalty(modelAgeYears(model, state.week));
  const exclusive = exclusivityPenalty(model);
  const utility = appealUtility(ap[market]) + pt + brand + hype + age + exclusive;
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
    age,
    exclusive,
    reach,
    utility,
    weight: offerWeight(reach, utility),
  };
}

/**
 * A luxury or sports car is bought to stand out: once a quarter of the class drives the same model it
 * loses its allure (on the model's share of the class over the last months).
 */
export function exclusivityPenalty(model: Pick<CarModel, 'segment' | 'shareTrend'>): number {
  if (model.segment !== 'luxury' && model.segment !== 'sport') return 0;
  const over = (model.shareTrend ?? 0) - 0.25;
  return over > 0 ? -30 * over : 0;
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
  const reach = rivalSize(rm.companyId, yf, state) * (isImport ? 0.45 : 1);
  const age = datedPenalty((state.week - rm.launchWeek) / 52);
  const utility = appealUtility(ap[market]) + pt + brand + hype + age;
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
    age,
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
  /** Our models' weekly buyers, in all and state by state (only where we have showrooms). */
  player: { units: Record<string, number>; byState: Record<string, Partial<Record<StateId, number>>> };
}

/**
 * A class's buyers and how they split. Rivals and the small makers sell everywhere; our
 * cars only in the states with our showrooms, so our buyers are worked out state by state.
 * Our offers then carry the national weight that gives the same share, so ranks and
 * shares read the same everywhere else.
 */
export function segmentMarket(state: GameState, market: MarketId, segment: SegmentId): SegmentMarket {
  const yf = yearFloat(state.week);
  const offers: Offer[] = [];
  const mine: Offer[] = [];
  for (const m of state.models) {
    if (m.status === 'active' && m.segment === segment && m.markets.includes(market) && state.markets[market].unlocked) {
      const o = playerOffer(state, m, market);
      offers.push(o);
      mine.push(o);
    }
  }
  for (const rm of state.rivalModels) {
    if (rm.active && rm.segment === segment && rm.markets.includes(market)) offers.push(rivalOffer(state, rm, market));
  }
  // Where few named rivals compete, the many small makers fill the gap.
  const rivalCount = offers.filter((o) => o.kind === 'rival').length;
  const othersWeight = othersMass(yf) * (1 + 0.35 * Math.max(0, 3 - rivalCount)) * Math.exp(OTHERS_UTILITY / TAU);
  const rivalsWeight = offers.reduce((s, o) => s + (o.kind === 'rival' ? o.weight : 0), 0);
  const demand = weeklySegmentDemand(market, segment, yf);
  const player: SegmentMarket['player'] = { units: {}, byState: {} };
  if (!mine.length || demand <= 0) return { demand, offers, othersWeight, totalWeight: rivalsWeight + othersWeight, player };
  const split = playerStateDemand(
    state,
    mine.map((o) => ({ id: o.id, utility: o.utility, price: o.priceTerm })),
    demand,
    rivalsWeight + othersWeight,
    segment,
    yf,
  );
  const ours = Object.values(split.units).reduce((a, u) => a + u, 0);
  const totalWeight = (rivalsWeight + othersWeight) / Math.max(1e-6, 1 - ours / demand);
  for (const o of mine) o.weight = (split.units[o.id] / demand) * totalWeight;
  return { demand, offers, othersWeight, totalWeight, player: split };
}

/** Preview: expected weekly demand for a hypothetical price (used by the launch & pricing UI). */
export function demandAtPrice(state: GameState, model: CarModel, market: MarketId, basePrice: number): number {
  const original = model.price;
  const originalWeek = model.priceWeek;
  model.price = basePrice;
  model.priceWeek = state.week;
  // A car not yet on sale (a project's preview) is counted as if it were.
  const status = model.status;
  const listed = state.models.includes(model);
  if (!listed) state.models.push(model);
  model.status = 'active';
  try {
    return segmentMarket(state, market, model.segment).player.units[model.id] ?? 0;
  } finally {
    model.price = original;
    model.priceWeek = originalWeek;
    model.status = status;
    if (!listed) state.models.splice(state.models.indexOf(model), 1);
  }
}

export const SEGMENT_IDS: SegmentId[] = SEGMENTS.map((s) => s.id);
export const MARKET_IDS: MarketId[] = MARKETS.map((m) => m.id);
export { marketDef };
