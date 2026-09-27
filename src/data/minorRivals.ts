import type { MarketId, SegmentId } from '../core/types';
import type { RivalDef } from './rivals';

// The early industry was crowded: hundreds of small makers opened between 1900
// and the twenties and most were gone by the Depression. These fictional small
// firms are generated from a fixed seed so that every open class has 10-15
// named cars through the first decades and somewhat fewer after
// consolidation. Every game (and every save) meets the same firms. Names are
// invented; well-known historical makes are avoided.

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
  'Upshaw', 'Vandermeer', 'Whitcombe', 'Yarborough', 'Ashby', 'Bramwell', 'Colfax', 'Dunmore', 'Ellery', 'Fairchild',
  'Gilmore', 'Hartley', 'Ingram', 'Jessop', 'Kendrick', 'Lowell', 'Merriweather', 'Norcross', 'Oakes', 'Prescott',
  'Radford', 'Sherwood', 'Thorne', 'Underwood', 'Vail', 'Wexford', 'Aldine', 'Brenton', 'Caldwell', 'Dorsey',
  'Emmons', 'Fitchett', 'Garrick', 'Holbrook', 'Irving', 'Jennings', 'Kirkland', 'Lamont', 'Merrick-Hale', 'Newcomb',
];
const US_FORMS = ['{} Motor Car Co.', '{} Automobile Co.', '{} Brothers', '{} Motor Works', '{} & Sons', '{} Motor Co.', '{} Carriage Co.'];
const US_MODELS = ['Model A', 'Model B', 'Model C', 'Twenty', 'Thirty', 'Forty', 'Special', 'Light Six', 'Big Four', 'Tourer', 'Roadster', 'Standard Six', 'Senior', 'Junior', 'Custom', 'Commander'];

