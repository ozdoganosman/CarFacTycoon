import { acquisitionTargets } from './acquisitions';
import { AD_LEVELS, adNorm, adRatio, adTermAt } from './advertising';
import { autoAllowsBlack, demandGap, idleCash, newLineSize } from './autocap';
import { paybackYears, turnkeyQuote } from './factory';
import { availableSegments, materialUnitCost } from './game';
import { engineeringCost, nextEngineering, plantStep } from './investments';
import { priceNow } from './market';
import { nextSearches, searchCost } from './network';
import { yearFloat } from './time';
import type { GameState, SegmentId } from './types';
import { money } from './util';
import { DEALER_COMMISSION, adWeight, costIndex } from '../data/economy';
import { ENGINEERING_LEVELS, ENGINEERING_UPKEEP, SUPPLIER_PLANTS } from '../data/investments';
import { segmentDef } from '../data/segments';
import { stateDef } from '../data/states';
import { fmtNumber } from '../i18n/format';
import { t } from '../i18n';

// Where spare money can go, in one list: each use with its price and, where the game can say it, the
// years it takes to pay for itself. The choices themselves stay on their screens (Finance shows the
// list; each line leads to its screen). Seven kinds: a line for a car buyers are waiting for, a car
// in a class the company is not in, dealers in new states, a supplier plant, the engineering
// organisation, advertising above the era's usual, a rival bought.

export type MoneyUseKind = 'line' | 'class' | 'dealers' | 'plant' | 'engineering' | 'ads' | 'rival';

export interface MoneyUse {
  kind: MoneyUseKind;
  /** What it is (already in the player's language). */
  title: string;
  /** What it buys. */
  gain: string;
  cost: number;
  /** A yearly cost on top (organisation upkeep, advertising). */
  yearly?: number;
  /** Years to pay for itself, when the game can tell. */
  payback?: number;
}

/** The uses open now, the ones that pay back fastest first, then the rest. */
export function moneyUses(s: GameState): MoneyUse[] {
  const yf = yearFloat(s.week);
  const out: MoneyUse[] = [];
  const active = s.models.filter((m) => m.status === 'active');

  // A line for the car buyers wait for most.
  const waiting = active.map((m) => ({ m, gap: demandGap(s, m) })).filter((x) => x.gap > 0.5).sort((a, b) => b.gap - a.gap)[0];
  if (waiting) {
    const { m, gap } = waiting;
    const black = autoAllowsBlack(s, m);
    const q = turnkeyQuote(s, m, black, newLineSize(s, m, black, gap));
    const margin = priceNow(m, s.week) * (1 - DEALER_COMMISSION) - materialUnitCost(s, m) - q.labour;
    out.push({
      kind: 'line',
      title: t('{model} için yeni hat', { model: m.name }),
      gain: t('Alıcılar haftada ~{gap} araba daha istiyor; hat haftada ~{output} yapar.', { gap: Math.round(gap), output: Math.round(q.output) }),
      cost: q.cost,
      payback: paybackYears(q.cost, q.output, margin, gap),
    });
  }

  // A class with no car of the company's in it (nor one on the way).
  const covered = new Set<SegmentId>([...active.map((m) => m.segment), ...s.projects.map((p) => p.segment)]);
  const open = availableSegments(s).filter((id) => !covered.has(id));
  if (open.length && active.length)
    out.push({
      kind: 'class',
      title: t('Yeni bir sınıfa araba'),
      gain: t('Arabası olmayan sınıflar: {classes}.', { classes: open.map((id) => t(segmentDef(id).name)).join(', ') }),
      cost: 0,
    });

  // Dealers in the states with the most buyers the company does not sell in yet.
  const next = nextSearches(s, yf);
  if (next.length)
    out.push({
      kind: 'dealers',
      title: t('Yeni eyaletlerde bayi'),
      gain: t('Alıcısı en çok, satış yapmadığın ya da az bayin olan eyaletler: {states}.', { states: next.slice(0, 4).map((id) => stateDef(id).name).join(', ') }),
      cost: next.reduce((a, id) => a + searchCost(s, id, yf), 0),
    });

  // The supplier plant that pays back fastest.
  const plant = SUPPLIER_PLANTS.filter((p) => p.year <= yf)
    .map((p) => ({ p, step: plantStep(s, p, yf) }))
    .filter((x) => x.step && Number.isFinite(x.step.payback))
    .sort((a, b) => a.step!.payback - b.step!.payback)[0];
  if (plant?.step)
    out.push({
      kind: 'plant',
      title: t(plant.p.name),
      gain: t('Yılda {count} arabalık; malzemeden yılda ~{saving} kazandırır.', { count: fmtNumber(plant.step.to), saving: money(plant.step.saving) }),
      cost: plant.step.cost,
      payback: plant.step.payback,
    });

  // The next level of the engineering organisation.
  const org = nextEngineering(s);
  if (org && org.year <= yf) {
    out.push({
      kind: 'engineering',
      title: t(org.name),
      gain: t('Bir projede ~{span} mühendisin işi birden yürür (şimdi ~{now}); araştırma da hızlanır.', { span: org.span, now: ENGINEERING_LEVELS[s.engineering ?? 0].span }),
      cost: engineeringCost(org, yf),
      yearly: org.cost * costIndex(yf) * ENGINEERING_UPKEEP,
    });
  }

  // Advertising one step above the present level, once advertising makes a name (1915 on).
  const ratio = adRatio(s, yf);
  const up = AD_LEVELS.find((l) => l > ratio + 0.05);
  if (up && adWeight(yf) > 0 && active.length) {
    const more = (up - ratio) * adNorm(s, yf) * 52;
    out.push({
      kind: 'ads',
      title: up === 1 ? t('Reklam: dönemin olağanına çık') : t('Reklam: olağanın {n} katı', { n: up }),
      gain: t('İtibarın yöneldiği yer ~{points} puan yukarı.', { points: Math.max(1, Math.round(adTermAt(up, yf) - adTermAt(ratio, yf))) }),
      cost: 0,
      yearly: more,
    });
  }

  // The cheapest rival for sale.
  const rival = [...acquisitionTargets(s)].sort((a, b) => a.price - b.price)[0];
  if (rival)
    out.push({
      kind: 'rival',
      title: t('{company} satın al', { company: rival.name }),
      gain: t('{n} mühendis katılır, bayileri {dealers} eyalette senin arabalarını satar.', { n: rival.engineers, dealers: rival.dealers }),
      cost: rival.price,
    });

  const pays = out.filter((x) => x.payback !== undefined && Number.isFinite(x.payback)).sort((a, b) => a.payback! - b.payback!);
  return [...pays, ...out.filter((x) => !pays.includes(x))];
}

/** Money the company could put to work: above a reserve and a year of fixed costs (autocap.ts). */
export const spareMoney = idleCash;
