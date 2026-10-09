import { costIndex } from '../data/economy';
import {
  STATE_LIST,
  activeSearches,
  canSearch,
  coverage,
  freightPerCar,
  frontier,
  marginalWeekly,
  maxSearches,
  networkWeekly,
  openPlannedShops,
  openStates,
  planStates,
  searchCost,
  servicePlan,
  serviceTarget,
  startDealerSearch,
  stateNet,
  surplusShops,
  totalDealers,
} from './network';
import { COST_KEYS } from './game';
import { stateDef, stateWeights, type StateId } from '../data/states';
import { yearFloat } from './time';
import type { GameState } from './types';
import { decide, log, money } from './util';
import { t } from '../i18n';
import { fmtPercent } from '../i18n/format';

// "Otomatik servis": like "Talebi otomatik karşıla" for the factory, the service network keeps up
// with the cars on the road by itself. Monthly it opens shops wherever service falls below the
// company's target (every car looked after, or nine or eight in ten), the worst-served states
// first, from the cash above a reserve; and it closes the shops that stand idle where the cars
// have gone, or beyond what the target needs.

/**
 * Cash automatic service never touches: made like automatic capacity's reserve (autocap.ts), but
 * two weeks of running costs instead of six. A shop costs little next to a production line, and a
 * young firm short of cash that let its owners wait would lose its name and its sales.
 */
export function serviceReserve(s: GameState): number {
  const recent = s.finance.slice(-4);
  const weekly = recent.length ? recent.reduce((a, f) => a + f.materials + f.labor + f.salaries + f.other, 0) / recent.length : 0;
  return Math.max(4000 * costIndex(yearFloat(s.week)), 2 * weekly) + (s.company.taxOwed ?? 0);
}

export function autoService(s: GameState) {
  const net = s.network;
  if (!net?.autoService) return;
  const yf = yearFloat(s.week);
  const target = serviceTarget(s);
  const all = servicePlan(s, yf, Infinity, target);
  const plan = all.count ? servicePlan(s, yf, s.company.cash - serviceReserve(s), target) : all;
  if (plan.count) {
    openPlannedShops(s, plan);
    log(s, t('Otomatik servis: {n} servis atölyesi açıldı ({cost}): {states}.', { n: plan.count, cost: money(plan.cost), states: planStates(plan.states) }), 'info');
  }
  const waiting = all.count - plan.count;
  // Said once, and again only after half a year: the till often hovers round the reserve for months.
  if (waiting > 0 && !net.autoServiceWaiting && s.week - (net.autoServiceWarned ?? -1e9) >= 26) {
    net.autoServiceWarned = s.week;
    log(
      s,
      t('Otomatik servis: {n} atölye daha gerekiyor ({cost}) ama kasa yetmiyor; kasada iki haftalık gider kadar yedek bırakıyor. Kasa birikince açar.', {
        n: waiting,
        cost: money(all.cost - plan.cost),
      }),
      'warn',
    );
  }
  net.autoServiceWaiting = waiting > 0 ? waiting : undefined;
  const idle = STATE_LIST.map((id) => ({ id, shops: surplusShops(s, id, yf, target) })).filter((x) => x.shops > 0);
  if (idle.length) {
    for (const x of idle) stateNet(s, x.id).service -= x.shops;
    const p = { n: idle.reduce((a, x) => a + x.shops, 0), states: planStates(idle), target: fmtPercent(target, 0) };
    log(
      s,
      target < 1
        ? t('Otomatik servis: arabaların azaldığı ya da {target} servis hedefinin gerektirdiğini aşan yerlerde {n} servis atölyesi kapatıldı: {states}.', p)
        : t('Otomatik servis: arabaların azaldığı yerlerde boş kalan {n} servis atölyesi kapatıldı: {states}.', p),
      'info',
    );
  }
}

/**
 * "Otomatik bayi araması": the network grows by itself, at a careful pace. Monthly, once a car is on
 * sale and while the business pays for more dealers, it looks for dealers in the neighbouring state
 * with the most buyers per dollar of freight, or adds dealers where a busy state is thinly covered.
 * Searching everywhere at once would outgrow the sales and sink a young firm (a scripted player that
 * did went broke), so: one search more per dozen dealers, a reserve of eight weeks of the network's
 * cost, and no more once six states are open unless the last quarter earned twice what a dealer costs.
 */
export function autoDealers(s: GameState) {
  const net = s.network;
  if (!net?.autoDealers || !s.models.some((m) => m.status === 'active')) return;
  const yf = yearFloat(s.week);
  const active = s.models.filter((m) => m.status === 'active');
  const price = active.reduce((a, m) => a + m.price, 0) / active.length;
  const w = stateWeights(yf);
  const reserve = 8 * networkWeekly(s, yf) + 4000 * (1 + (yf - 1900) / 10);
  const recent = s.finance.slice(-13);
  const keys = COST_KEYS.filter((k) => k !== 'investment');
  const weeklyNet = recent.length ? recent.reduce((a, f) => a + f.revenue - keys.reduce((b, k) => b + (f[k] ?? 0), 0), 0) / recent.length : 0;
  // (The first few states are cheap and the home state alone does not pay: those come first.)
  if (openStates(s).length >= 6 && weeklyNet < marginalWeekly(s, 1, 0, yf) * 2) return;
  const value = (id: StateId) => w[id] * Math.max(0, 1 - freightPerCar(s, id, yf) / price);
  const searches = Math.min(maxSearches(s), 1 + Math.floor(totalDealers(s) / 12));
  const started: string[] = [];
  for (let tries = 0; tries < 3 && activeSearches(s) < searches; tries++) {
    const next = frontier(s).filter((id) => canSearch(s, id).ok);
    const thin = openStates(s).filter((id) => canSearch(s, id).ok && coverage(s, id, yf) < 0.45 && w[id] > 0.015);
    const best = [...next.map((id) => ({ id, v: value(id) })), ...thin.map((id) => ({ id, v: value(id) * 0.8 * (1 - coverage(s, id, yf)) }))].sort((a, b) => b.v - a.v)[0];
    if (!best || s.company.cash - (s.company.taxOwed ?? 0) < reserve + searchCost(s, best.id, yf) * 3) break;
    if (!startDealerSearch(s, best.id).ok) break;
    started.push(stateDef(best.id).name);
  }
  if (started.length) log(s, t('Otomatik bayi araması: {states}.', { states: started.join(', ') }), 'info');
}

/** Switch "Otomatik bayi araması" on or off. */
export function setAutoDealers(s: GameState, on: boolean) {
  if (!s.network) return;
  s.network.autoDealers = on;
  decide(s, 'autoDealers', `Otomatik bayi araması ${on ? 'açık' : 'kapalı'}`);
}
