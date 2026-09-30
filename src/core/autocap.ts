import { MAX_SLOTS, costIndex, lineBuildWeeks, newLineCost, overhead } from '../data/economy';
import { STAGES, STATIONS, stationDef } from '../data/stations';
import {
  LINE_SIZES,
  blackPaintIsFaster,
  emptyLine,
  expansionCost,
  lineOffline,
  lineReport,
  lineSizeFor,
  lineUpkeep,
  modernizeQuote,
  nextLineName,
  paybackMonths,
  paybackYears,
  reservedLines,
  stationPrice,
  stationResale,
  turnkeyQuote,
} from './factory';
import { DEALER_COMMISSION, slotCost } from '../data/economy';
import { MARKET_IDS, modelDemand, priceNow, weeklySegmentDemand } from './market';
import { boardVeto } from './shares';
import { HIKE_TOLERANCE } from './actions';
import { operatingWeekly } from './budget';
import { dealerUpkeep } from './game';
import { yearFloat } from './time';
import type { CarModel, GameState, ProductionLine, StageId } from './types';
import { earn, financeNow, log, money, spend } from './util';
import { msg, t } from '../i18n';
import { dec, fmtPercent } from '../i18n/format';

// "Talebi otomatik karşıla": for models that opt in, the factory grows while
// buyers wait and shrinks when they stop coming. Each month it buys the
// extra capacity that earns most for its price (a station at the bottleneck, a wider line,
// newer machines, or a whole new line the size the shortfall needs) and always keeps a cash reserve.
// It judges every purchase with the capacity planner's sum (factory.ts: paybackYears), counting only
// the cars buyers lastingly want.

const isRetooling = lineOffline;
const demandOf = (m: CarModel) => Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
const linesOf = (s: GameState, m: CarModel) => s.lines.filter((l) => l.modelId === m.id && !l.military);

function capacity(s: GameState, m: CarModel, lines: ProductionLine[], working: boolean): number {
  return lines.filter((l) => !working || !isRetooling(s, l)).reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
}

/** Buyers a week: last week's, or in the launch week (no sales yet) what the market forecasts. */
export function weeklyDemand(s: GameState, m: CarModel): number {
  return m.lastDemand ? demandOf(m) : modelDemand(s, m);
}

/** A new car's lasting demand starts at this share of its first week's buyers, the launch buzz still on. */
const TREND_START = 0.6;

/**
 * What buyers want a week once the launch buzz has faded (a lasting hit stays). In the launch week, with
 * no sales yet, it starts from the market's forecast.
 */
export function lastingDemand(s: GameState, m: CarModel): number {
  const d = weeklyDemand(s, m);
  return Math.min(d, m.demandTrend ?? (m.lastDemand ? d : TREND_START * d));
}

/**
 * Cars a week buyers lastingly want beyond what the model's lines build or soon will (lines being put
 * up or retooled count), with a little to spare. Automatic capacity builds for this; the capacity
 * planner shows the same figure.
 */
export function demandGap(s: GameState, m: CarModel): number {
  return lastingDemand(s, m) * 1.05 - capacity(s, m, linesOf(s, m), false);
}

const PRESTIGE_SEGMENTS: CarModel['segment'][] = ['luxury', 'sport'];

/** Plain cars may go black when the black enamel oven is much faster (Ford's choice); dear cars keep their colours. */
export function autoAllowsBlack(s: GameState, m: CarModel): boolean {
  const hasBlack = linesOf(s, m).some((l) => l.stations.paint.some((id) => stationDef(id).blackOnly));
  return hasBlack || (blackPaintIsFaster(yearFloat(s.week)) && !PRESTIGE_SEGMENTS.includes(m.segment));
}

/** Lines a model may have before automatic capacity builds it only full-size ones. */
export const SMALL_LINES = 3;

/**
 * How big a new line for this model is: the smallest that covers what buyers are missing (the capacity
 * planner's suggestion); once the model has three lines, a full-size one, so the factory grows in a
 * few big lines rather than dozens of small workshops (smaller shortfalls: the lines it has grow).
 */
export function newLineSize(s: GameState, m: CarModel, allowBlack: boolean, gap = demandGap(s, m)): number {
  return linesOf(s, m).length >= SMALL_LINES ? MAX_SLOTS : lineSizeFor(s, m, allowBlack, gap);
}

