import { test } from 'vitest';
import * as A from '../src/core/actions';
import { newGame, tick } from '../src/core/game';
import { segmentMarket } from '../src/core/market';
import type { CarDesign, FocusKey, GameState } from '../src/core/types';

// A new company's first car should meet established makers that are ahead of
// it: a sensible first design lands in the middle or lower half of its class,
// not at the top. This replays a real playtest (1900, family car, $900).

const USER_DESIGN: CarDesign = {
  chassis: 'ladder',
  body: 'phaeton',
  size: 0.45,
  styling: 0.4,
  engine: { cylinders: 4, layout: 'inline', bore: 85, stroke: 79.5, compression: 4.2, valvetrain: 'sv', fuelSystem: 'carb', aspiration: 'na' },
  gearbox: { type: 'sliding', gears: 3, spread: 1 },
  suspension: 'leaf',
  suspBalance: 0.35,
  features: [],
  interior: 0.3,
};

function firstCar(seed: number, focus: Record<FocusKey, number>, price: number, tests: [number, number, number]) {
  const s: GameState = newGame({ companyName: 'Öncü Motor', hq: 'usa', seed });
  s.modals = [];
  const r = A.startProject(s, { name: 'Model A', segment: 'family', targetPrice: 0 });
  if (!r.ok) throw new Error(r.error);
  A.updateDesign(s, r.id, USER_DESIGN);
  A.setFocus(s, r.id, focus);
  A.beginDevelopment(s, r.id);
  const p = () => s.projects.find((x) => x.id === r.id)!;
  const run = (n: number) => {
    for (let i = 0; i < n; i++) {
      tick(s);
      s.modals = [];
    }
  };
  while (p().dev.done < p().dev.required) run(1);
  A.finishDevelopment(s, r.id);
  A.setTestPlan(s, r.id, 'dyno', tests[0]);
  A.setTestPlan(s, r.id, 'road', tests[1]);
  A.setTestPlan(s, r.id, 'durability', tests[2]);
  const testStart = s.company.cash;
  while (Object.values(p().tests).some((t) => t.done < t.planned)) run(1);
  const testCost = testStart - s.company.cash;
  const hidden = p().defects.filter((d) => !d.found).length;
  A.finishTesting(s, r.id);
  const t = A.startTooling(s, r.id, s.lines[0].id);
  if (!t.ok) throw new Error(t.error);
  while (p() && p().phase !== 'ready') run(1);
  const l = A.launchModel(s, r.id, { price, markets: ['usa'], autoShow: true });
  if (!l.ok) throw new Error(l.error);
  s.modals = [];
  run(4);
  const sm = segmentMarket(s, 'usa', 'family');
  const tot = sm.offers.reduce((a, o) => a + o.weight, 0) + sm.othersWeight;
  const ranked = [...sm.offers].sort((a, b) => b.weight - a.weight);
  const rank = ranked.findIndex((o) => o.kind === 'player') + 1;
  const me = ranked[rank - 1];
  const best = ranked.find((o) => o.kind === 'rival')!;
  console.log(
    `seed ${seed} rank ${rank}/${ranked.length} share ${((me.weight / tot) * 100).toFixed(1)}% · me ap ${me.appeal.toFixed(1)} u ${me.utility.toFixed(1)} reach ${me.reach.toFixed(2)} · best rival ${best.name} ap ${best.appeal.toFixed(1)} u ${best.utility.toFixed(1)} reach ${best.reach.toFixed(2)} · rivals ap ${(ranked.filter((o) => o.kind === 'rival').reduce((a, o) => a + o.appeal, 0) / (ranked.length - 1)).toFixed(1)} · tests ${Math.round(testCost)} hidden ${hidden} cash ${Math.round(s.company.cash)}`,
  );
  return rank;
}

test('a first car meets rivals that are ahead of it', () => {
  const comfort = { performance: 0, efficiency: 0, comfort: 0.79, safety: 0.12, cost: 0.09, quality: 0 };
  const even = { performance: 1 / 6, efficiency: 1 / 6, comfort: 1 / 6, safety: 1 / 6, cost: 1 / 6, quality: 1 / 6 };
  for (const seed of [1924320942, 7, 11]) {
    firstCar(seed, comfort, 900, [17, 30, 30]);
    firstCar(seed, even, 958, [8, 10, 10]);
  }
});
