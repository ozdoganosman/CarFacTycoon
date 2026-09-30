import { costIndex, priceLevel } from '../data/economy';
import { marketSize } from '../data/markets';
import { interp } from '../data/tech';
import { companyValue } from './game';
import { weekOfYear, yearFloat, yearOf } from './time';
import type { BoardYear, GameState, ShareState } from './types';
import { clamp, decide, log, money, pushModal, spend } from './util';
import { pctWith } from './turkish';
import { isTurkish, t } from '../i18n';
import { fmtPercent } from '../i18n/format';

// Selling shares on the stock exchange: money now, then a board that wants the
// company to grow every year and pay its shareholders. Missed targets wear down
// its confidence; at the end it votes the founder out.

/** Wall Street took to motor companies after the first great mergers. */
export const IPO_YEAR = 1908;
/** The founder always keeps the majority. */
export const MAX_FLOAT = 0.49;
export const FLOAT_STEPS = [0.1, 0.2, 0.3, 0.4, 0.49];
export const PAYOUT_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1];
/** Bankers' fee and the discount new shares are sold at. */
const ISSUE_COST = 0.08;
/** Shares bought back cost more than the market price. */
const BUYBACK_PREMIUM = 1.1;
/** Buying pushes the price up: every 1% of the company bought back in a year makes the next 1% dearer by 1%. */
const BUYBACK_PUSH = 1;
/** A raider sells its block only at a steep premium. */
export const GREENMAIL_PREMIUM = 1.35;
// The board hardens a step at a time: a warning, then a veto, then the last warning. The texts carry
// the Turkish suffixes of these numbers ("40’ın", "35’in", "25’in").
/** Below this the board gives its last warning. */
export const ULTIMATUM_AT = 25;
/** Below this the board warns. */
export const WARNING_AT = 40;
/** Below this it vetoes racing, buying rivals and new lines. One bad year from above the warning never gets here. */
export const VETO_AT = 35;
/** The dividend the board expects: half the profit, rising a little every year (at most three quarters). */
const DIVIDEND_SHARE = 0.5;
const DIVIDEND_RISE = 1.05;
const DIVIDEND_CAP = 0.75;
/** A rival on the board: stricter targets and less patience. */
const SEAT_GROWTH = 0.04;
const SEAT_DIVIDEND = 1.15;
const SEAT_ANGER = 1.3;

/**
 * The stock market's mood: the long boom of the twenties, the crash of 1929 and the slow
 * recovery. Selling shares in 1928 raises a fortune; buying them back in 1932 is cheap.
 */
export function stockMood(yf: number): number {
  return interp(
    [
      [1900, 0.9],
      [1915, 1],
      [1921, 0.85],
      [1924, 1.05],
      [1928, 1.55],
      [1929.75, 1.75],
      [1930, 1.05],
      [1932.5, 0.45],
      [1937, 0.85],
      [1938, 0.65],
      [1942, 0.7],
      [1946, 0.95],
      [1950, 1],
      [1960, 1.35],
    ],
    yf,
  );
}

/** The stock market's mood in words, in the player's language ("Borsa şu an …"). */
export function moodName(mood: number): string {
  if (mood >= 1.4) return t('çılgın bir yükselişte');
  if (mood >= 1.15) return t('coşkulu');
  if (mood >= 0.9) return t('sakin');
  if (mood >= 0.65) return t('durgun');
  return t('çöküşte');
}

/** What the stock market pays for a company worth `value`: the mood of the day and the board's faith in it. */
function capFor(s: GameState, value: number): number {
  const conf = s.shares ? 0.75 + 0.5 * (s.shares.confidence / 100) : 1;
  return Math.max(0, value) * stockMood(yearFloat(s.week)) * conf;
}

/** What the stock market pays for the whole company: its worth, the mood of the day and the board's faith in it. */
export function marketCap(s: GameState): number {
  return capFor(s, companyValue(s));
}

/** The part of the company the founder still owns. */
export const founderShare = (s: GameState) => 1 - (s.shares?.float ?? 0);

