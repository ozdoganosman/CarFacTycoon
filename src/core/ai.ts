import {
  ASPIRATIONS,
  BODIES,
  CYLINDER_OPTIONS,
  FEATURES,
  FUEL_SYSTEMS,
  SUSPENSIONS,
  VALVETRAINS,
  interp,
  maxCompression,
  maxGears,
} from '../data/tech';
import { segmentDef } from '../data/segments';
import { aiBonus } from './development';
import { boreStrokeFor, knockLimit } from './engine';
import type { Rng } from './rng';
import type {
  BodyId,
  CarDesign,
  DevBonus,
  EngineDesign,
  FeatureId,
  FocusKey,
  MarketId,
  SegmentId,
  ValvetrainId,
} from './types';

// The AI designer builds rival cars (and the era's reference car) with the same
// building blocks the player uses, so every score comes from one consistent model.

export type AiStyle = 'mass' | 'premium' | 'sport' | 'utility';

export interface AiOptions {
  style: AiStyle;
  skill: number;
  market: MarketId;
}

const DISPLACEMENT: Record<MarketId, Record<SegmentId, [number, number][]>> = {
  usa: {
    city: [[1900, 1.2], [1920, 2.2], [1940, 2.5], [1960, 2.6]],
    family: [[1900, 2.2], [1910, 3.0], [1930, 3.3], [1950, 3.9], [1960, 4.6]],
    sport: [[1900, 4.0], [1930, 4.5], [1960, 5.0]],
    pickup: [[1913, 2.9], [1930, 3.2], [1950, 3.9], [1960, 4.2]],
    luxury: [[1900, 5.0], [1915, 6.0], [1930, 7.0], [1960, 6.5]],
    suv: [[1946, 2.2], [1960, 3.5]],
  },
  europe: {
    city: [[1900, 0.8], [1920, 0.8], [1940, 1.0], [1960, 0.9]],
    family: [[1900, 1.8], [1920, 1.6], [1940, 1.8], [1960, 1.5]],
    sport: [[1900, 3.0], [1930, 2.5], [1960, 2.2]],
    pickup: [[1913, 1.5], [1960, 1.6]],
    luxury: [[1900, 5.0], [1930, 5.4], [1960, 3.0]],
    suv: [[1946, 1.6], [1960, 2.0]],
  },
};

function cylindersFor(liters: number, segment: SegmentId, year: number, o: AiOptions, rng: Rng): { cylinders: number; layout: 'inline' | 'v' } {
  const ok = (c: number, l: 'inline' | 'v') => CYLINDER_OPTIONS.some((x) => x.cylinders === c && x.layout === l && x.year <= year);
  if (liters < 0.75) return { cylinders: year < 1905 ? 1 : 2, layout: 'inline' };
  if (liters < 1.3) return { cylinders: year < 1908 ? 2 : 4, layout: 'inline' };
  if (liters < 2.6) return { cylinders: 4, layout: 'inline' };
  if (liters < 4.2) {
    const six = ok(6, 'inline') && year >= 1912 && (o.market === 'usa' || o.style !== 'mass' || segment === 'luxury');
    if (o.market === 'usa' && year >= 1932 && o.style === 'mass' && segment === 'family' && rng() < (year >= 1950 ? 0.7 : 0.4)) {
      return { cylinders: 8, layout: 'v' };
    }
    return six ? { cylinders: 6, layout: 'inline' } : { cylinders: 4, layout: 'inline' };
  }
  if (segment === 'luxury' && ok(12, 'v') && year >= 1930 && rng() < 0.35) {
    return ok(16, 'v') && year < 1940 && rng() < 0.25 ? { cylinders: 16, layout: 'v' } : { cylinders: 12, layout: 'v' };
  }
  if (o.market === 'usa' && ok(8, 'v')) return { cylinders: 8, layout: 'v' };
  if (o.style !== 'mass' && ok(8, 'inline') && year >= 1922) return { cylinders: 8, layout: 'inline' };
  return { cylinders: ok(6, 'inline') ? 6 : 4, layout: 'inline' };
}

