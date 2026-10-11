import { PAINTS, eraPaint, paintDef, type PaintDef } from '../data/paints';
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

export function designPaint(design: Pick<CarDesign, 'paint' | 'roof'>, seed: string, year: number): CarPaint {
  return { body: paintDef(design.paint) ?? eraPaint(seed, year), roof: paintDef(design.roof) };
}

/** A model's paint: its own, or black when its lines paint in black japan ovens. */
export function modelPaint(s: GameState, m: CarModel): CarPaint {
  const japan = s.lines.some((l) => l.modelId === m.id && l.stations.paint.some((id) => stationDef(id).blackOnly));
  if (japan) return { body: PAINTS[0], japan: true };
  return designPaint(m.design, m.id, yearOf(m.launchWeek));
}
