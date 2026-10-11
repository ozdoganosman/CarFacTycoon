import { yearFloat } from '../../core/time';
import type { CarModel, GameState } from '../../core/types';
import { modelPaint } from '../paint';
import { CarSVG } from '../viz/CarSVG';

/** A model drawn as it was built: its body and era, in its own paint. */
export function ModelCar({ s, m, year, className }: { s: GameState; m: CarModel; year?: number; className?: string }) {
  const paint = modelPaint(s, m);
  return (
    <CarSVG
      body={m.design.body}
      size={m.design.size}
      year={year ?? yearFloat(m.refreshWeek)}
      cylinders={m.design.engine.cylinders}
      styling={m.design.styling}
      color={paint.body.color}
      roof={paint.roof?.color}
      className={className}
    />
  );
}