function valvetrainFor(segment: SegmentId, year: number, o: AiOptions, rng: Rng): ValvetrainId {
  const ok = (id: ValvetrainId) => VALVETRAINS.find((v) => v.id === id)!.year <= year;
  if (o.style === 'sport' || segment === 'sport') {
    if (year >= 1925 && ok('dohc') && rng() < 0.5) return 'dohc';
    if (year >= 1914 && ok('ohc')) return 'ohc';
    return ok('ohv') ? 'ohv' : 'sv';
  }
  if (o.style === 'premium') {
    if (o.market === 'europe' && year >= 1930 && rng() < 0.3) return 'ohc';
    if (year >= 1910 && ok('ohv')) return 'ohv';
    return ok('ioe') ? 'ioe' : 'sv';
  }
  const switchYear = o.market === 'usa' ? 1949 : 1936;
  return year >= switchYear + Math.floor(rng() * 4) ? 'ohv' : 'sv';
}

export function aiEngine(cc: number, segment: SegmentId, year: number, o: AiOptions, rng: Rng): EngineDesign {
  const { cylinders, layout } = cylindersFor(cc / 1000, segment, year, o, rng);
  const taxed = o.market === 'europe' && year >= 1910 && year <= 1947;
  const strokeRatio = taxed
    ? 1.45 + rng() * 0.15
    : o.market === 'europe'
      ? 1.2 + (rng() - 0.5) * 0.1
      : interp([[1900, 1.2], [1935, 1.15], [1950, 1.0], [1960, 0.92]], year) + (rng() - 0.5) * 0.1;
  const { bore, stroke } = boreStrokeFor(cc, cylinders, strokeRatio);
  const valvetrain = valvetrainFor(segment, year, o, rng);
  const compression = Math.round(Math.min(maxCompression(year) - 0.2 - rng() * 0.3, knockLimit(bore, year) - 0.05) * 10) / 10;
  const fuelOk = (id: string) => FUEL_SYSTEMS.find((f) => f.id === id)!.year <= year;
  let fuelSystem: EngineDesign['fuelSystem'] = 'carb';
  if ((o.style === 'sport' || o.style === 'premium') && fuelOk('carb2') && year >= 1928) fuelSystem = 'carb2';
  if (o.style === 'sport' && fuelOk('injection') && rng() < 0.3) fuelSystem = 'injection';
  const sc = ASPIRATIONS.find((a) => a.id === 'supercharger')!;
  const aspiration: EngineDesign['aspiration'] =
    segment === 'sport' && o.style !== 'mass' && year >= Math.max(sc.year, 1924) && year <= 1940 && rng() < 0.35 ? 'supercharger' : 'na';
  return { cylinders, layout, bore, stroke, compression, valvetrain, fuelSystem, aspiration };
}

function bodyFor(segment: SegmentId, year: number, rng: Rng): BodyId {
  const ok = (id: BodyId) => BODIES.find((b) => b.id === id)!.year <= year;
  switch (segment) {
    case 'city':
      return year < 1916 ? 'roadster' : year < 1926 ? 'phaeton' : 'sedan';
    case 'family':
      return year < 1922 || !ok('sedan') ? 'phaeton' : year > 1935 && rng() < 0.1 && ok('station') ? 'station' : 'sedan';
    case 'sport':
      return year > 1935 && rng() < 0.4 ? 'coupe' : 'roadster';
    case 'luxury':
      return year < 1915 || !ok('sedan') ? 'phaeton' : 'sedan';
    case 'pickup':
      return ok('pickup') ? 'pickup' : 'phaeton';
    case 'suv':
      return ok('suv') ? 'suv' : 'station';
  }
}

const SIZE: Record<SegmentId, number> = { city: 0.1, family: 0.45, sport: 0.3, luxury: 0.85, pickup: 0.5, suv: 0.45 };
const BALANCE: Record<SegmentId, number> = { city: 0.5, family: 0.35, sport: 0.8, luxury: 0.2, pickup: 0.45, suv: 0.45 };
const INTERIOR: Record<SegmentId, number> = { city: 0.15, family: 0.35, sport: 0.45, luxury: 0.9, pickup: 0.05, suv: 0.25 };
const STYLING: Record<AiStyle, number> = { mass: 0.25, premium: 0.7, sport: 0.65, utility: 0.1 };