/**
 * Cash the automation never touches, and the tax owed. About six weeks of running costs, parts included,
 * but never more than half the till: a big maker's parts bill is paid by the cars it becomes, so a rich
 * company can still invest. And never less than six weeks of what the company pays whether its cars sell
 * or not (line wages, salaries, overheads, the dealer and service network, interest), or of its losses
 * when it loses more than that.
 */
export function autoReserve(s: GameState): number {
  const yf = yearFloat(s.week);
  const recent = s.finance.slice(-4);
  const running = recent.length ? recent.reduce((a, f) => a + f.materials + f.labor + f.salaries + f.other, 0) / recent.length : 0;
  const floor = Math.max(4000 * costIndex(yf), 6 * Math.max(fixedWeekly(s), -operatingWeekly(s)));
  return Math.max(floor, Math.min(6 * running, s.company.cash / 2)) + (s.company.taxOwed ?? 0);
}

/** What the company pays a week whether its cars sell or not: line wages, salaries, interest, overheads, the network. */
function fixedWeekly(s: GameState): number {
  const recent = s.finance.slice(-4);
  const paid = recent.length ? recent.reduce((a, f) => a + f.labor + f.salaries + f.interest, 0) / recent.length : 0;
  return paid + overhead(yearFloat(s.week), s.lines.length) + MARKET_IDS.reduce((a, mk) => a + dealerUpkeep(s, mk), 0);
}

/** Cash doing nothing: what the till holds beyond the reserve and a year of the company's fixed costs. */
export function idleCash(s: GameState): number {
  return Math.max(0, s.company.cash - autoReserve(s) - 52 * fixedWeekly(s));
}

/**
 * How many years new plant may take to pay for itself: two, or three while cash sits idle (money doing
 * nothing earns less than a slow line).
 */
export function autoHorizon(s: GameState): number {
  return idleCash(s) > 0 ? HORIZON_IDLE_CASH : HORIZON;
}

/** Weekly: build what sells and work a stock pile down. */
export function autoProductionRates(s: GameState) {
  for (const m of s.models) {
    if (m.status !== 'active' || !m.autoCapacity) continue;
    const cap = capacity(s, m, linesOf(s, m), true);
    if (cap <= 0) continue;
    const d = demandOf(m);
    m.productionRate = Math.min(1, Math.max(0, (d - (m.inventory - 2 * d) / 4) / cap));
  }
  // What buyers want over the last months, for building (launch buzz fades; a lasting hit stays). A car
  // launched this week has no sales yet: its trend starts from the market's forecast.
  for (const m of s.models) {
    if (m.status !== 'active') continue;
    const d = demandOf(m);
    m.demandTrend = m.demandTrend === undefined ? TREND_START * weeklyDemand(s, m) : m.demandTrend + (d - m.demandTrend) / 10;
    const yf = yearFloat(s.week);
    const seg = m.markets.reduce((a, mk) => a + weeklySegmentDemand(mk, m.segment, yf), 0);
    const share = seg > 0 ? Math.min(1, d / seg) : 0;
    m.shareTrend = m.shareTrend === undefined ? share : m.shareTrend + (share - m.shareTrend) / 13;
  }
}

/** Sell a line's surplus machines, one at a time, while it still builds `keep` cars a week. Returns the money back. */
function trimLine(s: GameState, m: CarModel, l: ProductionLine, keep: number): number {
  let refund = 0;
  for (let k = 0; k < 40; k++) {
    let bestCut: { stage: StageId; i: number; saving: number } | null = null;
    for (const st of STAGES) {
      if (l.stations[st.id].length <= 1) continue;
      l.stations[st.id].forEach((id, i) => {
        const trial = { ...l, stations: { ...l.stations, [st.id]: l.stations[st.id].filter((_, j) => j !== i) } };
        if (lineReport(s, trial, m.stats.complexity).throughput < keep) return;
        const saving = stationDef(id).upkeep;
        if (!bestCut || saving > bestCut.saving) bestCut = { stage: st.id, i, saving };
      });
    }
    if (!bestCut) break;
    const cut: { stage: StageId; i: number } = bestCut;
    const id = l.stations[cut.stage][cut.i];
    l.stations[cut.stage].splice(cut.i, 1);
    const back = stationResale(id, s.week);
    earn(s, back);
    refund += back;
  }
  return refund;
}


