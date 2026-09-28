import { MAX_SLOTS, costIndex, lineBuildWeeks, slotCost } from '../data/economy';
import { STAGES, STATIONS, stationDef } from '../data/stations';
import { emptyLine, lineOffline, lineReport, lineUpkeep, nextLineName, planBalancedLine, reservedLines, retoolCost, stationPrice, stationResale, turnkeyLineCost } from './factory';
import { DEALER_COMMISSION } from '../data/economy';
import { priceNow } from './market';
import { yearFloat } from './time';
import type { CarModel, GameState, ProductionLine, StageId } from './types';
import { earn, financeNow, log, money, spend } from './util';

// "Talebi otomatik karşıla": for models that opt in, the factory grows while
// buyers wait and shrinks when they stop coming. Each month it buys the
// cheapest extra capacity first (a station at the bottleneck, a wider line,
// newer machines, then a whole new line) and always keeps a cash reserve.

const isRetooling = lineOffline;
const demandOf = (m: CarModel) => Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
const linesOf = (s: GameState, m: CarModel) => s.lines.filter((l) => l.modelId === m.id && !l.military);

function capacity(s: GameState, m: CarModel, lines: ProductionLine[], working: boolean): number {
  return lines.filter((l) => !working || !isRetooling(s, l)).reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
}

