import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { teamOutput } from '../src/core/development';
import { companyAssets, materialUnitCost, newGame, tick } from '../src/core/game';
import {
  buildEngineering,
  buildPlant,
  companyWorkScale,
  devWorkScale,
  engineeringUpkeep,
  plantCapacity,
  plantCoverage,
  plantCut,
  plantStep,
  teamSpan,
} from '../src/core/investments';
import { labSpeed } from '../src/core/research';
import { deserialize, serialize } from '../src/core/save';
import { weekFor } from '../src/core/time';
import { costIndex } from '../src/data/economy';
import { ENGINEERING_LEVELS, MIN_PLANT, SUPPLIER_PLANTS } from '../src/data/investments';
import type { CarModel, GameState, YearSummary } from '../src/core/types';
import { runBot } from '../scripts/bot';

// A grown company (core/investments.ts): its cars take more engineering, its engineering
// organisation decides how big a team can work at once, and its own supplier plants make the
// material cheaper.

const game = (year = 1900) => {
  const s = newGame({ companyName: 'Test', hq: 'usa', seed: 4 });
  s.week = weekFor(year, 0);
  s.modals = [];
  return s;
};

/** Pretend the company sold this many cars a year for the last two years (the books and one model's weekly history). */
function sold(s: GameState, units: number) {
  s.years = [1, 2].map((i) => ({ year: 1900 + i, unitsSold: units }) as YearSummary);
  const m = s.models[0] ?? ({ history: [] } as unknown as CarModel);
  if (!s.models.length) s.models.push(m);
  m.history = Array.from({ length: 52 }, (_, i) => ({ week: s.week - i, built: units / 52, sold: units / 52, revenue: 0, cost: 0 }));
}

describe('engineering at the company size', () => {
  it('a bigger maker’s car takes more work: none extra for a workshop, ~×2.4 at 100,000 cars a year', () => {
    expect(devWorkScale(0)).toBe(1);
    expect(devWorkScale(20_000)).toBeGreaterThan(1.7);
    expect(devWorkScale(100_000)).toBeCloseTo(2.37, 1);
    expect(devWorkScale(1_000_000)).toBeGreaterThan(devWorkScale(100_000));
    const s = game(1925);
    const r = A.startProject(s, { name: 'X', segment: 'family', targetPrice: 900 });
    if (!r.ok) throw new Error(r.error);
    const p = s.projects[0];
    const small = A.requiredWork(s, p);
    sold(s, 100_000);
    expect(companyWorkScale(s)).toBeCloseTo(devWorkScale(100_000), 6);
    expect(A.requiredWork(s, p) / small).toBeCloseTo(devWorkScale(100_000), 6);
  });

  it('the organisation sets how big a team works at once; the workshop bench is the old rule', () => {
    expect(teamOutput(20)).toBeCloseTo(20 / (1 + 18 / 12), 6);
    expect(teamOutput(2, 130)).toBe(2);
    expect(teamOutput(200, 50)).toBeGreaterThan(3 * teamOutput(200, 12));
    expect(teamOutput(10_000, 50)).toBeLessThan(50);
  });

  it('builds the organisation level by level, each in its year, and pays its upkeep under R&D', () => {
    const s = game(1905);
    s.company.cash = 1e9;
    expect(teamSpan(s)).toBe(12);
    const speed = labSpeed(s);
    expect(buildEngineering(s).ok).toBe(true);
    expect(teamSpan(s)).toBe(ENGINEERING_LEVELS[1].span);
    expect(labSpeed(s)).toBeGreaterThan(speed);
    // The engineering building comes in 1908.
    const early = buildEngineering(s);
    expect(early.ok).toBe(false);
    s.week = weekFor(1909, 0);
    const cash = s.company.cash;
    expect(buildEngineering(s).ok).toBe(true);
    expect(cash - s.company.cash).toBeCloseTo(ENGINEERING_LEVELS[2].cost * costIndex(1909), 0);
    expect(engineeringUpkeep(s)).toBeGreaterThan(0);
    tick(s);
    expect(s.finance[s.finance.length - 1].rnd).toBeGreaterThanOrEqual(engineeringUpkeep(s) * 0.99);
    // Not without the money.
    s.week = weekFor(1921, 0);
    s.company.cash = 1000;
    expect(buildEngineering(s).ok).toBe(false);
  });
});

