import type { MarketId, SegmentId } from '../core/types';
import type { RivalDef } from './rivals';

// The early industry was crowded: hundreds of small makers opened between 1900
// and 1920 and most were gone by the Depression. These fictional small firms
// are generated from a fixed seed, so every game (and every save) meets the
// same ones. Names are invented; well-known historical makes are avoided.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const US_NAMES = [
  'Abernathy', 'Barrington', 'Cartwright', 'Delmont', 'Eversley', 'Fenmore', 'Galloway', 'Hollister', 'Ivers', 'Jarrett',
  'Kimball', 'Lindquist', 'Marston', 'Northcutt', 'Osgood', 'Pendleton', 'Quarles', 'Ridgeway', 'Sutcliffe', 'Tolliver',
  'Upshaw', 'Vandermeer', 'Whitcombe', 'Yarborough',
];
const US_FORMS = ['{} Motor Car Co.', '{} Automobile Co.', '{} Brothers', '{} Motor Works', '{} & Sons'];
const US_MODELS = ['Model A', 'Model B', 'Twenty', 'Thirty', 'Special', 'Light Six', 'Big Four', 'Tourer', 'Roadster', 'Standard Six'];

const EU_GROUPS: { names: string[]; forms: string[]; models: string[] }[] = [
  {
    names: ['Beaumont', 'Chardin', 'Dufresne', 'Fournel', 'Garnier', 'Lemaire', 'Morvan', 'Thibault'],
    forms: ['Automobiles {}', '{} et Cie', 'Voitures {}'],
    models: ['Type A', 'Type B', '8 CV', '10 CV', '12 CV', 'Grand Sport', 'Torpédo'],
  },
  {
    names: ['Albrecht', 'Brandt', 'Eckhardt', 'Falkner', 'Hartung', 'Kessler', 'Lindner', 'Seidel'],
    forms: ['{}-Werke', '{} Motorenbau', '{} & Söhne'],
    models: ['Typ 8/20', 'Typ 10/30', 'Sport', 'Reise', 'Typ 12/40', 'Kabriolett'],
  },
  {
    names: ['Ashcombe', 'Blackwood', 'Carrington', 'Denholm', 'Everard', 'Fairleigh', 'Harcourt', 'Kingsley'],
    forms: ['{} Motor Co.', '{} & Co.', '{} Cars Ltd.'],
    models: ['Ten', 'Twelve', 'Fourteen', 'Sports', 'Tourer', 'Twenty'],
  },
  {
    names: ['Bellandi', 'Ferrante', 'Galli', 'Pellegrini', 'Rinaldi', 'Sartori', 'Tedeschi', 'Valsecchi'],
    forms: ['Officine {}', '{} & C.', 'Automobili {}'],
    models: ['Tipo 1', 'Tipo 2', 'Sport', 'Torpedo', 'Tipo 3', 'Spider'],
  },
];

const SEGMENT_STYLE: Record<SegmentId, RivalDef['style']> = {
  city: 'mass',
  family: 'mass',
  sport: 'sport',
  luxury: 'premium',
  pickup: 'utility',
  suv: 'utility',
};

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function pickWeighted<T>(rng: () => number, items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [x, w] of items) {
    r -= w;
    if (r <= 0) return x;
  }
  return items[items.length - 1][0];
}

function shuffle<T>(rng: () => number, list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function colour(rng: () => number): string {
  const h = Math.floor(rng() * 360);
  const c = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = 0.45 - 0.25 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${c(0)}${c(8)}${c(4)}`;
}

function makeRivals(market: MarketId, count: number, seed: number): RivalDef[] {
  const rng = mulberry32(seed);
  const out: RivalDef[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    // Founding waves: most before the First World War, a few in the twenties.
    const founded = Math.round(pickWeighted(rng, [[1900 + rng() * 8, 0.55], [1908 + rng() * 10, 0.35], [1920 + rng() * 9, 0.1]]) * 4) / 4;
    const survivor = i % 10 === 3;
    const life = 5 + rng() * 17;
    const closes = survivor ? undefined : Math.min(1958, Math.round((founded + life) * 4) / 4);
    let base: string;
    let form: string;
    let models: string[];
    if (market === 'usa') {
      base = pick(rng, US_NAMES);
      form = pick(rng, US_FORMS);
      models = US_MODELS;
    } else {
      const g = pick(rng, EU_GROUPS);
      base = pick(rng, g.names);
      form = pick(rng, g.forms);
      models = g.models;
    }
    let name = form.replace('{}', base);
    if (used.has(name)) name = `${base} ${market === 'usa' ? 'Motor Co.' : 'Automobiles'}`;
    if (used.has(name)) continue;
    used.add(name);
    const main = pickWeighted<SegmentId>(rng, [
      ['family', 0.35],
      ['city', 0.3],
      ['sport', 0.17],
      ['luxury', 0.13],
      ['pickup', founded >= 1912 ? 0.1 : 0],
    ]);
    const segments: RivalDef['segments'] = [{ seg: main, from: Math.max(founded, main === 'pickup' ? 1913 : 1900) }];
    if (rng() < 0.3) {
      const second: SegmentId = main === 'family' ? 'city' : main === 'city' ? 'family' : main === 'sport' ? 'luxury' : main === 'luxury' ? 'sport' : 'family';
      segments.push({ seg: second, from: Math.max(founded + 1 + Math.floor(rng() * 3), 1900) });
    }
    const start = 0.04 + rng() * 0.05;
    const peak = 0.06 + rng() * 0.09;
    const size: [number, number][] = [
      [founded, start],
      [founded + 4, peak],
    ];
    if (closes) size.push([closes, start * 0.6]);
    else size.push([1960, peak]);
    out.push({
      id: `minor-${market}-${i}`,
      name,
      home: market,
      founded,
      closes,
      skill: Math.round(44 + rng() * 20),
      size,
      style: SEGMENT_STYLE[main],
      segments,
      color: colour(rng),
      names: shuffle(rng, models),
    });
  }
  return out;
}

export const MINOR_RIVALS: RivalDef[] = [...makeRivals('usa', 22, 1901), ...makeRivals('europe', 22, 1902)];
