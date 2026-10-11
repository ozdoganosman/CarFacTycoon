import { PAINTS, paintDef, paintsIn, type PaintDef } from '../data/paints';
import { stationDef } from '../data/stations';
import { yearOf } from '../core/time';
import type { CarDesign, CarModel, GameState } from '../core/types';

// The colour a car is drawn in (data/paints.ts).

export interface CarPaint {
  body: PaintDef;
  roof?: PaintDef;
  /** Painted in a black japan oven: any colour so long as it is black. */
  japan?: boolean;
}

/** A car never given a colour gets one of its era's, the same every time (by its id). */
function eraPaint(seed: string, year: number): PaintDef {
  const pool = paintsIn(year);
  let h = 7;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[h % pool.length] ?? PAINTS[0];
}

export function designPaint(design: Pick<CarDesign, 'paint' | 'roof'>, seed: string, year: number): CarPaint {
  return { body: paintDef(design.paint) ?? eraPaint(seed, year), roof: paintDef(design.roof) };
}

/** A model's paint: its own, or black when its lines paint in black japan ovens. */
export function modelPaint(s: GameState, m: CarModel): CarPaint {
  const japan = s.lines.some((l) => l.modelId === m.id && l.stations.paint.some((id) => stationDef(id).blackOnly));
  if (japan) return { body: PAINTS[0], japan: true };
  return designPaint(m.design, m.id, yearOf(m.launchWeek));
}
