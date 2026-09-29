import { test } from 'vitest';
import { newGame, tick } from '../src/core/game';
import { lineReport } from '../src/core/factory';
import { referencePrice } from '../src/core/market';
import { yearFloat } from '../src/core/time';
import { money } from '../src/core/util';
import { botStep, type BotOptions } from './bot';
import type { GameState } from '../src/core/types';

// A profit-seeking player: prices for profit and buys capacity while it pays back.
// Watch the margin, the price over the class price and how far demand runs ahead of supply.
function play(label: string, s: GameState, weeks: number, o: BotOptions) {
  const rows: string[] = [];
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    botStep(s, o);
    tick(s);
    if (s.week % 52 === 0) {
      const yf = yearFloat(s.week);
      const y = s.years[s.years.length - 1];
      if (!y || (y.year % 3 !== 0 && y.year > 1905)) continue;
      const act = s.models.filter((m) => m.status === 'active');
      const info = act
        .map((m) => {
          const cap = s.lines.filter((l) => l.modelId === m.id).reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
          const d = Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
          return `${m.segment}:p/ref ${(m.price / referencePrice(s.company.hq, m.segment, yf)).toFixed(2)} d/cap ${(d / Math.max(0.1, cap)).toFixed(1)} cap ${cap.toFixed(0)}`;
        })
        .join(' | ');
      rows.push(`${y.year} units ${Math.round(y.unitsSold)} rev ${money(y.revenue)} profit ${y.revenue > 0 ? ((100 * y.profit) / y.revenue).toFixed(0) : '-'}% cash ${money(y.cashEnd)} lines ${s.lines.length} share ${(100 * y.shareByMarket[s.company.hq]).toFixed(1)}% · ${info}`);
    }
  }
  console.log(`\n=== ${label} === gameOver`, s.gameOver, '\n' + rows.join('\n'));
}

test('smart US', () => play('smart US family+city', newGame({ companyName: 'Bot', hq: 'usa', seed: 1 }), 52 * 61, { segments: ['family', 'city'], smart: true }));
test('smart US seed 2', () => play('smart US seed 2 city+family', newGame({ companyName: 'Bot', hq: 'usa', seed: 2 }), 52 * 61, { segments: ['city', 'family'], smart: true }));