function featuresFor(segment: SegmentId, year: number, o: AiOptions, rng: Rng): FeatureId[] {
  const baseLag = { premium: 1, sport: 2, mass: 5, utility: 7 }[o.style];
  const segLag = { luxury: -1, sport: 0, family: 0, city: 2, pickup: 3, suv: 1 }[segment];
  const out: FeatureId[] = [];
  for (const f of FEATURES) {
    const lag = Math.max(0, baseLag + segLag + Math.round((rng() - 0.5) * 2));
    if (f.year + lag > year) continue;
    if (f.id === 'airCon' && !(segment === 'luxury' || (o.market === 'usa' && segment === 'family' && year >= 1957))) continue;
    if (f.id === 'radio' && (segment === 'city' || segment === 'pickup') && year < 1950) continue;
    if ((f.id === 'seatBelt' || f.id === 'paddedDash') && o.style !== 'premium' && o.market !== 'europe') continue;
    if (f.requires && !f.requires.every((r) => out.includes(r))) continue;
    out.push(f.id);
  }
  return out;
}

export function aiDesign(segment: SegmentId, year: number, o: AiOptions, rng: Rng): { design: CarDesign; bonus: DevBonus } {
  const cc = interp(DISPLACEMENT[o.market][segment], year) * 1000 * (0.9 + rng() * 0.2);
  const engine = aiEngine(cc, segment, year, o, rng);
  const monoP =
    o.market === 'europe' && (segment === 'city' || segment === 'family')
      ? Math.min(0.9, (year - 1934) / 10)
      : Math.min(0.6, (year - 1940) / 25);
  const chassis = year >= 1934 && rng() < monoP ? 'monocoque' : 'ladder';
  const automaticOk = year >= 1940;
  const autoBox =
    automaticOk && o.market === 'usa' && ((segment === 'luxury' && year >= 1941) || (segment === 'family' && year >= 1950 && rng() < 0.6));
  const synchroYear = o.style === 'premium' ? 1929 : o.market === 'usa' ? 1930 : 1933;
  const gearType = autoBox ? 'automatic' : year >= synchroYear ? 'synchro' : 'sliding';
  const gears = gearType === 'automatic' ? 4 : o.market === 'usa' && segment !== 'sport' ? Math.min(3, maxGears(year)) : segment === 'city' && year < 1932 ? 3 : maxGears(year);
  const suspOk = (id: string) => SUSPENSIONS.find((s) => s.id === id)!.year <= year;
  let suspension: CarDesign['suspension'] = 'leaf';
  if (suspOk('allind') && o.style === 'premium' && year >= 1957) suspension = 'allind';
  else if (suspOk('ifs')) {
    const y = o.style === 'premium' || o.style === 'sport' ? 1934 : o.style === 'utility' || segment === 'pickup' ? 1950 : o.market === 'usa' ? 1936 : 1935;
    if (year >= y) suspension = 'ifs';
  }
  const design: CarDesign = {
    chassis,
    body: bodyFor(segment, year, rng),
    size: Math.min(1, Math.max(0, SIZE[segment] + (o.market === 'usa' && segment !== 'luxury' ? 0.1 : 0) + (rng() - 0.5) * 0.1)),
    styling: Math.min(1, Math.max(0, STYLING[o.style] + (rng() - 0.5) * 0.2)),
    engine,
    gearbox: {
      type: gearType,
      gears,
      spread: segment === 'sport' ? 0.25 : segment === 'city' ? 0.55 : 0.4 + (rng() - 0.5) * 0.2,
    },
    suspension,
    suspBalance: Math.min(1, Math.max(0, BALANCE[segment] + (rng() - 0.5) * 0.1)),
    features: featuresFor(segment, year, o, rng),
    interior: Math.min(1, Math.max(0, INTERIOR[segment] + (o.style === 'premium' ? 0.1 : 0) + (rng() - 0.5) * 0.1)),
  };
  const w = segmentDef(segment).weights;
  const focus: Record<FocusKey, number> = {
    performance: w.accel + w.topSpeed + 0.05,
    efficiency: w.economy + 0.05,
    comfort: w.comfort + 0.05,
    safety: w.safety + 0.05,
    cost: o.style === 'mass' || o.style === 'utility' ? 0.3 : 0.1,
    quality: w.reliability + 0.05,
  };
  return { design, bonus: aiBonus(focus, o.skill) };
}

