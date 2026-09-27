import { test } from 'vitest';
import { newGame } from '../src/core/game';
import { runBot } from './bot';
import { money } from '../src/core/util';

function report(label: string, s: ReturnType<typeof newGame>) {
  console.log(`\n=== ${label} === gameOver:`, s.gameOver, 'rep', s.company.reputation.toFixed(1), 'skill', s.company.skill.toFixed(0), 'eng', s.company.engineers);
  for (const y of s.years) {
    if (y.year % 4 !== 0 && y.year !== s.years[s.years.length - 1].year) continue;
    const c = y.costs; const pct = (v: number) => y.revenue > 0 ? (100 * v / y.revenue).toFixed(0) + '%' : '-';
    console.log(y.year, 'units', Math.round(y.unitsSold), 'rev', money(y.revenue), 'profit', money(y.profit), pct(y.profit), 'mat', pct(c.materials), 'lab', pct(c.labor), 'dlr', pct(c.dealers), 'fix', pct(c.salaries + c.other), 'inv', pct(c.investment), 'cash', money(y.cashEnd), 'share', Object.entries(y.shareByMarket).map(([k, v]) => `${k}:${(v * 100).toFixed(2)}%`).join(' '));
  }
  for (const m of s.models) console.log(' model', m.name, m.status, 'sold', Math.round(m.unitsSold), 'review', m.reviewScore.toFixed(1), 'defects left', m.defects.filter(d=>!d.found&&!d.fixed).length);
  console.log(' lines', s.lines.map(l => l.name + ':' + Object.values(l.stations).map(x => x.length).join('/')).join(' '));
}

test('bot: family car, US HQ', () => {
  const s = newGame({ companyName: 'Bot', hq: 'usa', seed: 1 });
  runBot(s, 52 * 61, { segments: ['family', 'pickup', 'city'] });
  report('US family+pickup+city', s);
});

test('bot: europe HQ', () => {
  const s = newGame({ companyName: 'Bot', hq: 'europe', seed: 2 });
  runBot(s, 52 * 61, { segments: ['city', 'family'] });
  report('EU city+family', s);
});

test('bot: no testing', () => {
  const s = newGame({ companyName: 'Bot', hq: 'usa', seed: 3 });
  runBot(s, 52 * 30, { segments: ['family'], testWeeks: 0 });
  report('US no tests', s);
});
