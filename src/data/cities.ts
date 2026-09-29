import type { StateId } from './states';
import { msg } from '../i18n';

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
    blurb: msg('Tekne motoru atölyeleri, dökümhaneler, arabacılar: parça yapan herkes burada.'),
    pros: [msg('Parçalar %8 ucuz'), msg('Göl ve demiryoluyla her yere yakın')],
    cons: [msg('Michigan’ın pazarı başta küçük')],
    parts: 0.92,
    wages: 1,
    freight: 1,
  },
  {
    id: 'cleveland',
    name: 'Cleveland',
    state: 'OH',
    blurb: msg('Çelik haddehaneleri ve takım tezgâhları; Ohio kalabalık ve varlıklı.'),
    pros: [msg('Parçalar %5 ucuz'), msg('Ohio büyük bir pazar')],
    cons: [msg('İşçilik biraz pahalı')],
    parts: 0.95,
    wages: 1.05,
    freight: 1,
  },
  {
    id: 'chicago',
    name: 'Chicago',
    state: 'IL',
    blurb: msg('Bütün demiryollarının buluştuğu şehir; Illinois zengin ve kalabalık.'),
    pros: [msg('Nakliye %20 ucuz'), msg('Illinois büyük bir pazar')],
    cons: [msg('İşçilik biraz pahalı'), msg('Parça tedarikçileri uzak')],
    parts: 1.02,
    wages: 1.06,
    freight: 0.8,
  },
  {
    id: 'hartford',
    name: 'Hartford',
    state: 'CT',
    blurb: msg('Tüfek ve bisiklet fabrikalarının hassas işçiliği; Yeni İngiltere’nin varlıklı alıcıları.'),
    pros: [msg('Zengin komşu eyaletler'), msg('Usta tezgâhçılar')],
    cons: [msg('Connecticut küçük'), msg('İşçilik pahalı')],
    parts: 0.98,
    wages: 1.12,
    freight: 1,
  },
  {
    id: 'newyork',
    name: 'New York',
    state: 'NY',
    blurb: msg('Ülkenin en büyük ve en zengin pazarı; ama her şey pahalı.'),
    pros: [msg('Kapının önünde dev bir pazar')],
    cons: [msg('İşçilik %18 pahalı'), msg('Parçalar pahalı')],
    parts: 1.04,
    wages: 1.18,
    freight: 1,
  },
  {
    id: 'stlouis',
    name: 'St. Louis',
    state: 'MO',
    blurb: msg('Batıya açılan kapı: Mississippi ve ovaların çiftçileri.'),
    pros: [msg('İşçilik %10 ucuz'), msg('Ovalara açılan kapı')],
    cons: [msg('Parça tedarikçileri uzak')],
    parts: 1.05,
    wages: 0.9,
    freight: 0.95,
  },
  {
    id: 'losangeles',
    name: 'Los Angeles',
    state: 'CA',
    blurb: msg('Güneşli, hızla büyüyen bir kasaba; yollar yıl boyu açık, California zengin.'),
    pros: [msg('California zengin ve çok büyüyecek'), msg('İşçilik ucuz')],
    cons: [msg('Parçalar %15 pahalı (her şey Doğu’dan gelir)'), msg('Komşu eyaletler neredeyse boş')],
    parts: 1.15,
    wages: 0.94,
    freight: 1.1,
  },
];

const BY_ID = Object.fromEntries(CITIES.map((c) => [c.id, c])) as Record<CityId, CityDef>;
export const cityDef = (id: CityId | undefined) => BY_ID[id ?? 'detroit'] ?? BY_ID.detroit;
