import type { StateId } from './states';

// Where the company starts, in 1900. Each town has its trade: parts makers next door,
// skilled or cheap hands, a rich market at the gate, or the railways all meeting there.

export type CityId = 'detroit' | 'cleveland' | 'chicago' | 'hartford' | 'newyork' | 'stlouis' | 'losangeles';

export interface CityDef {
  id: CityId;
  name: string;
  state: StateId;
  /** One line for the start screen. */
  blurb: string;
  pros: string[];
  cons: string[];
  /** Parts and materials cost (× the car's unit cost). */
  parts: number;
  /** Factory wages (× line labour). */
  wages: number;
  /** Railway freight rate out of town (× the national rate). */
  freight: number;
}

export const CITIES: CityDef[] = [
  {
    id: 'detroit',
    name: 'Detroit',
    state: 'MI',
    blurb: 'Tekne motoru atölyeleri, dökümhaneler, arabacılar: parça yapan herkes burada.',
    pros: ['Parçalar %8 ucuz', 'Göl ve demiryoluyla her yere yakın'],
    cons: ['Michigan’ın pazarı başta küçük'],
    parts: 0.92,
    wages: 1,
    freight: 1,
  },
  {
    id: 'cleveland',
    name: 'Cleveland',
    state: 'OH',
    blurb: 'Çelik haddehaneleri ve takım tezgâhları; Ohio kalabalık ve varlıklı.',
    pros: ['Parçalar %5 ucuz', 'Ohio büyük bir pazar'],
    cons: ['İşçilik biraz pahalı'],
    parts: 0.95,
    wages: 1.05,
    freight: 1,
  },
  {
    id: 'chicago',
    name: 'Chicago',
    state: 'IL',
    blurb: 'Bütün demiryollarının buluştuğu şehir; Illinois zengin ve kalabalık.',
    pros: ['Nakliye %20 ucuz', 'Illinois büyük bir pazar'],
    cons: ['İşçilik biraz pahalı', 'Parça tedarikçileri uzak'],
    parts: 1.02,
    wages: 1.06,
    freight: 0.8,
  },
  {
    id: 'hartford',
    name: 'Hartford',
    state: 'CT',
    blurb: 'Tüfek ve bisiklet fabrikalarının hassas işçiliği; Yeni İngiltere’nin varlıklı alıcıları.',
    pros: ['Zengin komşu eyaletler', 'Usta tezgâhçılar'],
    cons: ['Connecticut küçük', 'İşçilik pahalı'],
    parts: 0.98,
    wages: 1.12,
    freight: 1,
  },
  {
    id: 'newyork',
    name: 'New York',
    state: 'NY',
    blurb: 'Ülkenin en büyük ve en zengin pazarı; ama her şey pahalı.',
    pros: ['Kapının önünde dev bir pazar'],
    cons: ['İşçilik %18 pahalı', 'Parçalar pahalı'],
    parts: 1.04,
    wages: 1.18,
    freight: 1,
  },
  {
    id: 'stlouis',
    name: 'St. Louis',
    state: 'MO',
    blurb: 'Batıya açılan kapı: Mississippi ve ovaların çiftçileri.',
    pros: ['İşçilik %10 ucuz', 'Ovalara açılan kapı'],
    cons: ['Parça tedarikçileri uzak'],
    parts: 1.05,
    wages: 0.9,
    freight: 0.95,
  },
  {
    id: 'losangeles',
    name: 'Los Angeles',
    state: 'CA',
    blurb: 'Güneşli, hızla büyüyen bir kasaba; yollar yıl boyu açık, California zengin.',
    pros: ['California zengin ve çok büyüyecek', 'İşçilik ucuz'],
    cons: ['Parçalar %15 pahalı (her şey Doğu’dan gelir)', 'Komşu eyaletler neredeyse boş'],
    parts: 1.15,
    wages: 0.94,
    freight: 1.1,
  },
];

const BY_ID = Object.fromEntries(CITIES.map((c) => [c.id, c])) as Record<CityId, CityDef>;
export const cityDef = (id: CityId | undefined) => BY_ID[id ?? 'detroit'] ?? BY_ID.detroit;