export function canGoPublic(s: GameState): { ok: boolean; why?: string } {
  const yf = yearFloat(s.week);
  if (s.shares) return { ok: false, why: t('Şirket zaten borsada.') };
  if (yf < IPO_YEAR) return { ok: false, why: t('Borsa otomobil şirketlerine {year}’den sonra ısınır.', { year: IPO_YEAR }) };
  if (s.years.length < 3) return { ok: false, why: t('Yatırımcılar en az üç yıllık defter görmek ister.') };
  const last = s.years[s.years.length - 1];
  if (last.profit <= 0) return { ok: false, why: t('Geçen yılı zararla kapattın: kâr etmeyen şirketin hissesini kimse almaz.') };
  const min = minValue(yf);
  if (companyValue(s) < min) return { ok: false, why: t('Şirket değeri en az {value} olmalı.', { value: money(min) }) };
  return { ok: true };
}

const minValue = (yf: number) => 150000 * costIndex(yf);

/** Cash that selling this share of the company brings in. */
export function issueProceeds(s: GameState, pct: number): number {
  return marketCap(s) * pct * (1 - ISSUE_COST);
}

/** Interest the shareholders' money earns while it is in the company: a listing is no free loan. */
const BASIS_RATE = 0.06;
/** Buying shares back under the last warning is a panic the market makes pay for. */
const ULTIMATUM_BUYBACK = 1.5;

/** What the outside shareholders paid for the whole company, grown by interest to today. */
export function basisNow(sh: ShareState, week: number): number {
  return (sh.basis ?? 0) * Math.pow(1 + BASIS_RATE, Math.max(0, week - (sh.basisWeek ?? week)) / 52);
}

/** Record a sale of `pct` of the company for the whole-company price `value`. */
function addBasis(sh: ShareState, week: number, pct: number, value: number) {
  const before = sh.float;
  sh.basis = (basisNow(sh, week) * before + value * pct) / Math.max(1e-6, before + pct);
  sh.basisWeek = week;
}

/** Shares bought back so far this year and what they cost. */
export function boughtThisYear(s: GameState): { pct: number; cash: number } {
  const b = s.shares?.bought;
  return b && b.year === yearOf(s.week) ? b : { pct: 0, cash: 0 };
}

/**
 * Shares bought back cost the market price and a premium, never less than what they were sold for
 * plus interest, and half as much again under the board's last warning. Buying pushes the price up:
 * every share bought back this year makes the next one dearer, and the cash paid for the earlier
 * slices does not make the company (and so the next slice) look cheaper.
 */
export function buybackCost(s: GameState, pct: number): number {
  const sh = s.shares;
  const back = boughtThisYear(s);
  const price = Math.max(capFor(s, companyValue(s) + back.cash) * BUYBACK_PREMIUM, sh ? basisNow(sh, s.week) : 0);
  // The push grows along the slice: buying it at once costs what buying it bit by bit would.
  const push = 1 + BUYBACK_PUSH * (back.pct + pct / 2);
  return price * pct * push * (sh?.ultimatum ? ULTIMATUM_BUYBACK : 1);
}

/** How far over its market price a slice of `pct` is bought back now (0.1 = 10%). */
export function buybackPremium(s: GameState, pct: number): number {
  const market = marketCap(s) * pct;
  return market > 0 ? buybackCost(s, pct) / market - 1 : 0;
}

/** The outside share changes: the year's dividend target follows it (the board asks for its shareholders' part). */
function setFloat(sh: ShareState, float: number) {
  if (sh.float > 0) sh.target.dividend *= Math.max(0, float) / sh.float;
  sh.float = float;
}

/** Shares on the open market (a raider's block is not for sale). */
export const freeFloat = (s: GameState) => Math.max(0, (s.shares?.float ?? 0) - (s.shares?.raider?.stake ?? 0));

export type ShareResult = { ok: boolean; error?: string };

