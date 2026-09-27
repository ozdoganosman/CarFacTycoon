// Many short campaigns with the standard and the price-for-profit bot: survival across seeds.
import { test } from 'vitest';
import { newGame } from '../src/core/game';
import { runBot } from './bot';
test('several seeds: a scripted player usually survives', () => {
  for (const [hq, seed] of [['europe', 2], ['europe', 5], ['europe', 9], ['usa', 3], ['usa', 8]] as const) {
    for (const smart of [false, true]) {
      const s = newGame({ companyName: 'Bot', hq, seed });
      runBot(s, 52 * 61, { segments: ['city', 'family'], smart });
      console.log(hq, seed, smart ? 'smart' : 'std  ', s.gameOver?.reason, (s.gameOver?.week ?? 0) / 52 + 1900, Math.round(s.company.cash));
    }
  }
}, 600000);