// ---------- Engine presets for the simple ("easy") engine designer ----------

export interface EnginePreset {
  id: string;
  name: string;
  desc: string;
  design: EngineDesign;
}

const constant = (): number => 0.5;

export function enginePresets(year: number): EnginePreset[] {
  const eco = interp([[1900, 0.8], [1930, 1.0], [1960, 1.1]], year) * 1000;
  const mid = interp([[1900, 1.8], [1930, 2.2], [1960, 1.8]], year) * 1000;
  const big = interp([[1900, 3.5], [1930, 4.0], [1960, 4.5]], year) * 1000;
  const lux = interp([[1900, 6.0], [1930, 6.5], [1960, 6.0]], year) * 1000;
  const presets: EnginePreset[] = [];
  const mk = (id: string, name: string, desc: string, cc: number, seg: SegmentId, style: AiStyle, market: MarketId) => {
    const design = aiEngine(cc, seg, year, { style, skill: 50, market }, constant);
    presets.push({ id, name, desc, design });
  };
  mk('eco', 'Ekonomik', 'Küçük hacim, az yakıt, ucuz; gücü sınırlı.', eco, 'city', 'mass', 'europe');
  mk('mid', 'Dengeli', 'Orta hacim: güç, tüketim ve maliyet arasında denge.', mid, 'family', 'mass', 'europe');
  mk('big', 'Güçlü', 'Büyük hacim, bol tork. Ağır gövdeleri rahat çeker ama çok yakar.', big, 'family', 'mass', 'usa');
  mk('lux', 'Prestij', 'Çok silindirli, ipek gibi çalışan büyük motor. Pahalı.', lux, 'luxury', 'premium', 'usa');
  if (year >= 1912) mk('race', 'Yarış', 'Üstten kamlı, yüksek devirli motor. Güçlü ama hassas.', interp([[1912, 3.0], [1960, 2.5]], year) * 1000, 'sport', 'sport', 'europe');
  if (year >= 1936) {
    const base = aiEngine(interp([[1936, 2.4], [1960, 1.9]], year) * 1000, 'family', year, { style: 'utility', skill: 50, market: 'europe' }, constant);
    const shaped = withStrokeRatio({ ...base, fuel: 'diesel', compression: 17 }, 1.25, year);
    presets.push({ id: 'diesel', name: 'Dizel', desc: 'Mazotla çalışır: çok az yakar, dayanıklıdır; ağır, gürültülü ve yavaştır.', design: shaped });
  }
  return presets;
}

/** Re-shape an engine's bore/stroke for a stroke/bore ratio while keeping its displacement. */
export function withStrokeRatio(e: EngineDesign, ratio: number, year: number): EngineDesign {
  const cc = e.cylinders * (Math.PI / 4) * (e.bore / 10) ** 2 * (e.stroke / 10);
  const { bore, stroke } = boreStrokeFor(cc, e.cylinders, ratio);
  // A diesel has no knock limit: its compression stays where it is.
  if (e.fuel === 'diesel') return { ...e, bore, stroke };
  const compression = Math.round(Math.min(e.compression, knockLimit(bore, year) - 0.05) * 10) / 10;
  return { ...e, bore, stroke, compression: Math.max(3.5, compression) };
}

const REF_STYLE: Record<SegmentId, AiStyle> = {
  city: 'mass',
  family: 'mass',
  sport: 'sport',
  luxury: 'premium',
  pickup: 'utility',
  suv: 'utility',
};

/** The typical new car of a class in a given year (one American, one European). */
export function referenceDesigns(year: number, segment: SegmentId): CarDesign[] {
  return (['usa', 'europe'] as MarketId[]).map(
    (market) => aiDesign(segment, year, { style: REF_STYLE[segment], skill: 55, market }, constant).design,
  );
}

export function referenceBonus(): DevBonus {
  return aiBonus({ performance: 0.2, efficiency: 0.2, comfort: 0.25, safety: 0.15, cost: 0.2, quality: 0.15 }, 55);
}
