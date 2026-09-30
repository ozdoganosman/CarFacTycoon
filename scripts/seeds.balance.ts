// Many campaigns with the standard and the price-for-profit bot: survival across seeds.
import { expect, test } from 'vitest';
import { companyValue, newGame } from '../src/core/game';
import { runBot } from './bot';

test('several seeds: a scripted player survives to 1960', () => {
  const survived = { std: 0, smart: 0 };
  // The American market only: five towns' worth of seeds.
  for (const [hq, seed] of [['usa', 2], ['usa', 5], ['usa', 9], ['usa', 3], ['usa', 8]] as const) {
    for (const smart of [false, true]) {
      const s = newGame({ companyName: 'Bot', hq, seed });
      runBot(s, 52 * 61, { segments: ['city', 'family'], smart });
      const margins = s.years.slice(1, 6).map((y) => (y.revenue > 0 ? Math.round((y.profit / y.revenue) * 100) : 0));
      // Cash alone says little (money can sit idle): the company's worth and the share of the market it won too.
      const peak = Math.max(...s.years.map((y) => y.shareByMarket.usa ?? 0));
      console.log(
        hq,
        seed,
        smart ? 'smart' : 'std  ',
        s.gameOver?.reason,
        ((s.gameOver?.week ?? 0) / 52 + 1900).toFixed(1),
        Math.round(s.company.cash),
        'value',
        Math.round(companyValue(s)),
        'peak share',
        (100 * peak).toFixed(1) + '%',
        '1901-05 margins',
        margins.join(' '),
      );
      if (s.gameOver?.reason === 'end') survived[smart ? 'smart' : 'std'] += 1;
    }
  }
  // A player who follows the class price and never optimises should still get through.
  expect(survived.std).toBeGreaterThanOrEqual(4);
  expect(survived.smart).toBe(5);
}, 900000);