/** Cash the automation never touches: about six weeks of running costs. */
function reserve(s: GameState): number {
  const recent = s.finance.slice(-4);
  const weekly = recent.length ? recent.reduce((a, f) => a + f.materials + f.labor + f.salaries + f.other, 0) / recent.length : 0;
  return Math.max(4000 * costIndex(yearFloat(s.week)), 6 * weekly) + (s.company.taxOwed ?? 0);
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

/** Why automatic capacity stopped growing, in words. */
export const AUTO_HOLD_TEXT: Record<NonNullable<CarModel['autoHold']>, string> = {
  war: 'savaş sürerken fabrika büyütülmüyor',
  margin: 'araç başına kâr %8’in altında: büyümek zararı büyütür, önce fiyatı ya da maliyeti düzelt',
  cash: 'kasa yetmiyor (birkaç haftalık gider ve vergi taksiti yedekte tutuluyor)',
  payback: 'sıradaki büyütme bu fiyatla bir buçuk yılda kendini ödemiyor',
  full: 'hatlar dolu ve talep açığı yeni bir hat için küçük',
};

interface Option {
  cost: number;
  gain: number;
  counts: Record<string, number>;
  apply: () => void;
}

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
        counts,
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
      count('istasyon');
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

function options(s: GameState, m: CarModel, lines: ProductionLine[], allowBlack: boolean): Option[] {
  const yf = yearFloat(s.week);
  const out: Option[] = [];
  for (const l of lines) {
    const o = stepUp(s, m, l, allowBlack);
    if (o) out.push(o);
  }
  const plan = planBalancedLine(yf, allowBlack);
  const perLine = lineReport(s, { ...emptyLine('x', 'x'), slots: MAX_SLOTS, stations: plan }, m.stats.complexity).throughput;
  out.push({
    cost: turnkeyLineCost(s.week, allowBlack) + retoolCost(s, m),
    gain: perLine,
    counts: { 'yeni hat': 1 },
    apply: () => {
      const line = emptyLine(`L${s.nextId++}`, nextLineName(s));
      line.slots = MAX_SLOTS;
      for (const st of STAGES) line.stations[st.id] = [...plan[st.id]];
      line.modelId = m.id;
      line.buildUntilWeek = s.week + lineBuildWeeks(yf);
      s.lines.push(line);
    },
  });
  return out.filter((o) => o.gain > 0.01);
}

/**
 * Monthly: grow towards demand with the best capacity per dollar, but only
 * while each car earns a healthy margin and the purchase pays back in about a
 * year and a half; give back surplus lines when buyers stay away. During a
 * military contract lines work for the army, so nothing is sold off.
 */
export function autoCapacity(s: GameState, materialCost: (m: CarModel) => number) {
  const yf = yearFloat(s.week);
  const wartime = (s.flags.militaryUntil ?? 0) > yf;
  for (const m of s.models) {
    if (m.status !== 'active' || !m.autoCapacity) continue;
    const d = demandOf(m);
    const allowBlack = linesOf(s, m).some((l) => l.stations.paint.some((id) => stationDef(id).blackOnly));
    let cap = capacity(s, m, linesOf(s, m), false);
    const labourPerCar = () => {
      const ls = linesOf(s, m);
      const c = capacity(s, m, ls, false);
      return c > 0 ? ls.reduce((a, l) => a + lineUpkeep(s, l, 1), 0) / c : 0;
    };
    const net = priceNow(m, s.week) * (1 - DEALER_COMMISSION);
    let margin = net - materialCost(m) - labourPerCar();
    let spent = 0;
    const done: Record<string, number> = {};
    // Why it is not growing, when buyers wait: shown on the model and factory screens.
    m.autoHold = undefined;
    if (cap < d * 1.05) m.autoHold = wartime ? 'war' : margin <= 0.08 * net ? 'margin' : undefined;
    for (let i = 0; i < 24 && !wartime && cap < d * 1.05 && margin > 0.08 * net; i++) {
      const budget = s.company.cash - reserve(s);
      const gap = d * 1.05 - cap;
      // Judge each option by the part of its capacity that buyers would actually use,
      // and leave a small shortfall rather than build a whole line for it.
      const useful = (o: Option) => Math.min(o.gain, gap);
      const all = options(s, m, linesOf(s, m), allowBlack).filter((o) => !o.counts['yeni hat'] || gap >= 0.35 * o.gain);
      const paying = all.filter((o) => o.cost <= useful(o) * margin * 52 * 1.5);
      const opts = paying.filter((o) => o.cost <= budget);
      if (!opts.length) {
        m.autoHold = !all.length ? 'full' : !paying.length ? 'payback' : 'cash';
        break;
      }
      m.autoHold = undefined;
      const pick = opts.reduce((a, b) => (useful(b) / Math.max(1, b.cost) > useful(a) / Math.max(1, a.cost) ? b : a));
      spend(s, pick.cost, 'investment');
      const f = financeNow(s);
      f.auto = (f.auto ?? 0) + pick.cost;
      m.autoSpent = (m.autoSpent ?? 0) + pick.cost;
      pick.apply();
      spent += pick.cost;
      for (const [k, n] of Object.entries(pick.counts)) done[k] = (done[k] ?? 0) + n;
      cap = capacity(s, m, linesOf(s, m), false);
      margin = net - materialCost(m) - labourPerCar();
    }
    if (spent > 0) {
      const what = Object.entries(done)
        .map(([k, n]) => `${n} ${k}`)
        .join(', ');
      log(s, `Otomatik kapasite: ${m.name} için ${what} (${money(spent)}). Kapasite ${cap.toFixed(1)} araç/hf, talep ${d.toFixed(1)}.`, 'info');
    }
    // Shrink: after two months with far more capacity than buyers, sell the smallest lines
    // (at most a quarter of them a month) down to a quarter above demand. Lines a project has
    // ordered its dies for, and the lines of a car whose successor is coming, are kept.
    const successor = s.projects.some((p) => p.replacesModelId === m.id);
    const reserved = reservedLines(s);
    const lines = linesOf(s, m);
    const sellable = successor ? [] : lines.filter((l) => !reserved.has(l.id));
    if (!wartime && cap > 1.5 * d) m.lowDemandMonths = (m.lowDemandMonths ?? 0) + 1;
    else m.lowDemandMonths = 0;
    if ((m.lowDemandMonths ?? 0) >= 2 && lines.length === 1 && !successor) {
      // A single line gives back machines instead: the least useful ones, while it still builds a quarter above demand.
      const refund = trimLine(s, m, lines[0], 1.25 * d);
      if (refund > 0) {
        const f = financeNow(s);
        f.auto = (f.auto ?? 0) - refund;
        m.autoSpent = (m.autoSpent ?? 0) - refund;
        log(s, `Otomatik kapasite: ${m.name} için talep düştü; ${lines[0].name} hattındaki fazla makineler satıldı (${money(refund)}).`, 'warn');
      }
      m.lowDemandMonths = 0;
    }
    if ((m.lowDemandMonths ?? 0) >= 2 && sellable.length) {
      const bySize = [...sellable].sort((a, b) => lineReport(s, a, m.stats.complexity).throughput - lineReport(s, b, m.stats.complexity).throughput);
      let sold = 0;
      let refund = 0;
      const limit = Math.max(1, Math.floor(lines.length / 4));
      for (const l of bySize) {
        const t = lineReport(s, l, m.stats.complexity).throughput;
        if (sold >= limit || linesOf(s, m).length <= 1 || cap - t < 1.25 * d) break;
        refund += STAGES.reduce((a, st) => a + l.stations[st.id].reduce((b, id) => b + stationResale(id, s.week), 0), 0);
        s.lines = s.lines.filter((x) => x !== l);
        cap -= t;
        sold++;
      }
      if (sold) {
        earn(s, refund);
        const f = financeNow(s);
        f.auto = (f.auto ?? 0) - refund;
        m.autoSpent = (m.autoSpent ?? 0) - refund;
        log(s, `Otomatik kapasite: ${m.name} için talep düştü; ${sold} hat kapatıldı, makineler satıldı (${money(refund)}).`, 'warn');
      }
      m.lowDemandMonths = 0;
    }
  }
}