describe('supplier plants', () => {
  it('cut the material of the cars they supply, open in their year, and are built no smaller than MIN_PLANT', () => {
    const s = game(1912);
    runBot(s, 52 * 2, { segments: ['family'] });
    expect(s.models.length).toBeGreaterThan(0);
    s.modals = [];
    s.company.cash = 1e9;
    const m = s.models[0];
    const before = materialUnitCost(s, m);
    const assets = companyAssets(s);
    expect(buildPlant(s, 'steel').ok).toBe(false); // 1920
    const body = SUPPLIER_PLANTS.find((p) => p.id === 'body')!;
    const cash = s.company.cash;
    expect(buildPlant(s, 'body').ok).toBe(true);
    expect(plantCapacity(s, 'body')).toBeGreaterThanOrEqual(MIN_PLANT);
    expect(cash - s.company.cash).toBeCloseTo(body.costPerCar * costIndex(1914) * plantCapacity(s, 'body'), 0);
    // A small maker: the plant supplies every car, and there is nothing to grow yet.
    expect(plantCoverage(s, 'body')).toBe(1);
    expect(buildPlant(s, 'body').ok).toBe(false);
    expect(plantCut(s)).toBeCloseTo(0.03, 6);
    expect(materialUnitCost(s, m)).toBeCloseTo(before * (1 - 0.03), 6);
    // On the books at half its price (the cash went down by the whole of it).
    expect(companyAssets(s) - assets).toBeCloseTo(-0.5 * (cash - s.company.cash), -2);
  });

  it('a grown company outgrows its plant: the cut falls to the cars it supplies until it is grown', () => {
    const s = game(1928);
    s.company.cash = 1e10;
    sold(s, 20_000);
    expect(buildPlant(s, 'steel').ok).toBe(true);
    expect(plantCapacity(s, 'steel')).toBe(25_000);
    sold(s, 100_000);
    expect(plantCoverage(s, 'steel')).toBeCloseTo(0.25, 6);
    expect(plantCut(s)).toBeCloseTo(0.04 * 0.25, 6);
    const step = plantStep(s, SUPPLIER_PLANTS.find((p) => p.id === 'steel')!)!;
    expect(step.to).toBe(125_000);
    expect(buildPlant(s, 'steel').ok).toBe(true);
    expect(plantCoverage(s, 'steel')).toBe(1);
  });

  it('pays back fast at a large volume and never at a small one', () => {
    const s = game(1928);
    const body = SUPPLIER_PLANTS.find((p) => p.id === 'body')!;
    expect(plantStep(s, body)!.payback).toBe(Infinity);
    // A year of material bought: a big maker and a small one (about $900 of material a car).
    const week = (materials: number) => ({ ...s.finance[0], week: 0, materials });
    sold(s, 200_000);
    s.finance = Array.from({ length: 52 }, () => week((200_000 * 900) / 52));
    expect(plantStep(s, body)!.payback).toBeLessThan(4);
    sold(s, 1_000);
    s.finance = Array.from({ length: 52 }, () => week((1_000 * 900) / 52));
    expect(plantStep(s, body)!.payback).toBeGreaterThan(30);
  });

  it('a save keeps the organisation and the plants', () => {
    const s = game(1921);
    s.company.cash = 1e9;
    buildEngineering(s);
    buildPlant(s, 'glass');
    const back = deserialize(serialize(s));
    expect(back.engineering).toBe(1);
    expect(back.plants).toEqual({ glass: MIN_PLANT });
  });
});