/** Months of far too much capacity before plant is sold. */
const SHRINK_MONTHS = 6;

/** New plant must pay for itself within this many years of the cars buyers lastingly want (three with idle cash). */
const HORIZON = 2;
const HORIZON_IDLE_CASH = 3;

/** A closed line's hall and conveyors fetch part of today's price. */
const shellResale = (yf: number, slots: number) => 0.4 * (newLineCost(yf) + expansionCost(yf, emptyLine('x', 'x').slots, slots));

/**
 * When nothing pays for itself: what would. A black-enamel line where it is faster, or the price at
 * which the best purchase (`best`, the one the model's `autoWhy` names) would pay back in time, while
 * buyers want far more than the factory builds.
 */
function wayOut(s: GameState, m: CarModel, best: Option, gap: number, marginOf: (o: Option) => number, allowBlack: boolean, cap: number, d: number, horizon: number): string | undefined {
  const yf = yearFloat(s.week);
  const years = (o: Option) => paybackYears(o.cost, o.gain, marginOf(o), gap);
  const hints: string[] = [];
  if (!allowBlack && blackPaintIsFaster(yf)) {
    const black = options(s, m, linesOf(s, m), true, 0, gap).filter((o) => years(o) <= horizon);
    if (black.length) {
      const fastest = black.reduce((a, b) => (years(b) < years(a) ? b : a));
      hints.push(t('siyah boyalı bir hat ~{n} ayda kendini öder (araba yalnız siyah olur, prestij −5); Fabrika’daki planlayıcıdan kurulabilir', { n: paybackMonths(years(fastest)) }));
    }
  }
  if (d > cap * 1.3) {
    // The margin a car the best purchase needs to pay for itself in time, and the price that gives it.
    const needed = best.cost / Math.max(0.01, Math.min(best.gain, gap) * 52 * horizon);
    const rise = (needed - marginOf(best)) / (1 - DEALER_COMMISSION) / priceNow(m, s.week);
    if (rise > 0 && rise < 0.6) {
      const young = (s.week - m.launchWeek) / 52 < 3 && rise > HIKE_TOLERANCE;
      const times = d / Math.max(0.1, cap);
      const p = { times: dec(times, times < 3 ? 1 : 0), rise: fmtPercent(Math.ceil(rise * 100) / 100, 0) };
      hints.push(
        young
          ? t('alıcılar üretimin {times} katını istiyor: fiyatı ~{rise} artırırsan sıradaki büyütme kendini öder (lansmandan sonraki üç yılda büyük zam dergileri kızdırır; makyajla birlikte yapmak daha güvenli)', p)
          : t('alıcılar üretimin {times} katını istiyor: fiyatı ~{rise} artırırsan sıradaki büyütme kendini öder', p),
      );
    }
  }
  if (hints.length === 2) return t('{a}; ya da {b}', { a: hints[0], b: hints[1] });
  return hints[0];
}

/**
 * Why automatic capacity stopped growing, in words (marked with msg(): show with t()). The model's
 * `autoWhy`, when set, says the same in numbers and is shown instead.
 */
export const AUTO_HOLD_TEXT: Record<NonNullable<CarModel['autoHold']>, string> = {
  war: msg('savaş sürerken fabrika büyütülmüyor'),
  margin: msg('yeni bir hatta bile araç başına kâr %8’in altında kalıyor: büyümek zararı büyütür, önce fiyatı ya da maliyeti düzelt'),
  cash: msg('kasa yetmiyor'),
  payback: msg('sıradaki büyütme kalıcı talep açığıyla yeterince çabuk kendini ödemiyor'),
  successor: msg('yeni kuşağı yolda: eskiyen arabaya fabrika kurulmuyor'),
  full: msg('hatlar dolu ve talep açığı yeni bir hat için küçük'),
};

/** Why automatic capacity is not growing, for a screen: in numbers when it has them. */
export function autoHoldText(m: CarModel): string {
  return m.autoWhy ?? (m.autoHold ? t(AUTO_HOLD_TEXT[m.autoHold]) : '');
}

