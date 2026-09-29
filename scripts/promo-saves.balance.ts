// Saves for the store screenshots and the promo video, played by the smart bot on today's rules.
// Run with PROMO_SAVES=1 npx vitest run --config vitest.balance.config.ts scripts/promo-saves.balance.ts
// (skipped otherwise). Writes promo/capture/saves/play-*.json.gz.
import { test } from 'vitest';
import { writeFileSync } from 'fs';
import { gzipSync } from 'zlib';
import { newGame } from '../src/core/game';
import { makeRng } from '../src/core/rng';
import { techLeap } from '../src/core/rivalMoves';
import { deserialize, serialize } from '../src/core/save';
import { boardOutlook, buyBack, goPublic } from '../src/core/shares';
import { weekFor, weekOfYear } from '../src/core/time';
import type { GameState, SegmentId } from '../src/core/types';
import { runBot } from './bot';

const OUT = 'promo/capture/saves';

/** Names a person would give their cars, in the order they come. */
const NAMES: Record<SegmentId, string[]> = {
  city: ['Öncü Kid', 'Serçe', 'Martı', 'Kırlangıç', 'Güvercin', 'Tarla Kuşu', 'Bülbül', 'Saka'],
  family: ['Bozkurt', 'Kartal', 'Doğan', 'Şahin', 'Atmaca', 'Toygar', 'Alkor', 'Tulpar'],
  pickup: ['Katır', 'Manda', 'Öküz', 'Bozayı'],
  luxury: ['Sultan', 'Hünkâr', 'Paşa'],
  sport: ['Yıldız', 'Şimşek', 'Kasırga'],
  suv: ['Toros', 'Kaçkar'],
};
const BOT_NAME = /^(city|family|pickup|luxury|sport|suv)-\d{4}$/;

/** Give the bot's projects (and so their cars, news and letters) proper names as soon as they start. */
function rename(s: GameState, used: Record<string, number>) {
  for (const p of s.projects) {
    if (!BOT_NAME.test(p.name)) continue;
    const list = NAMES[p.segment];
    const i = used[p.segment] ?? 0;
    used[p.segment] = i + 1;
    p.name = i < list.length ? list[i] : `${list[i % list.length]} ${Math.floor(i / list.length) + 1}`;
  }
}

const write = (name: string, s: GameState) => writeFileSync(`${OUT}/${name}.json.gz`, gzipSync(serialize(s)));

test.skipIf(!process.env.PROMO_SAVES)(
  'promo saves',
  () => {
    const s = newGame({ companyName: 'Anadolu Motor', seed: Number(process.env.PROMO_SEED ?? 5) });
    const o = { segments: ['city', 'family'] as SegmentId[], smart: true };
    const used: Record<string, number> = {};
    /** Play on to that year (and month: mid-year saves show the year's counters filled). */
    const until = (year: number, each?: () => void, month = 0) => {
      while (!s.gameOver && s.week < weekFor(year, month)) {
        runBot(s, 1, o);
        rename(s, used);
        each?.();
      }
      if (s.gameOver && s.gameOver.reason !== 'end') throw new Error(`game over before ${year}: ${JSON.stringify(s.gameOver)}`);
    };
    const snap = (name: string) => {
      const c = deserialize(serialize(s));
      c.modals = [];
      write(name, c);
    };
    // A board that is looked after: pay what it asks for, a little over.
    const payout = () => {
      const sh = s.shares;
      const b = boardOutlook(s);
      if (!sh || !b || weekOfYear(s.week) < 20 || weekOfYear(s.week) % 4) return;
      const need = b.profit > 0 ? sh.target.dividend / (sh.float * b.profit) : 0;
      sh.payout = Math.min(1, Math.max(0.2, need * 1.1));
    };
    until(1903, undefined, 6);
    snap('play-1903');
    until(1908, undefined, 6);
    snap('play-1908');
    until(1924);
    const ipo = goPublic(s, 0.25);
    if (!ipo.ok) throw new Error(`no listing in 1924: ${ipo.error}`);
    until(1928, payout, 6);
    snap('play-1928');
    // The same moment, as a rival answers our lead with the first car of its class to carry something new.
    const r = deserialize(serialize(s));
    const seg = r.models.filter((m) => m.status === 'active').sort((a, b) => b.unitsSold - a.unitsSold)[0]?.segment ?? 'family';
    if (!techLeap(r, seg, makeRng(7))) throw new Error('no rival could answer');
    r.modals = [{ kind: 'event', eventId: 'rival-techLeap' }];
    write('play-1928-rival', r);
    // Out of the board's hands before the crash, then on to the end.
    buyBack(s, 1);
    until(1961, payout);
    s.modals = [{ kind: 'gameOver' }];
    write('play-end', s);
  },
  3_600_000,
);
