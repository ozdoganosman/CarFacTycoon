import { costIndex } from '../data/economy';
import { STATE_LIST, openPlannedShops, planStates, servicePlan, serviceTarget, stateNet, surplusShops } from './network';
import { yearFloat } from './time';
import type { GameState } from './types';
import { log, money } from './util';
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