/** What the automation bought, by the kind of purchase (the keys are also the `counts` keys). */
const PURCHASE_TEXT: Record<string, string> = {
  'siyah boya fırını': msg('{n} siyah boya fırını'),
  istasyon: msg('{n} istasyon'),
  'makine yenileme': msg('{n} makine yenileme'),
  genişletme: msg('{n} genişletme'),
  'hat yenileme': msg('{n} hat yenileme'),
  'yeni hat': msg('{n} yeni hat'),
};

const purchaseText = (counts: Record<string, number>) =>
  Object.entries(counts)
    .map(([k, n]) => t(PURCHASE_TEXT[k], { n }))
    .join(', ');

interface Option {
  cost: number;
  gain: number;
  counts: Record<string, number>;
  apply: () => void;
  /** Wages per car on the line as it will be: a new mass-production line pays far less per car than a craft workshop. */
  labour: number;
  /** What it is, in words. */
  label: string;
  /** A whole new line. */
  newLine?: boolean;
}

/** Wages per car of a line at full pace. */
const labourOf = (s: GameState, l: ProductionLine, throughput: number) => (throughput > 0 ? lineUpkeep(s, l, 1) / throughput : 0);

/**
 * The cheapest way to lift one line's output: keep adding the best station at
 * whichever section is the bottleneck (using free room first, then newer
 * machines, then a wider line) until the line actually builds more.
 */
function stepUp(s: GameState, m: CarModel, l: ProductionLine, allowBlack: boolean): Option | null {
  const yf = yearFloat(s.week);
  const best = (stage: StageId) =>
    STATIONS.filter((x) => x.stage === stage && x.year <= yf && (allowBlack || !x.blackOnly)).reduce((a, b) => (b.capacity > a.capacity ? b : a));
  const stations = Object.fromEntries(STAGES.map((st) => [st.id, [...l.stations[st.id]]])) as Record<StageId, string[]>;
  let slots = l.slots;
  let cost = 0;
  const counts: Record<string, number> = {};
  const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const base = lineReport(s, l, m.stats.complexity).throughput;
  for (let k = 0; k < 16; k++) {
    const r = lineReport(s, { ...l, slots, stations }, m.stats.complexity);
    if (r.throughput > base + 0.01) {
      return {
        cost,
        gain: r.throughput - base,
        labour: labourOf(s, { ...l, slots, stations }, r.throughput),
        counts,
        label: t('{line} hattına {what}', { line: l.name, what: purchaseText(counts) }),
        apply: () => {
          l.slots = slots;
          l.stations = stations;
        },
      };
    }
    const b = r.bottleneck;
    const top = best(b);
    const worst = stations[b].reduce((a, id) => (stationDef(id).capacity < stationDef(a).capacity ? id : a), stations[b][0]);
    if (stations[b].length < slots) {
      stations[b].push(top.id);
      cost += stationPrice(top.id, s.week);
      count(top.blackOnly ? 'siyah boya fırını' : 'istasyon');
    } else if (worst && stationDef(worst).capacity < top.capacity) {
      stations[b][stations[b].indexOf(worst)] = top.id;
      cost += stationPrice(top.id, s.week) - stationResale(worst, s.week);
      count('makine yenileme');
    } else if (slots < MAX_SLOTS) {
      cost += slotCost(yf, slots);
      slots += 1;
      stations[b].push(top.id);
      cost += stationPrice(top.id, s.week);
      count('genişletme');
    } else return null;
  }
  return null;
}

/** A new line in words: its size, and the black enamel oven when it has one. */
function newLineLabel(slots: number, plan: Record<StageId, string[]>): string {
  return plan.paint.some((id) => stationDef(id).blackOnly) ? t('{n} yerli siyah vernikli yeni hat', { n: slots }) : t('{n} yerli yeni hat', { n: slots });
}

