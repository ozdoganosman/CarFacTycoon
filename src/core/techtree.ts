import { KNOWHOW } from '../data/knowhow';
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
import { msg, t } from '../i18n';

export interface TechItem {
  id: string;
  /** Marked with msg() (a segment's is "<name> segmenti"): show it with techName(). */
  name: string;
  year: number;
  /** Marked with msg(): show it with t(). */
  category: string;
  cardId?: string;
}

let cache: TechItem[] | null = null;

/** Every unlockable thing in the game, for "new this year" announcements. */
export function allTech(): TechItem[] {
  if (cache) return cache;
  const out: TechItem[] = [];
  CHASSIS.forEach((x) => out.push({ id: `chassis:${x.id}`, name: x.name, year: x.year, category: msg('Şasi'), cardId: x.cardId }));
  BODIES.forEach((x) => out.push({ id: `body:${x.id}`, name: x.name, year: x.year, category: msg('Gövde') }));
  VALVETRAINS.forEach((x) => out.push({ id: `vt:${x.id}`, name: x.name, year: x.year, category: msg('Motor') }));
  FUEL_SYSTEMS.forEach((x) => out.push({ id: `fuel:${x.id}`, name: x.name, year: x.year, category: msg('Motor') }));
  ASPIRATIONS.forEach((x) => out.push({ id: `asp:${x.id}`, name: x.name, year: x.year, category: msg('Motor'), cardId: x.cardId }));
  CYLINDER_OPTIONS.forEach((x) => out.push({ id: `cyl:${x.cylinders}${x.layout}`, name: x.label, year: x.year, category: msg('Motor') }));
  GEARBOX_TYPES.forEach((x) => out.push({ id: `gb:${x.id}`, name: x.name, year: x.year, category: msg('Şanzıman'), cardId: x.cardId }));
  out.push({ id: 'fuel:diesel', name: msg('Dizel motor'), year: 1936, category: msg('Motor') });
  out.push({ id: 'gears:4', name: msg('4 ileri vites'), year: 1925, category: msg('Şanzıman') });
  out.push({ id: 'gears:5', name: msg('5 ileri vites'), year: 1955, category: msg('Şanzıman') });
  SUSPENSIONS.forEach((x) => out.push({ id: `susp:${x.id}`, name: x.name, year: x.year, category: msg('Süspansiyon'), cardId: x.cardId }));
  FEATURES.forEach((x) => out.push({ id: `feat:${x.id}`, name: x.name, year: x.year, category: x.group === 'safety' ? msg('Güvenlik') : msg('Donanım'), cardId: x.cardId }));
  KNOWHOW.forEach((x) => out.push({ id: x.id, name: x.name, year: x.year, category: x.area }));
  STATIONS.forEach((x) => out.push({ id: `st:${x.id}`, name: x.name, year: x.year, category: msg('Fabrika'), cardId: x.cardId }));
  SEGMENTS.forEach((x) => out.push({ id: `seg:${x.id}`, name: `${x.name} segmenti`, year: x.year, category: msg('Pazar') }));
  TESTS.forEach((x) => out.push({ id: `test:${x.id}`, name: x.name, year: x.year, category: msg('Test') }));
  cache = out;
  return out;
}

/** A technology's name in the player's language. */
export function techName(x: TechItem): string {
  const seg = x.id.startsWith('seg:') ? SEGMENTS.find((g) => `seg:${g.id}` === x.id) : undefined;
  return seg ? t('{name} segmenti', { name: t(seg.name) }) : t(x.name);
}
