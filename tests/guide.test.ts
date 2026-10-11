import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { newGame, tick } from '../src/core/game';
import { areaOpen, areaSeen, guideStep, updateAreas } from '../src/core/guide';
import { runBot } from '../scripts/bot';

// The way to the first car (src/core/guide.ts): a step for each phase of the first project, and
// the menu opening screen by screen as that car needs them.

describe('first-car guide', () => {
  it('follows the first project from the idea to the launch, then steps aside', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 3 });
    expect(guideStep(s)).toEqual({ n: 1, kind: 'newProject' });
    const r = A.startProject(s, { name: 'İlk', segment: 'family', targetPrice: 0 });
    if (!r.ok) throw new Error(r.error);
    expect(guideStep(s)?.kind).toBe('design');
    expect(A.beginDevelopment(s, r.id).ok).toBe(true);
    const dev = guideStep(s);
    expect(dev).toMatchObject({ n: 3, kind: 'development', done: false });
    if (dev?.kind === 'development') expect(dev.weeks).toBeGreaterThan(0);
    s.modals = [];
    let guard = 0;
    while (s.models.length === 0 && guard++ < 400) {
      const g = guideStep(s)!;
      // What the guide asks for at each step, as the player would do it.
      if (g.kind === 'development' && g.done) A.finishDevelopment(s, r.id);
      else if (g.kind === 'testing' && g.done) A.finishTesting(s, r.id);
      else if (g.kind === 'tooling' && !g.ordered) expect(A.startTooling(s, r.id, s.lines[0].id, 'soft').ok).toBe(true);
      else if (g.kind === 'launch') expect(A.launchModel(s, r.id, { price: 600, markets: ['usa'], autoShow: false }).ok).toBe(true);
      else tick(s);
      s.modals = [];
    }
    expect(s.models).toHaveLength(1);
    expect(guideStep(s)).toBeNull();
  });

  it('opens the menu screen by screen, keeps what it opened, and marks it new until visited', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 3 });
    updateAreas(s);
    expect(['research', 'finance', 'factory', 'markets', 'company'].filter((a) => areaOpen(s, a as never))).toEqual([]);
    const r = A.startProject(s, { name: 'İlk', segment: 'family', targetPrice: 0 });
    if (!r.ok) throw new Error(r.error);
    expect(updateAreas(s)).toEqual(['research']);
    expect(updateAreas(s)).toEqual([]);
    A.beginDevelopment(s, r.id);
    expect(updateAreas(s)).toEqual(['finance']);
    expect(areaOpen(s, 'factory')).toBe(false);
    // A cancelled project does not close what it opened.
    A.cancelProject(s, r.id);
    expect(areaOpen(s, 'research') && areaOpen(s, 'finance')).toBe(true);
    expect(s.openedNew).toEqual(['research', 'finance']);
    areaSeen(s, 'research');
    expect(s.openedNew).toEqual(['finance']);
  });

  it('leaves the whole menu open from the first car on, with the guide off and in older saves', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 3 });
    s.settings.guided = false;
    expect(areaOpen(s, 'company')).toBe(true);
    expect(guideStep(s)).toBeNull();
    const old = newGame({ companyName: 'Test', hq: 'usa', seed: 3 });
    delete old.settings.guided;
    expect(areaOpen(old, 'markets')).toBe(true);
    const played = newGame({ companyName: 'Test', hq: 'usa', seed: 3 });
    runBot(played, 52 * 2, { segments: ['family'] });
    expect(played.models.length).toBeGreaterThan(0);
    expect(areaOpen(played, 'markets') && areaOpen(played, 'company')).toBe(true);
  });
});
