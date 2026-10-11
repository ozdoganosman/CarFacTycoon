import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { newGame } from '../src/core/game';
import { modelAdCopy } from '../src/core/news';
import { deserialize, serialize } from '../src/core/save';
import { weekFor, yearFloat } from '../src/core/time';
import { costIndex } from '../src/data/economy';
import { PAINTS, TWO_TONE_YEAR, eraPaint, paintsIn } from '../src/data/paints';
import { runBot } from '../scripts/bot';

// A car's paint (data/paints.ts): chosen up to the launch and changed on a car on sale; it changes how
// the car looks and nothing else.

function going(year: number) {
  const s = newGame({ companyName: 'Test', hq: 'usa', seed: 6 });
  s.week = weekFor(year, 0);
  s.modals = [];
  s.company.cash = 2e5 * costIndex(year);
  runBot(s, 52 * 2, { segments: ['family'] });
  s.modals = [];
  return s;
}

describe('paint', () => {
  it('each era offers its colours; a car never given one gets one of its era, always the same', () => {
    expect(paintsIn(1910).every((p) => p.year <= 1910)).toBe(true);
    expect(paintsIn(1955).length).toBeGreaterThan(paintsIn(1910).length);
    expect(eraPaint('m12', 1910).id).toBe(eraPaint('m12', 1910).id);
    expect(eraPaint('m12', 1910).year).toBeLessThanOrEqual(1910);
    // Different cars, different colours (not all the same).
    expect(new Set(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id) => eraPaint(id, 1930).id)).size).toBeGreaterThan(1);
  });

  it('is chosen at any stage before the launch, in the colours of the year', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 2 });
    s.modals = [];
    const r = A.startProject(s, { name: 'X', segment: 'family', targetPrice: 0 });
    if (!r.ok) throw new Error(r.error);
    const p = s.projects.find((x) => x.id === r.id)!;
    expect(A.setProjectPaint(s, p.id, 'navy').ok).toBe(true);
    expect(p.design.paint).toBe('navy');
    // Not yet: a fifties colour, or a two-tone roof, in 1900.
    expect(A.setProjectPaint(s, p.id, 'coral').ok).toBe(false);
    expect(A.setProjectPaint(s, p.id, 'navy', 'cream').ok).toBe(false);
    expect(p.design.paint).toBe('navy');
    // Paint is no engineering: it can still be changed once development is under way.
    p.phase = 'testing';
    expect(A.setProjectPaint(s, p.id, 'maroon').ok).toBe(true);
    s.week = weekFor(1953, 0);
    expect(A.setProjectPaint(s, p.id, 'coral', 'cream').ok).toBe(true);
    expect(p.design.roof).toBe('cream');
  });

  it('a car launched without a chosen paint keeps the colour it was drawn in; a new class does not inherit it', () => {
    const s = going(1912);
    const m = s.models.find((x) => x.status === 'active')!;
    expect(m.design.paint).toBeDefined();
    expect(PAINTS.some((x) => x.id === m.design.paint)).toBe(true);
    // A new generation starts from the car it replaces, paint and all; a car in another class does not.
    const next = A.startProject(s, { name: 'Next', segment: m.segment, targetPrice: 0, replacesModelId: m.id });
    if (!next.ok) throw new Error(next.error);
    expect(s.projects.find((x) => x.id === next.id)!.design.paint).toBe(m.design.paint);
    const other = A.defaultDesign(s, 'city');
    expect(other.paint).toBeUndefined();
    // Repainting a car on sale, kept in a save.
    expect(A.setModelPaint(s, m.id, 'cream').ok).toBe(true);
    expect(deserialize(serialize(s)).models.find((x) => x.id === m.id)!.design.paint).toBe('cream');
    expect(yearFloat(s.week)).toBeLessThan(TWO_TONE_YEAR);
  });

  it('the advertisement names three qualities, a slogan and the price', () => {
    const s = going(1912);
    const m = s.models.find((x) => x.status === 'active')!;
    const ad = modelAdCopy(s, m);
    expect(ad.lines).toHaveLength(3);
    expect(ad.slogan.length).toBeGreaterThan(3);
    expect(ad.price).toBeGreaterThan(0);
  });
});
