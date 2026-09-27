import { test } from 'vitest';
import { newGame } from '../src/core/game';
import { runBot } from './bot';
import { money } from '../src/core/util';

test('testing A/B', () => {
  for (const seed of [3, 11, 21]) {
    for (const testWeeks of [undefined, 0]) {
      const s = newGame({ companyName: 'Bot', hq: 'usa', seed });
      runBot(s, 52 * 30, { segments: ['family', 'city'], testWeeks });
      const profit = s.years.reduce((a, y) => a + y.profit, 0);
      const warranty = s.years.reduce((a, y) => a + y.costs.warranty, 0);
      const units = s.years.reduce((a, y) => a + y.unitsSold, 0);
      const surfaced = s.models.reduce((a, m) => a + m.defects.filter((d) => d.surfaced).length, 0);
      const hidden = s.models.reduce((a, m) => a + m.defects.filter((d) => !d.found && !d.fixed).length, 0);
      const perc = s.models.map((m) => (m.perceivedReliability - m.stats.reliability).toFixed(1)).join(',');
      console.log(`seed ${seed} tests=${testWeeks === 0 ? 'NO ' : 'yes'} profit ${money(profit)} units ${Math.round(units)} warranty ${money(warranty)} (${((warranty / Math.max(1, profit)) * 100).toFixed(0)}% of profit) surfaced ${surfaced} hidden ${hidden} rep ${s.company.reputation.toFixed(0)} percDelta ${perc}`);
    }
  }
});
