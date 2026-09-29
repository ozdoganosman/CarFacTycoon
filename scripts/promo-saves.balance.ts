// Saves for the store screenshots and the promo video, played by the smart bot on today's rules.
// Run with PROMO_SAVES=1 npx vitest run --config vitest.balance.config.ts scripts/promo-saves.balance.ts
// (skipped otherwise). Writes promo/capture/saves/play-*.json.gz; with PROMO_LANG=en (de, es, hi, ar) the game
// is played in that language (its news, letters and names) and the saves are play-*-en.json.gz.
import { test } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { gzipSync } from 'zlib';
import { newGame } from '../src/core/game';
import { makeRng } from '../src/core/rng';
import { techLeap } from '../src/core/rivalMoves';
import { deserialize, serialize } from '../src/core/save';
import { boardOutlook, buyBack, goPublic } from '../src/core/shares';
import { weekFor, weekOfYear } from '../src/core/time';
import type { GameState, SegmentId } from '../src/core/types';
import { setLanguage, type Catalog, type Lang } from '../src/i18n';
import { runBot } from './bot';

const OUT = 'promo/capture/saves';

const LANG = (process.env.PROMO_LANG ?? 'tr') as Lang;
const SUFFIX = LANG === 'tr' ? '' : `-${LANG}`;

/** The player's company in each language. */
const COMPANY: Record<string, string> = {
  tr: 'Anadolu Motor',
  en: 'Liberty Motor Co.',
  de: 'Falke Motorenwerke',
  es: 'Motores Cóndor',
  hi: 'गरुड़ मोटर्स',
  ar: 'النجم للسيارات',
};

/** Names a person would give their cars, in the order they come. */
const NAMES_BY_LANG: Record<string, Record<SegmentId, string[]>> = {
  en: {
    city: ['Pioneer Kid', 'Sparrow', 'Swallow', 'Wren', 'Dove', 'Lark', 'Robin', 'Finch'],
    family: ['Grey Wolf', 'Eagle', 'Falcon', 'Hawk', 'Kestrel', 'Condor', 'Osprey', 'Harrier'],
    pickup: ['Mule', 'Buffalo', 'Ox', 'Grizzly'],
    luxury: ['Sultan', 'Regent', 'Monarch'],
    sport: ['Star', 'Lightning', 'Cyclone'],
    suv: ['Sierra', 'Rockies'],
  },
  de: {
    city: ['Pionier', 'Spatz', 'Schwalbe', 'Zaunkönig', 'Taube', 'Lerche', 'Rotkehlchen', 'Fink'],
    family: ['Wolf', 'Adler', 'Falke', 'Habicht', 'Sperber', 'Kondor', 'Fischadler', 'Milan'],
    pickup: ['Maultier', 'Büffel', 'Ochse', 'Grizzly'],
    luxury: ['Kaiser', 'Regent', 'Monarch'],
    sport: ['Stern', 'Blitz', 'Wirbelsturm'],
    suv: ['Alpen', 'Rocky'],
  },
  es: {
    city: ['Pionero', 'Gorrión', 'Golondrina', 'Jilguero', 'Paloma', 'Alondra', 'Petirrojo', 'Pinzón'],
    family: ['Lobo', 'Águila', 'Halcón', 'Azor', 'Cernícalo', 'Cóndor', 'Quebrantahuesos', 'Milano'],
    pickup: ['Mula', 'Búfalo', 'Buey', 'Oso'],
    luxury: ['Sultán', 'Regente', 'Monarca'],
    sport: ['Estrella', 'Relámpago', 'Ciclón'],
    suv: ['Sierra', 'Andes'],
  },
  hi: {
    city: ['पायनियर', 'गौरैया', 'अबाबील', 'मैना', 'कबूतर', 'बुलबुल', 'कोयल', 'तोता'],
    family: ['भेड़िया', 'गरुड़', 'बाज़', 'शिकरा', 'चील', 'कोंडोर', 'ओस्प्रे', 'हैरियर'],
    pickup: ['खच्चर', 'भैंसा', 'बैल', 'भालू'],
    luxury: ['सुल्तान', 'महाराजा', 'सम्राट'],
    sport: ['तारा', 'बिजली', 'तूफ़ान'],
    suv: ['हिमालय', 'अरावली'],
  },
  ar: {
    city: ['الرائد', 'العصفور', 'السنونو', 'الحسون', 'اليمامة', 'القبرة', 'أبو الحناء', 'الشرشور'],
    family: ['الذئب', 'العقاب', 'الصقر', 'الباشق', 'العوسق', 'الكندور', 'العقاب النساري', 'الحدأة'],
    pickup: ['البغل', 'الجاموس', 'الثور', 'الدب'],
    luxury: ['السلطان', 'الأمير', 'الملك'],
    sport: ['النجم', 'البرق', 'الإعصار'],
    suv: ['الجبل', 'الصحراء'],
  },
};

const NAMES_TR: Record<SegmentId, string[]> = {
  city: ['Öncü Kid', 'Serçe', 'Martı', 'Kırlangıç', 'Güvercin', 'Tarla Kuşu', 'Bülbül', 'Saka'],
  family: ['Bozkurt', 'Kartal', 'Doğan', 'Şahin', 'Atmaca', 'Toygar', 'Alkor', 'Tulpar'],
  pickup: ['Katır', 'Manda', 'Öküz', 'Bozayı'],
  luxury: ['Sultan', 'Hünkâr', 'Paşa'],
  sport: ['Yıldız', 'Şimşek', 'Kasırga'],
  suv: ['Toros', 'Kaçkar'],
};
const NAMES = NAMES_BY_LANG[LANG] ?? NAMES_TR;
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

const write = (name: string, s: GameState) => writeFileSync(`${OUT}/${name}${SUFFIX}.json.gz`, gzipSync(serialize(s)));

test.skipIf(!process.env.PROMO_SAVES)(
  'promo saves',
  () => {
    // The game in the chosen language: its catalog, as the app would load it.
    if (LANG !== 'tr') setLanguage(LANG, JSON.parse(readFileSync(`src/i18n/locales/${LANG}.json`, 'utf8')) as Catalog);
    const s = newGame({ companyName: COMPANY[LANG] ?? COMPANY.tr, seed: Number(process.env.PROMO_SEED ?? 5) });
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