export function goPublic(s: GameState, pct: number): ShareResult {
  const can = canGoPublic(s);
  if (!can.ok) return { ok: false, error: can.why };
  const share = clamp(pct, 0.05, MAX_FLOAT);
  const cap = marketCap(s);
  const cash = issueProceeds(s, share);
  s.company.cash += cash;
  const year = yearOf(s.week);
  // A company listed late in the year is first judged on the next one.
  const first = weekOfYear(s.week) < 26 ? year : year + 1;
  s.shares = {
    float: share,
    since: s.week,
    confidence: 60,
    // Low at first: raising it is the player's call (money out of the till).
    payout: 0.2,
    target: { year: first, growth: 0, dividend: 0 },
    history: [],
    dividends: 0,
    basis: cap,
    basisWeek: s.week,
  };
  s.shares.target = nextTarget(s, first);
  log(
    s,
    t('Halka arz: şirketin {pct}’i borsada satıldı, kasaya {cash} girdi. Artık her yıl yönetim kuruluna hesap vereceksin.', {
      pct: fmtPercent(share, 0),
      cash: money(cash),
    }),
    'good',
  );
  decide(s, 'shares', `Halka arz %${Math.round(share * 100)}: ${money(cash)}`);
  return { ok: true };
}

/** More shares for more money: the owners' stake shrinks, the board frowns. */
export function issueShares(s: GameState, pct: number): ShareResult {
  const sh = s.shares;
  if (!sh) return { ok: false, error: t('Şirket borsada değil.') };
  if (sh.float + pct > MAX_FLOAT + 1e-6) return { ok: false, error: t('Kontrolü kaybetmemek için en fazla {pct} dışarıda olabilir.', { pct: fmtPercent(MAX_FLOAT, 0) }) };
  const cap = marketCap(s);
  const cash = issueProceeds(s, pct);
  s.company.cash += cash;
  addBasis(sh, s.week, pct, cap);
  setFloat(sh, sh.float + pct);
  sh.confidence = clamp(sh.confidence - 4, 0, 100);
  log(
    s,
    t('Yeni hisse: şirketin {pct}’i daha satıldı, kasaya {cash} girdi. Hissedarlar paylarının sulandığından hoşnut değil.', { pct: fmtPercent(pct, 0), cash: money(cash) }),
    'info',
  );
  decide(s, 'shares', `Yeni hisse %${Math.round(pct * 100)}: ${money(cash)}`);
  return { ok: true };
}

/** Buy shares back: dear, but every share bought is one less owner to answer to. */
export function buyBack(s: GameState, pct: number): ShareResult {
  const sh = s.shares;
  if (!sh) return { ok: false, error: t('Şirket borsada değil.') };
  const take = Math.min(pct, freeFloat(s));
  if (take <= 0.001) return { ok: false, error: t('Piyasada geri alınacak hisse kalmadı.') };
  const cost = buybackCost(s, take);
  if (s.company.cash < cost) return { ok: false, error: t('Kasada {cash} yok.', { cash: money(cost) }) };
  // Paid to shareholders, like a dividend: not a cost of running the company.
  spend(s, cost, 'dividend');
  const back = boughtThisYear(s);
  sh.bought = { year: yearOf(s.week), pct: back.pct + take, cash: back.cash + cost };
  // Fewer outside shares: the year's dividend target shrinks with them.
  setFloat(sh, sh.float - take);
  sh.confidence = clamp(sh.confidence + 3, 0, 100);
  decide(s, 'shares', `Hisse geri alımı %${Math.round(take * 100)}: ${money(cost)}`);
  if (sh.float < 0.005) {
    delete s.shares;
    log(s, t('Son hisseler de geri alındı ({cash}): şirket yeniden tamamen senin, yönetim kurulu dağıldı.', { cash: money(cost) }), 'good');
  } else
    log(
      s,
      t('Hisse geri alımı: şirketin {pct} {cash} karşılığında geri alındı. Yönetim kurulunun {year} temettü hedefi dışarıda kalan paya göre {target} oldu.', {
        pct: pctWith(take, 'poss'),
        cash: money(cost),
        year: sh.target.year,
        target: money(sh.target.dividend),
      }),
      'info',
    );
  return { ok: true };
}