function options(s: GameState, m: CarModel, lines: ProductionLine[], allowBlack: boolean, margin: number, gap: number): Option[] {
  const out: Option[] = [];
  for (const l of lines) {
    const o = stepUp(s, m, l, allowBlack);
    if (o) out.push(o);
    // Rebuild the whole line with today's balanced machines, in a hall as big as needed: an old
    // workshop line grows far better that way than one station at a time. Not more than once a
    // year, only for a real gain, and the two weeks without output count as a cost.
    const now = lineReport(s, l, m.stats.complexity).throughput;
    if (s.week - (l.rebuiltWeek ?? -1e6) < 52) continue;
    for (const k of LINE_SIZES.filter((x) => x >= l.slots)) {
      const q = modernizeQuote(l, s.week, allowBlack, k);
      const after = lineReport(s, { ...l, slots: k, stations: q.plan }, m.stats.complexity).throughput;
      if (after <= now * 1.25) continue;
      out.push({
        cost: Math.max(0, q.cost) + 2 * now * Math.max(0, margin),
        gain: after - now,
        labour: labourOf(s, { ...l, slots: k, stations: q.plan }, after),
        counts: { 'hat yenileme': 1 },
        label: t('{line} hattını {n} yerle yenilemek', { line: l.name, n: k }),
        apply: () => {
          l.slots = k;
          for (const st of STAGES) l.stations[st.id] = [...q.plan[st.id]];
          l.retoolUntilWeek = Math.max(l.retoolUntilWeek ?? 0, s.week + 2);
          l.rebuiltWeek = s.week;
        },
      });
    }
  }
  // A new turnkey line, as the capacity planner offers it: the size the missing demand needs, full size
  // once the model has three lines (not while the board vetoes new lines).
  const least = newLineSize(s, m, allowBlack, gap);
  for (const k of boardVeto(s) ? [] : LINE_SIZES.filter((x) => x >= least)) {
    const q = turnkeyQuote(s, m, allowBlack, k);
    out.push({
      cost: q.cost,
      gain: q.output,
      labour: q.labour,
      counts: { 'yeni hat': 1 },
      label: newLineLabel(k, q.plan),
      newLine: true,
      apply: () => {
        const line = emptyLine(`L${s.nextId++}`, nextLineName(s));
        line.slots = Math.max(line.slots, k);
        for (const st of STAGES) line.stations[st.id] = [...q.plan[st.id]];
        line.modelId = m.id;
        line.buildUntilWeek = s.week + lineBuildWeeks(yearFloat(s.week));
        s.lines.push(line);
      },
    });
  }
  return out.filter((o) => o.gain > 0.01);
}

/**
 * Why the best purchase is not made, in numbers: how many months it takes to pay for itself on the
 * cars buyers lastingly want, and, when that is less than it builds, on every car it builds (what the
 * capacity planner shows first).
 */
function paybackWhy(o: Option, gap: number, margin: number, horizon: number): string {
  const p = {
    what: o.label,
    cost: money(o.cost),
    gain: dec(o.gain, 1),
    gap: dec(Math.max(0, gap), 1),
    time: paybackTime(paybackYears(o.cost, o.gain, margin, gap)),
    limit: horizon,
  };
  return gap < o.gain
    ? t('en iyi seçenek {what} ({cost}, +{gain} araç/hf): ürettiği her araç satılsa {all} kendini öderdi, ama kalıcı talep üretimi (inşaattaki hatlar dahil) yalnız ~{gap} araç/hf aşıyor; bu kadar satışla {time} öder; otomatik kapasite en çok {limit} yıl bekler', {
        ...p,
        all: paybackTime(paybackYears(o.cost, o.gain, margin)),
      })
    : t('en iyi seçenek {what} ({cost}, +{gain} araç/hf) bu fiyatla {time} kendini öder; otomatik kapasite en çok {limit} yıl bekler', p);
}

/** "in ~9 months", or "in more than ten years" for plant that would hardly ever pay for itself. */
function paybackTime(years: number): string {
  return years > 10 ? t('on yıldan uzun sürede') : t('~{n} ayda', { n: paybackMonths(years) });
}

/**
 * Monthly: grow towards demand with the purchase that earns most for its price, but only while each
 * car earns a healthy margin and the purchase pays for itself within two years of the cars buyers
 * lastingly want (the capacity planner's sum); give back surplus lines when buyers stay away. During a
 * military contract lines work for the army, so nothing is sold off.
 */
