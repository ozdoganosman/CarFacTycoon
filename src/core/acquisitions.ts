import { costIndex } from '../data/economy';
import { RIVALS } from '../data/rivals';
import { rivalPriceNow } from './market';
import { isRivalActive } from './rivals';
import { yearFloat, yearOf } from './time';
import type { GameState, MarketId } from './types';

// Buying a rival: its engineers join, its dealers carry your cars and its
// customers go looking for a new make. Only makers smaller than the player are
// for sale.

export interface AcquisitionTarget {
  id: string;
  name: string;
  home: MarketId;
  /** Cars it sold last year. */
  units: number;
  price: number;
  engineers: number;
}

/** Last full year's sales of the player's company. */
function playerUnits(s: GameState): number {
  return s.years[s.years.length - 1]?.unitsSold ?? 0;
}

export function acquisitionTargets(s: GameState): AcquisitionTarget[] {
  const yf = yearFloat(s.week);
  const year = yearOf(s.week) - 1;
  const mine = playerUnits(s);
  const out: AcquisitionTarget[] = [];
  for (const def of RIVALS) {
    // Only American makers: the company plays the American market.
    if (def.home !== 'usa' || !isRivalActive(def, yf) || s.acquired?.includes(def.id)) continue;
    const company = s.rivals.find((c) => c.id === def.id);
    if (company?.mergedInto) continue;
    const units = company?.yearSold[year] ?? 0;
    if (units <= 0 || units >= mine) continue;
    const models = s.rivalModels.filter((m) => m.companyId === def.id && m.active);
    if (!models.length) continue;
    const avg = models.reduce((a, m) => a + rivalPriceNow(m, s.week), 0) / models.length;
    // About half a year's turnover: the factory, the dealers and the name.
    const price = Math.max(20000 * costIndex(yf), units * avg * 0.5);
    out.push({ id: def.id, name: def.name, home: def.home, units, price, engineers: Math.round(Math.min(40, 3 + units / 800)) });
  }
  return out.sort((a, b) => b.units - a.units);
}