export function setPayout(s: GameState, payout: number) {
  if (!s.shares) return;
  s.shares.payout = clamp(payout, 0, 1);
  decide(s, 'payout', `Temettü oranı %${Math.round(s.shares.payout * 100)}`);
}

/** How the whole American car market grows in money from one year to the next. */
export function marketGrowth(year: number): number {
  const value = (y: number) => marketSize('usa', y + 0.5) * priceLevel(y + 0.5);
  return value(year) / value(year - 1) - 1;
}

/**
 * The board's targets for a year. Revenue must beat the market (less so for a maker that already
 * sells a big share), and more after a very good year: success raises expectations. The outside
 * shareholders want half the profit, and a dividend a little bigger than last year's; when the
 * market shrinks the board expects the dividend to shrink with the revenue. A rival on the board
 * asks for more of both.
 */
export function nextTarget(s: GameState, year: number): ShareState['target'] {
  const sh = s.shares!;
  const last = s.years.find((y) => y.year === year - 1) ?? s.years[s.years.length - 1];
  const share = last?.shareByMarket.usa ?? 0;
  const seat = sh.seat ? 1 : 0;
  const judged = sh.history.find((b) => b.year === year - 1);
  const raised = judged ? clamp((judged.growth - judged.targetGrowth - 0.05) * 0.3, 0, 0.06) : 0;
  // The post-war boom is judged against a calmer market; in the crash the board follows the market
  // down, and while the lines build for the army (1942-45) it expects no growth at all.
  const war = year >= 1942 && year <= 1945;
  const growth = war ? -0.5 : clamp(marketGrowth(year) + 0.03 * Math.max(0, 1 - 2 * share) + raised + SEAT_GROWTH * seat, -0.4, 0.2);
  const profit = Math.max(0, last?.profit ?? 0);
  const rising = Math.min((judged?.full ?? 0) * DIVIDEND_RISE, DIVIDEND_CAP * profit);
  const crisis = 1 + Math.min(0, growth);
  const dividend = sh.float * Math.max(DIVIDEND_SHARE * profit, rising) * (seat ? SEAT_DIVIDEND : 1) * crisis;
  return { year, growth, dividend };
}

/** What the board forbids while it has lost faith (undefined when it forbids nothing). */
export function boardVeto(s: GameState): string | undefined {
  const sh = s.shares;
  if (!sh || sh.confidence >= VETO_AT) return undefined;
  return t('Yönetim kurulu veto etti (güven {confidence}/100): yarış, rakip satın alma ve yeni hat yok. Güven {limit}’in üstüne çıkınca kalkar.', {
    confidence: Math.round(sh.confidence),
    limit: VETO_AT,
  });
}

/** The dividend a year's profit pays the outside shareholders at the chosen payout. */
export function dividendFor(s: GameState, profit: number): number {
  const sh = s.shares;
  return sh ? sh.float * sh.payout * Math.max(0, profit) : 0;
}

/**
 * This year so far and where it is heading: the year's revenue and profit to date, plus the
 * rest of the year at the pace of the last three months.
 */