export function autoCapacity(s: GameState, materialCost: (m: CarModel) => number) {
  const yf = yearFloat(s.week);
  const wartime = (s.flags.militaryUntil ?? 0) > yf;
  for (const m of s.models) {
    if (m.status !== 'active' || !m.autoCapacity) continue;
    const d = weeklyDemand(s, m);
    // Build for the demand that lasts, not the launch buzz.
    const dGrow = lastingDemand(s, m);
    const allowBlack = autoAllowsBlack(s, m);
    let cap = capacity(s, m, linesOf(s, m), false);
    const labourPerCar = () => {
      const ls = linesOf(s, m);
      const c = capacity(s, m, ls, false);
      return c > 0 ? ls.reduce((a, l) => a + lineUpkeep(s, l, 1), 0) / c : 0;
    };
    const net = priceNow(m, s.week) * (1 - DEALER_COMMISSION);
    let margin = net - materialCost(m) - labourPerCar();
    // What each car of the new capacity earns: on the line as it will be, not on today's workshop.
    const marginOf = (o: Option) => net - materialCost(m) - o.labour;
    let spent = 0;
    /** What this month's purchases earn a year on the cars buyers want (for the log's payback). */
    let earns = 0;
    const done: Record<string, number> = {};
    // A car whose successor is on the way gets no new plant.
    const successor = s.projects.some((p) => p.replacesModelId === m.id && p.kind !== 'facelift');
    // Why it is not growing, when buyers wait: shown on the model and factory screens.
    m.autoHold = undefined;
    m.autoWhy = undefined;
    m.autoHint = undefined;
    if (cap < dGrow * 1.05) m.autoHold = wartime ? 'war' : successor ? 'successor' : undefined;
    for (let i = 0; i < 24 && !wartime && !successor && cap < dGrow * 1.05; i++) {
      const budget = s.company.cash - autoReserve(s);
      const horizon = autoHorizon(s);
      const gap = dGrow * 1.05 - cap;
      // Judge each option by the cars buyers would actually take: the planner's sum on the shortfall.
      const years = (o: Option) => paybackYears(o.cost, o.gain, marginOf(o), gap);
      const all = options(s, m, linesOf(s, m), allowBlack, margin, gap);
      // Growing only pays where each new car earns a healthy margin.
      const healthyAll = all.filter((o) => marginOf(o) > 0.08 * net);
      // A small shortfall is left rather than a whole line built to stand idle.
      const healthy = healthyAll.filter((o) => !o.newLine || gap >= 0.35 * o.gain);
      const paying = healthy.filter((o) => years(o) <= horizon);
      const opts = paying.filter((o) => o.cost <= budget);
      if (!opts.length) {
        m.autoHold = !all.length ? 'full' : !healthyAll.length ? 'margin' : !healthy.length ? 'full' : !paying.length ? 'payback' : 'cash';
        if (m.autoHold === 'full' && healthyAll.length) {
          const line = healthyAll.filter((o) => o.newLine).reduce<Option | undefined>((a, b) => (!a || b.gain < a.gain ? b : a), undefined);
          if (line)
            m.autoWhy = t('yeni bir hat ({what}, {cost}) +{gain} araç/hf yapar ama kalıcı talep üretimi (inşaattaki hatlar dahil) yalnız ~{gap} araç/hf aşıyor: hat çoğu zaman boş kalırdı', {
              what: line.label,
              cost: money(line.cost),
              gain: dec(line.gain, 1),
              gap: dec(gap, 1),
            });
        }
        if (m.autoHold === 'payback') {
          const best = healthy.reduce((a, b) => (years(b) < years(a) ? b : a));
          m.autoWhy = paybackWhy(best, gap, marginOf(best), horizon);
          m.autoHint = wayOut(s, m, best, gap, marginOf, allowBlack, cap, d, horizon);
        }
        if (m.autoHold === 'cash') {
          const best = paying.reduce((a, b) => (b.cost < a.cost ? b : a));
          const y = years(best);
          const cost = money(best.cost);
          const spare = money(Math.max(0, budget));
          m.autoHint =
            y < 1
              ? t('sıradaki büyütme ({what}) ~{cost} tutuyor ve ~{n} ayda kendini öder; kasada ayrılabilen {spare} (birkaç haftalık gider ve vergi yedekte). Banka kredisi alırsan ya da kasa birikince otomatik kapasite büyütür', {
                  what: best.label,
                  cost,
                  n: paybackMonths(y),
                  spare,
                })
              : t('sıradaki büyütme ({what}) ~{cost} tutuyor ve ~{years} yılda kendini öder; kasada ayrılabilen {spare} (birkaç haftalık gider ve vergi yedekte). Banka kredisi alırsan ya da kasa birikince otomatik kapasite büyütür', {
                  what: best.label,
                  cost,
                  years: dec(y, 1),
                  spare,
                });
        }
        break;
      }
      m.autoHold = undefined;
      // The most earnings for the money: capacity buyers use, times what each car earns on it.
      const worth = (o: Option) => (Math.min(o.gain, gap) * marginOf(o)) / Math.max(1, o.cost);
      const pick = opts.reduce((a, b) => (worth(b) > worth(a) ? b : a));
      spend(s, pick.cost, 'investment');
      const f = financeNow(s);
      f.auto = (f.auto ?? 0) + pick.cost;
      m.autoSpent = (m.autoSpent ?? 0) + pick.cost;
      earns += Math.min(pick.gain, gap) * marginOf(pick) * 52;
      pick.apply();
      spent += pick.cost;
      for (const [k, n] of Object.entries(pick.counts)) done[k] = (done[k] ?? 0) + n;
      cap = capacity(s, m, linesOf(s, m), false);
      margin = net - materialCost(m) - labourPerCar();
    }
    if (spent > 0) {
      log(
        s,
        t('Otomatik kapasite: {name} için {what} ({cost}; ~{n} ayda kendini öder). Kapasite {cap} araç/hf, talep {demand}.', {
          name: m.name,
          what: purchaseText(done),
          cost: money(spent),
          n: paybackMonths(spent / Math.max(1, earns)),
          cap: dec(cap, 1),
          demand: dec(d, 1),
        }),
        'info',
      );
    }
    // Shrink: after half a year with far more capacity than buyers, sell the smallest lines
    // (at most a quarter of them a month) down to 40% above demand. A slump that passes (a
    // recession, the months after a war) does not sell plant that would cost dear to build again.
    // Lines a project has ordered its dies for, and the lines of a car whose successor is coming, are kept.
    const replacing = s.projects.some((p) => p.replacesModelId === m.id);
    const reserved = reservedLines(s);
    const lines = linesOf(s, m);
    const sellable = replacing ? [] : lines.filter((l) => !reserved.has(l.id));
    if (!wartime && cap > 1.6 * d) m.lowDemandMonths = (m.lowDemandMonths ?? 0) + 1;
    else m.lowDemandMonths = 0;
    if ((m.lowDemandMonths ?? 0) >= SHRINK_MONTHS && lines.length === 1 && !replacing) {
      // A single line gives back machines instead: the least useful ones, while it still builds 40% above demand.
      const refund = trimLine(s, m, lines[0], 1.4 * d);
      if (refund > 0) {
        const f = financeNow(s);
        f.auto = (f.auto ?? 0) - refund;
        m.autoSpent = (m.autoSpent ?? 0) - refund;
        log(s, t('Otomatik kapasite: {name} için talep düştü; {line} hattındaki fazla makineler satıldı ({refund}).', { name: m.name, line: lines[0].name, refund: money(refund) }), 'warn');
      }
      m.lowDemandMonths = 0;
    }
    if ((m.lowDemandMonths ?? 0) >= SHRINK_MONTHS && sellable.length) {
      const bySize = [...sellable].sort((a, b) => lineReport(s, a, m.stats.complexity).throughput - lineReport(s, b, m.stats.complexity).throughput);
      let sold = 0;
      let refund = 0;
      const limit = Math.max(1, Math.floor(lines.length / 4));
      for (const l of bySize) {
        const t = lineReport(s, l, m.stats.complexity).throughput;
        if (sold >= limit || linesOf(s, m).length <= 1 || cap - t < 1.4 * d) break;
        refund += STAGES.reduce((a, st) => a + l.stations[st.id].reduce((b, id) => b + stationResale(id, s.week), 0), 0) + shellResale(yf, l.slots);
        s.lines = s.lines.filter((x) => x !== l);
        cap -= t;
        sold++;
      }
      if (sold) {
        earn(s, refund);
        const f = financeNow(s);
        f.auto = (f.auto ?? 0) - refund;
        m.autoSpent = (m.autoSpent ?? 0) - refund;
        log(s, t('Otomatik kapasite: {name} için talep düştü; {n} hat kapatıldı, makineler satıldı ({refund}).', { name: m.name, n: sold, refund: money(refund) }), 'warn');
      }
      m.lowDemandMonths = 0;
    }
  }
}
