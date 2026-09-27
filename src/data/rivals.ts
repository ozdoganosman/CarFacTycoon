import type { MarketId, SegmentId } from '../core/types';

// Fictional rival manufacturers, loosely inspired by the real history of the industry.

export interface RivalDef {
  id: string;
  name: string;
  home: MarketId;
  founded: number;
  closes?: number;
  skill: number;
  /** Distribution strength over time (0..1). */
  size: [number, number][];
  style: 'mass' | 'premium' | 'sport' | 'utility';
  segments: { seg: SegmentId; from: number; to?: number }[];
  exports?: { market: MarketId; from: number; segments?: SegmentId[] }[];
  color: string;
  /** Model name stems. */
  names: string[];
  /** Mass production pioneer: cheaper cars after the moving line (1913). */
  massProduction?: number;
  /** Landmark models launched at a fixed date and kept for a long time. */
  special?: { seg: SegmentId; year: number; name: string; life: number; priceMult: number; note: string }[];
}

export const RIVALS: RivalDef[] = [
  {
    id: 'hartwell',
    name: 'Hartwell Motor Co.',
    home: 'usa',
    founded: 1903,
    skill: 58,
    size: [[1903, 0.15], [1908, 0.35], [1914, 0.85], [1927, 0.8], [1935, 0.75], [1960, 0.8]],
    style: 'mass',
    segments: [
      { seg: 'family', from: 1903 },
      { seg: 'city', from: 1906, to: 1935 },
      { seg: 'pickup', from: 1917 },
      { seg: 'sport', from: 1955 },
    ],
    exports: [{ market: 'europe', from: 1911, segments: ['family', 'city'] }],
    color: '#2d4f8a',
    names: ['Model H', 'Model N', 'Model R', 'Standard', 'Deluxe', 'Pioneer', 'Frontier', 'Horizon'],
    massProduction: 1913,
    special: [
      {
        seg: 'family',
        year: 1908.75,
        name: 'Model H',
        life: 19,
        priceMult: 0.85,
        note: 'Basit, sağlam ve ucuz. Hartwell onu herkesin alabileceği bir araba olarak tanıtıyor.',
      },
    ],
  },
  {
    id: 'monarch',
    name: 'Monarch Motors',
    home: 'usa',
    founded: 1908,
    skill: 64,
    size: [[1908, 0.3], [1920, 0.6], [1930, 0.9], [1960, 0.95]],
    style: 'mass',
    segments: [
      { seg: 'family', from: 1908 },
      { seg: 'luxury', from: 1910 },
      { seg: 'pickup', from: 1918 },
      { seg: 'city', from: 1912, to: 1930 },
      { seg: 'sport', from: 1953 },
    ],
    exports: [{ market: 'europe', from: 1925, segments: ['family'] }],
    color: '#6b2f7a',
    names: ['Royal', 'Crown', 'Sovereign', 'Regent', 'Majestic', 'Coronation'],
    massProduction: 1916,
  },
  {
    id: 'packwood',
    name: 'Packwood',
    home: 'usa',
    founded: 1900,
    closes: 1958,
    skill: 70,
    size: [[1900, 0.2], [1920, 0.35], [1935, 0.3], [1958, 0.2]],
    style: 'premium',
    segments: [
      { seg: 'luxury', from: 1900 },
      { seg: 'family', from: 1935 },
    ],
    color: '#1f5e4a',
    names: ['Grand Six', 'Eight', 'Grand Eight', 'Envoy', 'Senator'],
  },
  {
    id: 'duvall',
    name: 'Duvall Motor',
    home: 'usa',
    founded: 1913,
    closes: 1937,
    skill: 75,
    size: [[1913, 0.1], [1929, 0.18], [1937, 0.1]],
    style: 'sport',
    segments: [
      { seg: 'sport', from: 1913 },
      { seg: 'luxury', from: 1920 },
    ],
    color: '#8a5a1f',
    names: ['Speedster', 'Model K', 'Supreme'],
  },
  {
    id: 'buckley',
    name: 'Buckley Brothers',
    home: 'usa',
    founded: 1914,
    skill: 57,
    size: [[1914, 0.25], [1925, 0.45], [1960, 0.5]],
    style: 'utility',
    segments: [
      { seg: 'family', from: 1914 },
      { seg: 'pickup', from: 1916 },
    ],
    color: '#7a2a2a',
    names: ['Thirty-Five', 'Victory', 'Senior', 'Workhorse', 'Meridian'],
  },
  {
    id: 'stellar',
    name: 'Stellar Motor Corp.',
    home: 'usa',
    founded: 1925,
    skill: 66,
    size: [[1925, 0.3], [1935, 0.6], [1960, 0.65]],
    style: 'premium',
    segments: [
      { seg: 'family', from: 1925 },
      { seg: 'luxury', from: 1926 },
      { seg: 'sport', from: 1950 },
    ],
    color: '#3d6f8f',
    names: ['Six', 'Aeroline', 'Zenith', 'Orion', 'Polaris'],
  },
  {
    id: 'willard',
    name: 'Willard Motor Works',
    home: 'usa',
    founded: 1908,
    skill: 54,
    size: [[1908, 0.2], [1920, 0.3], [1935, 0.2], [1960, 0.25]],
    style: 'utility',
    segments: [
      { seg: 'family', from: 1908, to: 1955 },
      { seg: 'city', from: 1912, to: 1932 },
      { seg: 'suv', from: 1946 },
    ],
    color: '#5a6b2a',
    names: ['Plainsman', 'Whistler', 'Homestead', 'Trekker', 'Trailmaster'],
  },
  {
    id: 'delacroix',
    name: 'Delacroix Automobiles',
    home: 'europe',
    founded: 1900,
    skill: 60,
    size: [[1900, 0.3], [1920, 0.45], [1960, 0.55]],
    style: 'mass',
    segments: [
      { seg: 'city', from: 1900 },
      { seg: 'family', from: 1900 },
      { seg: 'luxury', from: 1900, to: 1935 },
      { seg: 'pickup', from: 1920 },
    ],
    color: '#2a5a8a',
    names: ['Type A', 'Petite', 'Voiturette', 'Quatre', 'Mistral', 'Étoile', 'Alouette'],
  },
  {
    id: 'brenner',
    name: 'Brenner-Werke',
    home: 'europe',
    founded: 1901,
    skill: 72,
    size: [[1901, 0.2], [1925, 0.3], [1960, 0.4]],
    style: 'premium',
    segments: [
      { seg: 'luxury', from: 1901 },
      { seg: 'sport', from: 1905 },
      { seg: 'family', from: 1926 },
    ],
    exports: [{ market: 'usa', from: 1952, segments: ['luxury', 'sport'] }],
    color: '#4a4a4a',
    names: ['Typ 1', 'Kompressor', 'Rennsport', 'Reise', 'Stern', 'Falke'],
  },
  {
    id: 'aldridge',
    name: 'Aldridge Motor Co.',
    home: 'europe',
    founded: 1905,
    skill: 56,
    size: [[1905, 0.2], [1922, 0.45], [1960, 0.55]],
    style: 'mass',
    segments: [
      { seg: 'city', from: 1905 },
      { seg: 'family', from: 1907 },
      { seg: 'pickup', from: 1924 },
      { seg: 'suv', from: 1948 },
    ],
    color: '#2f6b3a',
    names: ['Tenner', 'Six-Ten', 'Oxbridge', 'Wayfarer', 'Kestrel', 'Highlander'],
  },
  {
    id: 'rossi',
    name: 'Rossi & Figli',
    home: 'europe',
    founded: 1906,
    skill: 63,
    size: [[1906, 0.15], [1925, 0.35], [1960, 0.45]],
    style: 'sport',
    segments: [
      { seg: 'sport', from: 1906 },
      { seg: 'city', from: 1919 },
      { seg: 'family', from: 1925 },
    ],
    color: '#8a2a2a',
    names: ['Primo', 'Tipo 4', 'Rondine', 'Passero', 'Veloce', 'Stella', 'Piccola'],
  },
  {
    id: 'citrelle',
    name: 'Citrelle',
    home: 'europe',
    founded: 1919,
    skill: 65,
    size: [[1919, 0.2], [1930, 0.35], [1960, 0.45]],
    style: 'mass',
    segments: [
      { seg: 'family', from: 1919 },
      { seg: 'city', from: 1922 },
    ],
    color: '#8a7a2a',
    names: ['Type A', 'Cinq', 'Rosace', 'Avant', 'Deux', 'Hirondelle'],
  },
  {
    id: 'volkswerk',
    name: 'Volkswerk',
    home: 'europe',
    founded: 1946,
    skill: 62,
    size: [[1946, 0.2], [1950, 0.45], [1960, 0.7]],
    style: 'mass',
    segments: [
      { seg: 'city', from: 1946 },
      { seg: 'pickup', from: 1950 },
    ],
    exports: [{ market: 'usa', from: 1953, segments: ['city'] }],
    color: '#2a6b6b',
    names: ['Kugel', 'Lastesel', 'Export'],
  },
];