const EU_GROUPS: { names: string[]; forms: string[]; models: string[] }[] = [
  {
    names: ['Beaumont', 'Chardin', 'Dufresne', 'Fournel', 'Garnier', 'Lemaire', 'Morvan', 'Thibault', 'Aubert', 'Bonnard', 'Castel', 'Delorme', 'Ferrand', 'Giraud', 'Lacroix-Vidal', 'Marchal', 'Noiret', 'Perrin', 'Roussel', 'Vasseur'],
    forms: ['Automobiles {}', '{} et Cie', 'Voitures {}', 'Ateliers {}'],
    models: ['Type A', 'Type B', 'Type C', '8 CV', '10 CV', '12 CV', '15 CV', 'Grand Sport', 'Torpédo', 'Coach', 'Faux-Cabriolet'],
  },
  {
    names: ['Albrecht', 'Brandt', 'Eckhardt', 'Falkner', 'Hartung', 'Kessler', 'Lindner', 'Seidel', 'Adelmann', 'Baumann', 'Dietz', 'Engel', 'Fuchs', 'Grothe', 'Hellwig', 'Jansen', 'Krause', 'Lorenz', 'Nagel', 'Richter'],
    forms: ['{}-Werke', '{} Motorenbau', '{} & Söhne', '{} Automobilbau'],
    models: ['Typ 8/20', 'Typ 10/30', 'Typ 12/40', 'Typ 16/50', 'Sport', 'Reise', 'Kabriolett', 'Limousine', 'Pullman'],
  },
  {
    names: ['Ashcombe', 'Blackwood', 'Carrington', 'Denholm', 'Everard', 'Fairleigh', 'Harcourt', 'Kingsley', 'Ainsworth', 'Beresford', 'Cranbrook', 'Dalton', 'Elmhurst', 'Farrant', 'Greaves', 'Hollins', 'Lambourne', 'Marlow', 'Pemberton', 'Radley'],
    forms: ['{} Motor Co.', '{} & Co.', '{} Cars Ltd.', '{} Engineering'],
    models: ['Ten', 'Twelve', 'Fourteen', 'Sixteen', 'Sports', 'Tourer', 'Twenty', 'Saloon', 'Coupé'],
  },
  {
    names: ['Bellandi', 'Ferrante', 'Galli', 'Pellegrini', 'Rinaldi', 'Sartori', 'Tedeschi', 'Valsecchi', 'Albani', 'Bertolli', 'Cattaneo', 'Donati', 'Fabbri', 'Grimaldi', 'Longhi', 'Mazzola', 'Negri', 'Orsini', 'Paviglia', 'Rivetti'],
    forms: ['Officine {}', '{} & C.', 'Automobili {}', 'Fabbrica {}'],
    models: ['Tipo 1', 'Tipo 2', 'Tipo 3', 'Tipo 4', 'Sport', 'Torpedo', 'Spider', 'Berlina', 'Gran Turismo'],
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

/** How many named cars each class should offer in a market over time (majors included). */
const TARGET: Record<SegmentId, [number, number][]> = {
  city: [[1900, 10], [1910, 13], [1925, 12], [1935, 9], [1950, 8], [1960, 8]],
  family: [[1900, 11], [1910, 15], [1925, 14], [1935, 10], [1950, 9], [1960, 9]],
  sport: [[1900, 9], [1910, 11], [1925, 11], [1935, 8], [1950, 8], [1960, 8]],
  luxury: [[1900, 9], [1910, 12], [1925, 11], [1935, 8], [1950, 6], [1960, 6]],
  pickup: [[1913, 6], [1920, 9], [1935, 8], [1960, 8]],
  suv: [[1946, 4], [1950, 6], [1960, 7]],
};
const OPENS: Record<SegmentId, number> = { city: 1900, family: 1900, sport: 1900, luxury: 1900, pickup: 1913, suv: 1946 };
const NEIGHBOUR: Record<SegmentId, SegmentId> = { city: 'family', family: 'city', sport: 'luxury', luxury: 'sport', pickup: 'family', suv: 'pickup' };

function interp(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
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

/** Does this company sell a car of this class in this market at this time? */
function covers(r: RivalDef, market: MarketId, seg: SegmentId, y: number): boolean {
  if (r.founded > y || (r.closes !== undefined && y >= r.closes)) return false;
  if (!r.segments.some((e) => e.seg === seg && e.from <= y && (e.to === undefined || y < e.to))) return false;
  return r.home === market || (r.exports ?? []).some((x) => x.market === market && x.from <= y && (!x.segments || x.segments.includes(seg)));
}

function makeFor(market: MarketId, majors: RivalDef[], seed: number): RivalDef[] {
  const rng = mulberry32(seed);
  const out: RivalDef[] = [];
  const used = new Set<string>(majors.map((r) => r.name));
  const newName = (): { name: string; models: string[] } => {
    for (let tries = 0; tries < 40; tries++) {
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
      const name = form.replace('{}', base);
      if (!used.has(name)) {
        used.add(name);
        return { name, models };
      }
    }
    const name = `${pick(rng, market === 'usa' ? US_NAMES : EU_GROUPS[0].names)} ${out.length}`;
    used.add(name);
    return { name, models: market === 'usa' ? US_MODELS : EU_GROUPS[0].models };
  };
  for (let y = 1900; y <= 1960; y += 0.5) {
    for (const seg of Object.keys(TARGET) as SegmentId[]) {
      if (OPENS[seg] > y) continue;
      const target = Math.round(interp(TARGET[seg], y));
      let count = majors.filter((r) => covers(r, market, seg, y)).length + out.filter((r) => covers(r, market, seg, y)).length;
      while (count < target) {
        // Firms that exist when the game starts were founded a little earlier.
        const founded = y === 1900 ? 1900 : Math.round((y - rng() * 0.4) * 4) / 4;
        const survivor = rng() < 0.12;
        const life = 4 + rng() * 20;
        const closes = survivor ? undefined : Math.min(1960, Math.round((founded + life) * 4) / 4);
        const { name, models } = newName();
        const segments: RivalDef['segments'] = [{ seg, from: Math.max(founded, OPENS[seg]) }];
        const second = NEIGHBOUR[seg];
        if (rng() < 0.25) segments.push({ seg: second, from: Math.max(founded + 1 + Math.floor(rng() * 3), OPENS[second]) });
        const start = 0.04 + rng() * 0.05;
        const peak = 0.06 + rng() * 0.09;
        // Firms already selling when the game starts are established: they begin close to their peak.
        const size: [number, number][] = [
          [founded, y === 1900 ? Math.max(start, 0.9 * peak) : start],
          [founded + 4, peak],
        ];
        if (closes) size.push([Math.max(closes, founded + 4.5), start * 0.6]);
        else size.push([1960, peak]);
        out.push({
          id: `m2-${market}-${out.length}`,
          name,
          home: market,
          founded,
          closes,
          skill: Math.round(42 + rng() * 22),
          size,
          style: SEGMENT_STYLE[seg],
          segments,
          color: colour(rng),
          names: shuffle(rng, models).slice(0, 5),
        });
        count++;
      }
    }
  }
  return out;
}

export function makeMinorRivals(majors: RivalDef[]): RivalDef[] {
  return [...makeFor('usa', majors, 1901), ...makeFor('europe', majors, 1902)];
}
