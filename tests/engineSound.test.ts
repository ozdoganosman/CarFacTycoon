import { describe, expect, it } from 'vitest';
import { firings, layerMix, layerRpms, makeLayer, soundSpec, voiceTone, type EngineSoundSpec } from '../src/ui/audio/engineVoice';
import type { EngineDesign, EngineStats } from '../src/core/types';

const SR = 22050;

function spec(over: Partial<EngineSoundSpec> = {}): EngineSoundSpec {
  return {
    cylinders: 4,
    layout: 'inline',
    bore: 90,
    stroke: 100,
    displacementCc: 2545,
    diesel: false,
    valvetrain: 'ohv',
    supercharged: false,
    electricStart: true,
    year: 1930,
    idle: 430,
    redline: 3600,
    ...over,
  };
}

/** Per-bank gaps between firings, in crank degrees. */
function bankGaps(n: number, layout: 'inline' | 'v') {
  const out: Record<string, number[]> = {};
  const byBank: Record<string, number[]> = {};
  for (const f of firings(n, layout)) (byBank[f.bank] ??= []).push(f.angle);
  for (const [b, a] of Object.entries(byBank)) out[b] = a.map((v, i) => (a[(i + 1) % a.length] - v + 720) % 720);
  return out;
}

/** Magnitude of the loop's spectrum at `hz` (one DFT bin). */
function magnitude(x: Float32Array, hz: number, sr: number) {
  let re = 0;
  let im = 0;
  for (let i = 0; i < x.length; i++) {
    const a = (2 * Math.PI * hz * i) / sr;
    re += x[i] * Math.cos(a);
    im -= x[i] * Math.sin(a);
  }
  return Math.hypot(re, im) / x.length;
}

describe('engine sound', () => {
  it('fires every cylinder once per two turns, evenly in an inline four', () => {
    const f = firings(4, 'inline');
    expect(f.map((x) => x.angle)).toEqual([0, 180, 360, 540]);
    expect(f.every((x) => x.bank === 0)).toBe(true);
  });

  it('gives a V8 its uneven bank-by-bank beat and a V12 an even one', () => {
    const v8 = bankGaps(8, 'v');
    expect(Object.keys(v8).sort()).toEqual(['-1', '1']);
    for (const gaps of Object.values(v8)) {
      expect(gaps.reduce((a, b) => a + b, 0)).toBe(720);
      expect(new Set(gaps).size).toBeGreaterThan(1);
    }
    for (const gaps of Object.values(bankGaps(12, 'v'))) expect(gaps).toEqual([120, 120, 120, 120, 120, 120]);
  });

  it('covers cranking to past the redline with loops at most 1.5x apart', () => {
    const s = spec();
    const r = layerRpms(s);
    expect(r[0]).toBeLessThanOrEqual(s.idle * 0.5);
    expect(r[r.length - 1]).toBeGreaterThanOrEqual(s.redline);
    for (let i = 1; i < r.length; i++) expect(r[i] / r[i - 1]).toBeLessThanOrEqual(1.5 + 1e-9);
  });

  it('crossfades between the two nearest loops at equal power', () => {
    const r = [200, 300, 450, 675];
    for (const rpm of [100, 200, 250, 333, 450, 600, 900]) {
      const g = layerMix(r, rpm);
      expect(g.reduce((a, b) => a + b * b, 0)).toBeCloseTo(1, 6);
      expect(g.filter((x) => x > 1e-9).length).toBeLessThanOrEqual(2);
    }
    expect(layerMix(r, 300)[1]).toBeCloseTo(1, 6);
  });

  it('renders a clean, level, repeatable loop', () => {
    const s = spec();
    const t = voiceTone(s);
    const a = makeLayer(s, t, 1500, SR, 3);
    const b = makeLayer(s, t, 1500, SR, 3);
    expect(a.left).toEqual(b.left);
    let peak = 0;
    let sum = 0;
    for (const ch of [a.left, a.right])
      for (const v of ch) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
        sum += v;
      }
    expect(peak).toBeLessThanOrEqual(0.851);
    expect(Math.abs(sum / (a.left.length * 2))).toBeLessThan(1e-3);
    // A whole number of cycles, at (very nearly) the asked speed.
    expect(Math.abs(a.rpm - 1500) / 1500).toBeLessThan(0.01);
  });

  it('sings at the firing frequency: twice per turn for a four, once every two turns for a single', () => {
    const rpm = 1800;
    const crank = rpm / 60;
    const four = makeLayer(spec(), voiceTone(spec()), rpm, SR);
    expect(magnitude(four.left, 2 * crank, SR)).toBeGreaterThan(4 * magnitude(four.left, 0.5 * crank, SR));
    const one = spec({ cylinders: 1, displacementCc: 1200, year: 1903, idle: 360, redline: 1800 });
    const single = makeLayer(one, voiceTone(one), rpm, SR);
    expect(magnitude(single.left, 0.5 * crank, SR)).toBeGreaterThan(magnitude(single.left, 2 * crank, SR) * 0.5);
  });

  it('hears a V8 bank by bank: each side carries the half-order beat', () => {
    const v8 = spec({ cylinders: 8, layout: 'v', displacementCc: 5200 });
    const l = makeLayer(v8, voiceTone(v8), 1800, SR);
    const crank = 1800 / 60;
    // Uneven firing on one bank (270-180-90-180°) puts energy at 1.5x crank, below the
    // firing frequency (4x crank): the burble. An inline eight has none there.
    const burble = magnitude(l.left, 1.5 * crank, SR) / magnitude(l.left, 4 * crank, SR);
    const i8 = spec({ cylinders: 8, layout: 'inline', displacementCc: 5200 });
    const s = makeLayer(i8, voiceTone(i8), 1800, SR);
    const smooth = magnitude(s.left, 1.5 * crank, SR) / magnitude(s.left, 4 * crank, SR);
    expect(burble).toBeGreaterThan(0.1);
    expect(burble).toBeGreaterThan(5 * smooth);
  });

  it('reads the design: idle, diesel, starter, and a deeper voice for a bigger engine', () => {
    const e: EngineDesign = { cylinders: 6, layout: 'inline', bore: 85, stroke: 110, compression: 5, valvetrain: 'sv', fuelSystem: 'carb', aspiration: 'na' };
    const es = { redline: 3000, displacementCc: 3745 } as EngineStats;
    const s = soundSpec(e, es, 1925, []);
    expect(s.idle).toBeLessThanOrEqual(s.redline * 0.3);
    expect(s.electricStart).toBe(false);
    expect(soundSpec(e, es, 1925, ['electricStart']).electricStart).toBe(true);
    expect(soundSpec({ ...e, fuel: 'diesel' }, es, 1950, []).diesel).toBe(true);
    expect(voiceTone(spec({ displacementCc: 6000 })).bodyHz).toBeLessThan(voiceTone(spec({ displacementCc: 1200 })).bodyHz);
    expect(voiceTone(spec({ diesel: true })).clatter).toBeGreaterThan(0);
  });
});
