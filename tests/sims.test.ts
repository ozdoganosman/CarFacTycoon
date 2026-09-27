import { describe, expect, it } from 'vitest';
import { engineConfig, torqueTrace } from '../src/ui/cards/anim/EngineBlock';
import { driveTest } from '../src/ui/cards/anim/SuspensionSim';
import { CYLINDER_OPTIONS } from '../src/data/tech';

const mod = (a: number, n: number) => ((a % n) + n) % n;

describe('engine block simulation', () => {
  it('fires every cylinder once per cycle at even intervals', () => {
    for (const o of CYLINDER_OPTIONS) {
      const cfg = engineConfig(o.cylinders, o.layout);
      expect([...cfg.order].sort((a, b) => a - b)).toEqual(Array.from({ length: o.cylinders }, (_, i) => i + 1));
      const fires = cfg.cyls.map((c) => c.fire).sort((a, b) => a - b);
      fires.forEach((f, i) => expect(f).toBeCloseTo((i * 720) / o.cylinders));
    }
  });

  it('puts the two cylinders of a V8, V12 and V16 on one crank pin', () => {
    for (const n of [8, 12, 16]) {
      const cfg = engineConfig(n, 'v');
      for (let j = 0; j < cfg.cells; j++) {
        const [a, b] = cfg.cyls.filter((c) => c.cell === j);
        const axisDiff = ((b.axis - a.axis) * 180) / Math.PI;
        expect(mod(axisDiff - (b.fire - a.fire), 360)).toBeCloseTo(0, 5);
      }
    }
  });

  it('smooths the torque as cylinders are added', () => {
    const peaks = [
      [1, 'inline'],
      [2, 'inline'],
      [4, 'inline'],
      [6, 'inline'],
      [8, 'v'],
      [12, 'v'],
    ].map(([n, l]) => {
      const t = torqueTrace(engineConfig(n as number, l as 'inline' | 'v'), false);
      return t.max / t.mean;
    });
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeLessThan(peaks[i - 1]);
    // a single cylinder drags the crank backwards between its power strokes; a six never does
    expect(torqueTrace(engineConfig(1, 'inline'), false).min).toBeLessThan(0);
    expect(torqueTrace(engineConfig(6, 'inline'), false).min).toBeGreaterThan(0);
  });
});

describe('suspension simulation', () => {
  const run = (balance: number, knowhow: string[], kmh = 45) => driveTest({ suspension: 'leaf', balance, knowhow, year: 1930 }, kmh, 40);

  it('soft springs ride better, stiff springs lean less', () => {
    const soft = run(0, ['kh:frictionDampers', 'kh:hydraulicDampers']);
    const stiff = run(1, ['kh:frictionDampers', 'kh:hydraulicDampers']);
    expect(soft.comfort).toBeLessThan(stiff.comfort);
    expect(stiff.rollDeg).toBeLessThan(soft.rollDeg);
  });

  it('dampers stop the body bouncing and keep the tyres on the road', () => {
    const none = run(0.5, []);
    const hydraulic = run(0.5, ['kh:frictionDampers', 'kh:hydraulicDampers']);
    expect(hydraulic.comfort).toBeLessThan(none.comfort);
    expect(hydraulic.air).toBeLessThan(none.air);
  });

  it('an anti-roll bar cuts the lean in the bend', () => {
    const plain = run(0.3, ['kh:hydraulicDampers']);
    const bar = run(0.3, ['kh:hydraulicDampers', 'kh:antiRoll']);
    expect(bar.rollDeg).toBeLessThan(plain.rollDeg * 0.8);
  });
});
