import { msg } from '../i18n';

// What a grown company spends its money on beyond lines and dealers. Costs are in 1900 dollars
// (multiplied by costIndex). Names and descriptions are marked with msg(): show them with t().

/**
 * The engineering organisation. A big team on one car waits for drawings, tests and decisions;
 * the span is how many engineers' work a team can at most turn out (see teamOutput): a drawing
 * office, departments with their own chiefs, a proving ground, laboratories and finally a
 * technical centre let a large engineering staff work at once. Each level also speeds research.
 */
export interface EngineeringLevel {
  level: number;
  name: string;
  desc: string;
  year: number;
  cost: number;
  span: number;
  /** Research goes this much faster. */
  research: number;
}

export const ENGINEERING_LEVELS: EngineeringLevel[] = [
  { level: 0, name: msg('Atölye masası'), desc: msg('Mühendisler atölyede, tezgâhın başında çizer.'), year: 1900, cost: 0, span: 12, research: 0 },
  { level: 1, name: msg('Çizim ofisi'), desc: msg('Ressamlar ve bir baş mühendis: çizimler bekletmez.'), year: 1900, cost: 2_500, span: 18, research: 0.05 },
  { level: 2, name: msg('Mühendislik binası'), desc: msg('Motor, şasi ve gövde ayrı bürolarda, kendi şefleriyle.'), year: 1908, cost: 40_000, span: 30, research: 0.1 },
  {
    level: 3,
    name: msg('Deneme pisti'),
    desc: msg('Arabalar kapalı bir pistte gece gündüz denenir; ekipler sonuçları beklemeden çalışır.'),
    year: 1920,
    cost: 700_000,
    span: 50,
    research: 0.15,
  },
  { level: 4, name: msg('Araştırma laboratuvarı'), desc: msg('Metalurji, yakıt ve titreşim üzerine çalışan bilim insanları.'), year: 1925, cost: 6_000_000, span: 80, research: 0.25 },
  {
    level: 5,
    name: msg('Teknik merkez'),
    desc: msg('Bütün mühendislik tek bir kampüste: stüdyolar, laboratuvarlar, rüzgâr tüneli.'),
    year: 1948,
    cost: 35_000_000,
    span: 130,
    research: 0.4,
  },
];

/** A year's running cost of the engineering buildings, as a share of what they cost. */
export const ENGINEERING_UPKEEP = 0.05;

export type SupplierPlantId = 'body' | 'tyres' | 'glass' | 'steel';

/**
 * Making what the suppliers sold: the company's own body plant, tyre plant, glass works and steel
 * mill. A plant is built for so many cars a year and takes a share off the material of the cars it
 * supplies; as the company grows it has to grow too. It is built no smaller than MIN_PLANT cars a
 * year, so it pays only at a large volume.
 */
export interface SupplierPlant {
  id: SupplierPlantId;
  name: string;
  desc: string;
  year: number;
  /** Cost of a car a year of capacity, in 1900 dollars (a plant pays back in about three and a half years at 200,000 cars a year in 1928). */
  costPerCar: number;
  /** Share of the material cost saved on the cars it supplies. */
  cut: number;
}

export const SUPPLIER_PLANTS: SupplierPlant[] = [
  { id: 'body', name: msg('Gövde fabrikası'), desc: msg('Kaportayı ve döşemeyi kendin yaparsın: gövdecinin kârı sende kalır.'), year: 1910, costPerCar: 55, cut: 0.03 },
  { id: 'tyres', name: msg('Lastik fabrikası'), desc: msg('Kendi kauçuğun ve kendi lastik hattın.'), year: 1915, costPerCar: 28, cut: 0.015 },
  { id: 'glass', name: msg('Cam fabrikası'), desc: msg('Ön cam ve pencereler kendi fırınlarından.'), year: 1920, costPerCar: 19, cut: 0.01 },
  { id: 'steel', name: msg('Çelik fabrikası'), desc: msg('Kendi yüksek fırının ve haddehanen: sac ve dövme çelik ucuzlar.'), year: 1920, costPerCar: 80, cut: 0.04 },
];

/** The smallest plant worth building, in cars a year. */
export const MIN_PLANT = 20_000;
