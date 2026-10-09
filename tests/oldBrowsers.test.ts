import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { newProjectBudget } from '../src/core/budget';
import { availableSegments, newGame } from '../src/core/game';
import { clone } from '../src/core/util';
import { runBot } from '../scripts/bot';

// Players of the public build reached the game on browsers without structuredClone (Chrome
// before 98, Safari before 15.4, old Android WebViews): the new-project window broke and no
// one could start a car. The game must not need functions those browsers lack.

const NEWER = [/\bstructuredClone\(/, /\.at\(/, /\bfindLast(Index)?\(/, /\bObject\.hasOwn\(/, /\.replaceAll\(/, /\.to(Sorted|Reversed|Spliced)\(/, /\bObject\.groupBy\(/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe('older browsers', () => {
  it('the game code calls no browser function they lack', () => {
    const found: string[] = [];
    for (const f of files('src')) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return;
          for (const re of NEWER) if (re.test(line)) found.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(found).toEqual([]);
  });

  // (Array.prototype.at cannot be taken away here: the test runner uses it; the scan above covers it.)
  describe('without structuredClone', () => {
    const saved = globalThis.structuredClone;
    beforeAll(() => {
      // @ts-expect-error a browser without it
      delete globalThis.structuredClone;
    });
    afterAll(() => {
      globalThis.structuredClone = saved;
    });

    it('the new-project window works and a first car reaches the market', () => {
      const s = newGame({ companyName: 'Test', hq: 'usa', seed: 2 });
      for (const seg of availableSegments(s)) expect(newProjectBudget(s, seg)).not.toBeNull();
      runBot(s, 52 * 3, { segments: ['family'] });
      expect(s.models.length).toBeGreaterThan(0);
      // a new generation and a facelift copy the design of the car on sale
      expect(newProjectBudget(s, 'family', s.models[0].id)).not.toBeNull();
      expect(A.startFacelift(s, s.models[0].id).ok).toBe(true);
    });
  });

  it('clone copies game data deeply, Infinity and missing values included', () => {
    const a = { n: Infinity, list: [1, { x: 2 }], none: undefined as number | undefined, nan: NaN };
    const b = clone(a);
    expect(b).toEqual(a);
    expect(b.list).not.toBe(a.list);
    expect(b.list[1]).not.toBe(a.list[1]);
    expect(b.n).toBe(Infinity);
    expect(Number.isNaN(b.nan)).toBe(true);
  });
});
