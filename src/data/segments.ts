import type { AttrKey, BodyId, MarketId, SegmentId } from '../core/types';

export interface SegmentDef {
  id: SegmentId;
  name: string;
  buyers: string; // "Pikap alıcıları"
  year: number;
  desc: string;
  /** Hidden importance weights (sum ≈ 1). The player discovers them through feedback. */
  weights: Record<AttrKey, number>;
  priceSens: number;
  brandSens: number;
  defaultBody: BodyId;
  defaultSize: number;
  icon: string;
}

export const ATTRS: AttrKey[] = [
  'accel',
  'topSpeed',
  'economy',
  'comfort',
  'handling',
  'safety',
  'reliability',
  'prestige',
  'practicality',
];

export const ATTR_NAMES: Record<AttrKey, string> = {
  accel: 'Hızlanma',
  topSpeed: 'Son hız',
  economy: 'Yakıt ekonomisi',
  comfort: 'Konfor',
  handling: 'Yol tutuş',
  safety: 'Güvenlik',
  reliability: 'Güvenilirlik',
  prestige: 'Prestij',
  practicality: 'Pratiklik',
};

export const SEGMENTS: SegmentDef[] = [
  {
    id: 'city',
    name: 'Şehir arabası',
    buyers: 'Şehir arabası alıcıları',
    year: 1900,
    desc: 'Şehirde yaşayan doktorlar, memurlar, esnaf. Çoğu ilk otomobilini alacak.',
    weights: { accel: 0.03, topSpeed: 0.02, economy: 0.24, comfort: 0.07, handling: 0.12, safety: 0.05, reliability: 0.2, prestige: 0.02, practicality: 0.25 },
    priceSens: 1.6,
    brandSens: 0.6,
    defaultBody: 'roadster',
    defaultSize: 0.1,
    icon: '🛵',
  },
  {
    id: 'family',
    name: 'Aile arabası',
    buyers: 'Aile arabası alıcıları',
    year: 1900,
    desc: 'Kalabalık aileler: pazar gezmeleri, akraba ziyaretleri, uzun yollar.',
    weights: { accel: 0.05, topSpeed: 0.06, economy: 0.14, comfort: 0.2, handling: 0.05, safety: 0.12, reliability: 0.18, prestige: 0.05, practicality: 0.15 },
    priceSens: 1.2,
    brandSens: 1,
    defaultBody: 'phaeton',
    defaultSize: 0.45,
    icon: '🚗',
  },
  {
    id: 'sport',
    name: 'Spor araba',
    buyers: 'Spor araba alıcıları',
    year: 1900,
    desc: 'Genç zenginler, yarış meraklıları, hafta sonu pilotları.',
    weights: { accel: 0.28, topSpeed: 0.25, economy: 0.02, comfort: 0.03, handling: 0.24, safety: 0.02, reliability: 0.06, prestige: 0.1, practicality: 0 },
    priceSens: 0.95,
    brandSens: 1.2,
    defaultBody: 'roadster',
    defaultSize: 0.3,
    icon: '🏁',
  },
  {
    id: 'pickup',
    name: 'Pikap',
    buyers: 'Pikap alıcıları',
    year: 1913,
    desc: 'Çiftçiler, nalburlar, inşaatçılar: arabayı iş için alanlar.',
    weights: { accel: 0.02, topSpeed: 0.03, economy: 0.1, comfort: 0.03, handling: 0.02, safety: 0.05, reliability: 0.4, prestige: 0, practicality: 0.35 },
    priceSens: 1.3,
    brandSens: 0.7,
    defaultBody: 'pickup',
    defaultSize: 0.5,
    icon: '🛻',
  },
  {
    id: 'luxury',
    name: 'Lüks',
    buyers: 'Lüks araç alıcıları',
    year: 1900,
    desc: 'Sanayiciler, bankacılar, film yıldızları. Arabalarını çoğu zaman şoför sürer.',
    weights: { accel: 0.05, topSpeed: 0.08, economy: 0, comfort: 0.3, handling: 0.04, safety: 0.1, reliability: 0.1, prestige: 0.33, practicality: 0 },
    priceSens: 0.6,
    brandSens: 2,
    defaultBody: 'phaeton',
    defaultSize: 0.85,
    icon: '🎩',
  },
  {
    id: 'suv',
    name: 'Arazi aracı',
    buyers: 'Arazi aracı alıcıları',
    year: 1946,
    desc: 'Savaştan dönen askerler, köy doktorları, orman bekçileri.',
    weights: { accel: 0.02, topSpeed: 0.03, economy: 0.06, comfort: 0.1, handling: 0.04, safety: 0.12, reliability: 0.26, prestige: 0.1, practicality: 0.27 },
    priceSens: 1,
    brandSens: 1,
    defaultBody: 'suv',
    defaultSize: 0.45,
    icon: '⛰️',
  },
];

/** How each market bends the base weights. */
export const MARKET_TASTE: Record<MarketId, Partial<Record<AttrKey, number>>> = {
  usa: { accel: 1.2, topSpeed: 1.3, economy: 0.5, comfort: 1.2, handling: 0.8, practicality: 1.1 },
  europe: { topSpeed: 0.9, economy: 1.6, comfort: 0.9, handling: 1.4, prestige: 1.1 },
};

export function segmentDef(id: SegmentId): SegmentDef {
  return SEGMENTS.find((s) => s.id === id)!;
}

export function importanceLabel(w: number): { label: string; level: number } {
  if (w >= 0.2) return { label: 'Çok yüksek', level: 4 };
  if (w >= 0.1) return { label: 'Yüksek', level: 3 };
  if (w >= 0.05) return { label: 'Orta', level: 2 };
  if (w > 0.005) return { label: 'Düşük', level: 1 };
  return { label: 'Önemsiz', level: 0 };
}
