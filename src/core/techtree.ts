import { SEGMENTS } from '../data/segments';
import { STATIONS } from '../data/stations';
import {
  ASPIRATIONS,
  BODIES,
  CHASSIS,
  CYLINDER_OPTIONS,
  FEATURES,
  FUEL_SYSTEMS,
  GEARBOX_TYPES,
  SUSPENSIONS,
  VALVETRAINS,
} from '../data/tech';
import { TESTS } from './testing';

export interface TechItem {
  id: string;
  name: string;
  year: number;
  category: string;
  cardId?: string;
}

let cache: TechItem[] | null = null;

/** Every unlockable thing in the game, for "new this year" announcements. */
export function allTech(): TechItem[] {
  if (cache) return cache;
  const out: TechItem[] = [];
  CHASSIS.forEach((x) => out.push({ id: `chassis:${x.id}`, name: x.name, year: x.year, category: 'Şasi', cardId: x.cardId }));
  BODIES.forEach((x) => out.push({ id: `body:${x.id}`, name: x.name, year: x.year, category: 'Gövde' }));
  VALVETRAINS.forEach((x) => out.push({ id: `vt:${x.id}`, name: x.name, year: x.year, category: 'Motor' }));
  FUEL_SYSTEMS.forEach((x) => out.push({ id: `fuel:${x.id}`, name: x.name, year: x.year, category: 'Motor' }));
  ASPIRATIONS.forEach((x) => out.push({ id: `asp:${x.id}`, name: x.name, year: x.year, category: 'Motor', cardId: x.cardId }));
  CYLINDER_OPTIONS.forEach((x) => out.push({ id: `cyl:${x.cylinders}${x.layout}`, name: x.label, year: x.year, category: 'Motor' }));
  GEARBOX_TYPES.forEach((x) => out.push({ id: `gb:${x.id}`, name: x.name, year: x.year, category: 'Şanzıman', cardId: x.cardId }));
  out.push({ id: 'fuel:diesel', name: 'Dizel motor', year: 1936, category: 'Motor' });
  out.push({ id: 'gears:4', name: '4 ileri vites', year: 1925, category: 'Şanzıman' });
  out.push({ id: 'gears:5', name: '5 ileri vites', year: 1955, category: 'Şanzıman' });
  SUSPENSIONS.forEach((x) => out.push({ id: `susp:${x.id}`, name: x.name, year: x.year, category: 'Süspansiyon', cardId: x.cardId }));
  FEATURES.forEach((x) => out.push({ id: `feat:${x.id}`, name: x.name, year: x.year, category: x.group === 'safety' ? 'Güvenlik' : 'Donanım', cardId: x.cardId }));
  STATIONS.forEach((x) => out.push({ id: `st:${x.id}`, name: x.name, year: x.year, category: 'Fabrika', cardId: x.cardId }));
  SEGMENTS.forEach((x) => out.push({ id: `seg:${x.id}`, name: `${x.name} segmenti`, year: x.year, category: 'Pazar' }));
  TESTS.forEach((x) => out.push({ id: `test:${x.id}`, name: x.name, year: x.year, category: 'Test' }));
  cache = out;
  return out;
}