export function boardOutlook(s: GameState) {
  const sh = s.shares;
  if (!sh) return null;
  const year = yearOf(s.week);
  const cost = (f: GameState['finance'][number]) =>
    f.materials + f.labor + f.salaries + f.dealers + (f.freight ?? 0) + f.marketing + f.rnd + f.warranty + f.interest + f.other + (f.tax ?? 0);
  const weeks = s.finance.filter((f) => yearOf(f.week) === year);
  const revenue = weeks.reduce((a, f) => a + f.revenue, 0);
  const profit = revenue - weeks.reduce((a, f) => a + cost(f), 0);
  const recent = s.finance.slice(-13);
  const n = Math.max(1, recent.length);
  const left = 52 - weeks.length;
  const pace = recent.reduce((a, f) => a + f.revenue, 0) / n;
  // The yearly tax bill falls in the first weeks: leave it out of the pace.
  const pacedProfit = recent.reduce((a, f) => a + f.revenue - cost(f) + (f.tax ?? 0), 0) / n;
  const last = s.years.find((y) => y.year === year - 1);
  const prev = last?.revenue ?? 0;
  const prevProfit = last?.profit ?? 0;
  const projected = revenue + left * pace;
  const needed = prev * (1 + sh.target.growth);
  const projectedProfit = profit + left * pacedProfit;
  // Profit counts too: growing it as much as the target asks meets the growth target (not after a loss year).
  const neededProfit = prevProfit > 0 ? prevProfit * (1 + sh.target.growth) : undefined;
  const dividend = dividendFor(s, projectedProfit);
  return {
    judged: sh.target.year === year,
    revenue,
    projected,
    needed,
    prev,
    profit: projectedProfit,
    prevProfit,
    neededProfit,
    dividend,
    /** On course, at this pace, for the growth target (by revenue or by profit) and for the dividend. */
    growthOk: projected >= needed || (neededProfit !== undefined && projectedProfit >= neededProfit),
    dividendOk: dividend >= sh.target.dividend * 0.98,
  };
}

/**
 * The year closes: pay the dividend, hold the board meeting, set the next targets.
 * Returns true when the founder is voted out.
 */
export function boardYear(s: GameState, year: number): boolean {
  const sh = s.shares;
  if (!sh) return false;
  const y = s.years.find((x) => x.year === year);
  if (!y) return false;
  const dividend = dividendFor(s, y.profit);
  if (dividend > 0) {
    spend(s, dividend, 'dividend');
    sh.dividends += dividend;
  }
  if (sh.target.year !== year) {
    if (sh.target.year < year) sh.target = nextTarget(s, year + 1);
    return false;
  }
  const last = s.years.find((x) => x.year === year - 1);
  const prev = last?.revenue ?? 0;
  const growth = prev > 0 ? y.revenue / prev - 1 : sh.target.growth;
  // Profit counts too: a year whose profit grew as much as the target asked is a year of growth,
  // even when sales dipped after a boom (not after a loss year: any profit would look like growth).
  const profitGrowth = last && last.profit > 0 ? y.profit / last.profit - 1 : undefined;
  const best = Math.max(growth, profitGrowth ?? -Infinity);
  const grew = best >= sh.target.growth - 0.01;
  const byProfit = grew && growth < sh.target.growth - 0.01;
  const paid = dividend >= sh.target.dividend * 0.98;
  const before = sh.confidence;
  // A short memory: the credit of good years fades by half every year ("what have you done lately?"),
  // so a good run forgives one or two bad years, not a decade.
  if (sh.confidence > 50) sh.confidence = 50 + (sh.confidence - 50) * 0.5;
  // One bad year after a good run costs about 15 points, the worst about 24.
  let delta = grew ? 5 + Math.min(4, Math.max(0, best - sh.target.growth) * 20) : -(5 + Math.min(7, (sh.target.growth - best) * 30));
  // Shareholders who got far less than they were promised are angrier than those a little short.
  const short = sh.target.dividend > 0 ? clamp(1 - dividend / sh.target.dividend, 0, 1) : 0;
  delta += paid ? 5 : -(4 + Math.min(8, short * 12));
  if (y.profit < 0) delta -= 4;
  if (sh.seat && delta < 0) delta *= SEAT_ANGER;
  sh.confidence = clamp(sh.confidence + delta, 0, 100);
  // The board hardens a step at a time: from above the warning line one bad year (the fading credit
  // included) ends at worst in a warning, never straight in a veto or the last warning.
  if (before >= WARNING_AT) sh.confidence = Math.max(sh.confidence, VETO_AT);
  const met = grew && paid;
  const entry: BoardYear = {
    year,
    growth,
    profitGrowth,
    targetGrowth: sh.target.growth,
    dividend,
    targetDividend: sh.target.dividend,
    profit: y.profit,
    met,
    confidence: sh.confidence,
    full: sh.float > 0 ? dividend / sh.float : 0,
  };
  sh.history.push(entry);
  if (sh.history.length > 60) sh.history.shift();
  const pctTxt = (v: number) =>
    isTurkish() ? `${v >= 0 ? '+' : '−'}%${Math.abs(Math.round(v * 1000) / 10)}` : `${v >= 0 ? '+' : '−'}${fmtPercent(Math.abs(Math.round(v * 1000) / 1000), 1)}`;
  const report = {
    year,
    growth: pctTxt(growth),
    target: pctTxt(sh.target.growth),
    dividend: money(dividend),
    targetDividend: money(sh.target.dividend),
    before: Math.round(before),
    after: Math.round(sh.confidence),
  };
  const verdict = met
    ? t('Yönetim kurulu, {year}: ciro {growth} (hedef {target}), temettü {dividend} (hedef {targetDividend}). Hedefler tuttu. Güven {before} → {after}.', report)
    : t('Yönetim kurulu, {year}: ciro {growth} (hedef {target}), temettü {dividend} (hedef {targetDividend}). Hedefler tutmadı. Güven {before} → {after}.', report);
  const why = byProfit ? t('Ciro hedefin altında kaldı ama kâr {growth} büyüdü: kurul büyüme hedefini tutmuş saydı.', { growth: pctTxt(profitGrowth!) }) : '';
  log(s, why ? `${verdict} ${why}` : verdict, met ? 'good' : 'warn');
  // Voted out only after the last warning went unheeded: nobody is thrown out without one.
  if (sh.ultimatum && !met) return true;
  if (sh.ultimatum && met) {
    delete sh.ultimatum;
    log(s, t('Yönetim kurulu hedeflerin tutmasından memnun: son uyarı geri çekildi.'), 'good');
  } else if (sh.confidence < ULTIMATUM_AT) {
    sh.ultimatum = true;
    sh.confidence = Math.max(sh.confidence, 5);
    pushModal(s, { kind: 'event', eventId: 'board-ultimatum' });
  } else if ((sh.confidence < VETO_AT && before >= VETO_AT) || (sh.confidence < WARNING_AT && before >= WARNING_AT)) {
    // The warning, or the veto after it: the pop-up tells which.
    pushModal(s, { kind: 'event', eventId: 'board-warning' });
  }
  // Pressure before the end: no money for racing while the board has lost faith.
  if (sh.confidence < VETO_AT && s.racing?.level) {
    s.racing.level = 0;
    log(s, t('Yönetim kurulu yarış bütçesini kesti: takım dağıtıldı.'), 'warn');
  }
  sh.target = nextTarget(s, year + 1);
  return false;
}

/** A rival bought into the company: let it on the board. */
export function grantSeat(s: GameState) {
  const sh = s.shares;
  if (!sh?.raider) return;
  sh.seat = sh.raider.company;
  sh.confidence = clamp(sh.confidence + 4, 0, 100);
  sh.target = nextTarget(s, sh.target.year);
}

/** Buy the raider's block back at its price. */
export function greenmail(s: GameState) {
  const sh = s.shares;
  if (!sh?.raider) return;
  const cost = marketCap(s) * sh.raider.stake * GREENMAIL_PREMIUM;
  spend(s, cost, 'dividend');
  setFloat(sh, Math.max(0, sh.float - sh.raider.stake));
  delete sh.raider;
  delete sh.seat;
  if (sh.float < 0.005) delete s.shares;
}

/** Drown the raider's block in new shares sold to friendly banks. */
export function dilute(s: GameState) {
  const sh = s.shares;
  if (!sh?.raider) return;
  const pct = Math.min(0.1, MAX_FLOAT - sh.float);
  addBasis(sh, s.week, pct, marketCap(s));
  s.company.cash += issueProceeds(s, pct);
  setFloat(sh, sh.float + pct);
  sh.confidence = clamp(sh.confidence - 8, 0, 100);
  delete sh.raider;
  delete sh.seat;
}
