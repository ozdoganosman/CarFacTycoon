import type {
  AspirationId,
  BodyId,
  ChassisId,
  FeatureId,
  FuelSystemId,
  GearboxTypeId,
  SuspensionTypeId,
  ValvetrainId,
} from '../core/types';

// Design modules and the year each one becomes available. Money values are in
// 1900 dollars (multiplied by the era cost index at runtime).

export interface ChassisDef {
  id: ChassisId;
  name: string;
  year: number;
  desc: string;
  massFactor: number; // multiplies chassis+body mass
  handling: number;
  safety: number;
  cost: number;
  tooling: number; // tooling cost multiplier
  complexity: number; // production complexity add
  cardId?: string;
}

export const CHASSIS: ChassisDef[] = [
  {
    id: 'ladder',
    name: 'Merdiven şasi',
    year: 1900,
    desc: 'İki çelik kiriş ve traversler. Basit, tamiri kolay, gövdeyi üstüne vidalarsın. Ağır ve esnek.',
    massFactor: 1,
    handling: 0,
    safety: 0,
    cost: 60,
    tooling: 1,
    complexity: 0,
  },
  {
    id: 'monocoque',
    name: 'Monokok gövde',
    year: 1934,
    desc: 'Gövde kabuğu yükü kendisi taşır. Daha hafif ve rijit, ama pres kalıpları pahalı.',
    massFactor: 0.84,
    handling: 8,
    safety: 6,
    cost: 55,
    tooling: 1.6,
    complexity: 0.1,
    cardId: 'monocoque',
  },
];

export interface BodyDef {
  id: BodyId;
  name: string;
  year: number;
  desc: string;
  mass: number; // kg at size 0.5
  cd: number; // drag coefficient before era streamlining
  area: number; // frontal area adjustment m²
  comfort: number;
  practicality: number;
  prestige: number;
  safety: number;
  cog: number; // handling bonus from low centre of gravity
  closed: boolean;
  cost: number;
  complexity: number;
}

export const BODIES: BodyDef[] = [
  { id: 'phaeton', name: 'Faeton (açık)', year: 1900, desc: 'Brandalı açık gövde. Hafif ve ucuz; yağmurda herkes ıslanır.', mass: 150, cd: 0.86, area: 0, comfort: 0, practicality: 10, prestige: 0, safety: 0, cog: 0, closed: false, cost: 80, complexity: 0 },
  { id: 'roadster', name: 'Roadster', year: 1900, desc: 'İki kişilik, alçak, açık gövde. Hafif ve gösterişli, pratik değil.', mass: 120, cd: 0.74, area: -0.25, comfort: -3, practicality: -10, prestige: 7, safety: 0, cog: 6, closed: false, cost: 78, complexity: 0 },
  { id: 'coupe', name: 'Coupé', year: 1905, desc: 'Kapalı, iki kapılı, zarif gövde.', mass: 210, cd: 0.64, area: -0.1, comfort: 10, practicality: 0, prestige: 9, safety: 8, cog: 5, closed: true, cost: 125, complexity: 0.1 },
  { id: 'sedan', name: 'Sedan', year: 1910, desc: 'Dört kapılı kapalı gövde. Konforlu ve güvenli ama ağır ve pahalı.', mass: 250, cd: 0.7, area: 0.1, comfort: 15, practicality: 14, prestige: 4, safety: 8, cog: 0, closed: true, cost: 130, complexity: 0.15 },
  { id: 'pickup', name: 'Pikap', year: 1913, desc: 'Kabinli, arkası açık kasa. Yük taşır; zarif değildir.', mass: 220, cd: 0.8, area: 0.15, comfort: 2, practicality: 28, prestige: -10, safety: 4, cog: -3, closed: true, cost: 95, complexity: 0 },
  { id: 'station', name: 'Station (woodie)', year: 1923, desc: 'Uzun tavanlı, geniş bagajlı gövde. Ahşap panelli.', mass: 280, cd: 0.72, area: 0.15, comfort: 12, practicality: 26, prestige: 0, safety: 8, cog: -1, closed: true, cost: 145, complexity: 0.2 },
  { id: 'suv', name: 'Arazi (4x4)', year: 1946, desc: 'Savaşın cipinden doğan yüksek, sağlam gövde. Her yola gider.', mass: 330, cd: 0.78, area: 0.4, comfort: 8, practicality: 24, prestige: 4, safety: 10, cog: -8, closed: true, cost: 150, complexity: 0.2 },
];

export interface ValvetrainDef {
  id: ValvetrainId;
  name: string;
  year: number;
  desc: string;
  pistonSpeed: number; // max mean piston speed base (m/s)
  rpmCap: number;
  ve: number; // volumetric efficiency at torque peak
  x0: number; // torque peak as a fraction of redline
  costMult: number;
  effMult: number;
  reliability: number; // reliability penalty (more parts / stress)
  immaturity: number; // extra penalty right after introduction
}

export const VALVETRAINS: ValvetrainDef[] = [
  { id: 'sv', name: 'Yan supap (SV)', year: 1900, desc: 'Supaplar silindirin yanında. Basit ve sessiz; nefesi dar, düşük devirli.', pistonSpeed: 6.5, rpmCap: 4200, ve: 0.72, x0: 0.45, costMult: 1, effMult: 0.86, reliability: 0, immaturity: 0 },
  { id: 'ioe', name: 'F-kafa (IOE)', year: 1903, desc: 'Emme üstte, egzoz yanda. Orta yol.', pistonSpeed: 7.2, rpmCap: 4500, ve: 0.76, x0: 0.5, costMult: 1.06, effMult: 0.9, reliability: 1, immaturity: 4 },
  { id: 'ohv', name: 'Üstten supap (OHV)', year: 1904, desc: 'İtici çubuklu, supaplar silindirin üstünde. Daha iyi nefes, daha yüksek sıkıştırma.', pistonSpeed: 8, rpmCap: 5500, ve: 0.82, x0: 0.55, costMult: 1.12, effMult: 1, reliability: 2, immaturity: 6 },
  { id: 'ohc', name: 'Üstten kam (OHC)', year: 1910, desc: 'Kam mili silindir kapağında. Yüksek devir, pahalı zincir/şaft tahriki.', pistonSpeed: 9.2, rpmCap: 6500, ve: 0.86, x0: 0.6, costMult: 1.32, effMult: 1.02, reliability: 4, immaturity: 10 },
  { id: 'dohc', name: 'Çift üstten kam (DOHC)', year: 1912, desc: 'Yarış motorlarından: iki kam mili, en iyi nefes. Pahalı ve hassas.', pistonSpeed: 10.5, rpmCap: 7500, ve: 0.9, x0: 0.65, costMult: 1.65, effMult: 1.04, reliability: 7, immaturity: 14 },
];

export interface FuelSystemDef {
  id: FuelSystemId;
  name: string;
  year: number;
  desc: string;
  ve: number;
  eff: number;
  cost: number;
  reliability: number;
  immaturity: number;
}

export const FUEL_SYSTEMS: FuelSystemDef[] = [
  { id: 'carb', name: 'Tek karbüratör', year: 1900, desc: 'Basit ve ucuz.', ve: 1, eff: 1, cost: 0, reliability: 0, immaturity: 0 },
  { id: 'carb2', name: 'Çift karbüratör', year: 1925, desc: 'Her silindire daha eşit karışım, biraz daha güç.', ve: 1.05, eff: 0.98, cost: 30, reliability: 1, immaturity: 4 },
  { id: 'injection', name: 'Mekanik enjeksiyon', year: 1954, desc: 'Yakıtı doğrudan püskürtür. Güçlü ve verimli, çok pahalı.', ve: 1.1, eff: 1.08, cost: 220, reliability: 4, immaturity: 10 },
];

export interface AspirationDef {
  id: AspirationId;
  name: string;
  year: number;
  desc: string;
  boost: number;
  eff: number;
  cost: number;
  reliability: number;
  immaturity: number;
  cardId?: string;
}

export const ASPIRATIONS: AspirationDef[] = [
  { id: 'na', name: 'Atmosferik', year: 1900, desc: 'Motor havayı kendisi emer.', boost: 1, eff: 1, cost: 0, reliability: 0, immaturity: 0 },
  { id: 'supercharger', name: 'Kompresör (Roots)', year: 1921, desc: 'Krank milinden dönen üfleyici silindire fazla hava basar. +%35 güç, daha çok yakıt ve ısı.', boost: 1.35, eff: 0.88, cost: 160, reliability: 6, immaturity: 10, cardId: 'supercharger' },
];

export interface GearboxTypeDef {
  id: GearboxTypeId;
  name: string;
  year: number;
  desc: string;
  shiftTime: number;
  efficiency: number;
  comfort: number;
  practicality: number;
  prestige: number;
  cost: number;
  mass: number;
  reliability: number;
  immaturity: number;
  cardId?: string;
}

export const GEARBOX_TYPES: GearboxTypeDef[] = [
  { id: 'sliding', name: 'Kayar dişli', year: 1900, desc: 'Senkromeçsiz. Vites değiştirmek ustalık ister (çift debriyaj).', shiftTime: 1.1, efficiency: 0.88, comfort: 0, practicality: 0, prestige: 0, cost: 0, mass: 0, reliability: 0, immaturity: 0 },
  { id: 'synchro', name: 'Senkromeçli', year: 1928, desc: 'Dişliler kavramadan önce hızlarını eşitler. Kolay ve sessiz vites.', shiftTime: 0.55, efficiency: 0.88, comfort: 3, practicality: 4, prestige: 1, cost: 30, mass: 3, reliability: 1, immaturity: 6, cardId: 'synchromesh' },
  { id: 'automatic', name: 'Otomatik (hidrolik)', year: 1940, desc: 'Hidrolik kavrama ve planet dişliler. Vites kendiliğinden değişir; biraz güç kaybı.', shiftTime: 0.35, efficiency: 0.82, comfort: 7, practicality: 7, prestige: 4, cost: 170, mass: 40, reliability: 4, immaturity: 12 },
];

/** Maximum forward gears available by year. */
export function maxGears(year: number): number {
  if (year >= 1955) return 5;
  if (year >= 1925) return 4;
  return 3;
}

export interface SuspensionDef {
  id: SuspensionTypeId;
  name: string;
  year: number;
  desc: string;
  comfort: number;
  handling: number;
  cost: number;
  mass: number;
  reliability: number;
  immaturity: number;
  cardId?: string;
}

export const SUSPENSIONS: SuspensionDef[] = [
  { id: 'leaf', name: 'Yaprak yay + sabit aks', year: 1900, desc: 'At arabasından kalma. Sağlam ve ucuz; bir tekerlek sekince hepsi seker.', comfort: 0, handling: 0, cost: 30, mass: 40, reliability: 0, immaturity: 0 },
  { id: 'ifs', name: 'Bağımsız ön süspansiyon', year: 1934, desc: 'Ön tekerlekler birbirinden bağımsız çalışır. Daha konforlu ve isabetli direksiyon.', comfort: 8, handling: 7, cost: 55, mass: 48, reliability: 2, immaturity: 6, cardId: 'independentSuspension' },
  { id: 'allind', name: 'Tam bağımsız (helezon)', year: 1955, desc: 'Dört tekerlek bağımsız, helezon yaylı.', comfort: 12, handling: 12, cost: 85, mass: 52, reliability: 3, immaturity: 8 },
];

export interface FeatureDef {
  id: FeatureId;
  name: string;
  year: number;
  group: 'safety' | 'equipment';
  desc: string;
  comfort?: number;
  handling?: number;
  safety?: number;
  prestige?: number;
  practicality?: number;
  reliability?: number;
  cost: number;
  electric?: boolean;
  mass: number;
  complexity: number;
  cardId?: string;
  /** Feature ids that must also be selected. */
  requires?: FeatureId[];
}

export const FEATURES: FeatureDef[] = [
  { id: 'steelBody', name: 'Tamamen çelik gövde', year: 1914, group: 'safety', desc: 'Ahşap iskelet yerine çelik. Kazada çok daha sağlam.', safety: 8, cost: 25, mass: 25, complexity: 0.05 },
  { id: 'fourWheelBrakes', name: 'Dört teker fren', year: 1918, group: 'safety', desc: 'Sadece arka tekerlekler değil, dördü birden durdurur.', safety: 6, handling: 2, cost: 22, mass: 12, complexity: 0.03 },
  { id: 'hydraulicBrakes', name: 'Hidrolik fren', year: 1921, group: 'safety', desc: 'Pascal ilkesi: pedal kuvveti yağ ile dört tekere eşit dağılır.', safety: 6, handling: 3, cost: 30, mass: 6, complexity: 0.03, reliability: -1, cardId: 'hydraulicBrake', requires: ['fourWheelBrakes'] },
  { id: 'safetyGlass', name: 'Lamine emniyet camı', year: 1927, group: 'safety', desc: 'Kırılınca dağılmaz; yolcuyu kesiklerden korur.', safety: 6, cost: 15, mass: 3, complexity: 0.01 },
  { id: 'discBrakes', name: 'Disk fren (ön)', year: 1953, group: 'safety', desc: 'Isınınca bayılmayan, güçlü frenler.', safety: 6, handling: 3, prestige: 1, cost: 45, mass: 4, complexity: 0.03, requires: ['hydraulicBrakes'] },
  { id: 'paddedDash', name: 'Yastıklı gösterge paneli', year: 1956, group: 'safety', desc: 'Çarpışmada kafa sert metale değil yumuşak panele çarpar.', safety: 3, comfort: 1, cost: 12, mass: 4, complexity: 0.01 },
  { id: 'seatBelt', name: 'Üç noktalı emniyet kemeri', year: 1959, group: 'safety', desc: 'Yolcuyu koltukta tutar. Hayat kurtarır.', safety: 10, cost: 10, mass: 3, complexity: 0.01 },
  { id: 'electricStart', name: 'Elektrikli marş', year: 1912, group: 'equipment', desc: 'Kolla motor çevirmeye son. Herkes araba kullanabilir.', comfort: 5, practicality: 12, prestige: 2, reliability: -1, cost: 35, electric: true, mass: 20, complexity: 0.04, cardId: 'electricStarter' },
  { id: 'electricLights', name: 'Elektrikli farlar', year: 1912, group: 'equipment', desc: 'Asetilen lambaların yerine elektrikli farlar.', safety: 3, practicality: 4, cost: 18, electric: true, mass: 6, complexity: 0.02 },
  { id: 'heater', name: 'Kalorifer', year: 1926, group: 'equipment', desc: 'Motor ısısıyla kabini ısıtır.', comfort: 5, practicality: 2, cost: 15, mass: 5, complexity: 0.02 },
  { id: 'radio', name: 'Radyo', year: 1930, group: 'equipment', desc: 'Lambalı araç radyosu. Pahalı bir oyuncak.', comfort: 4, prestige: 4, cost: 40, electric: true, mass: 8, complexity: 0.03, reliability: -1 },
  { id: 'powerSteering', name: 'Hidrolik direksiyon', year: 1951, group: 'equipment', desc: 'Park ederken bile direksiyon tüy gibi.', comfort: 4, handling: 1, practicality: 3, prestige: 2, cost: 55, mass: 12, complexity: 0.04, reliability: -1 },
  { id: 'airCon', name: 'Klima', year: 1953, group: 'equipment', desc: 'Sıcak yaz günlerinde serin kabin.', comfort: 8, prestige: 5, cost: 120, electric: true, mass: 45, complexity: 0.08, reliability: -2 },
  { id: 'windshield', name: 'Ön cam', year: 1904, group: 'equipment', desc: 'Sürücüyü rüzgârdan, tozdan ve böceklerden korur. Gözlüksüz araba kullanmak mümkün olur.', comfort: 4, safety: 1, cost: 10, mass: 8, complexity: 0.01 },
  { id: 'speedometer', name: 'Hız göstergesi', year: 1906, group: 'equipment', desc: 'Tekerlekten tel ile dönen ibre: sürücü hızını bilir, hız cezasından kaçar.', practicality: 2, prestige: 1, safety: 1, cost: 8, mass: 2, complexity: 0.01 },
  { id: 'spareWheel', name: 'Yedek tekerlek', year: 1908, group: 'equipment', desc: 'Arkada ya da yanda taşınan yedek jant ve lastik. Patlak lastik yolculuğu bitirmez.', practicality: 5, cost: 12, mass: 18, complexity: 0.01 },
  { id: 'rearMirror', name: 'Dikiz aynası', year: 1914, group: 'safety', desc: 'Sürücü arkasını dönmeden görür. Kalabalık şehir trafiğinde kaza azalır.', safety: 2, cost: 3, mass: 1, complexity: 0.005 },
  { id: 'wipers', name: 'Otomatik silecek', year: 1917, group: 'safety', desc: 'Motor vakumuyla çalışan silecek: yağmurda sürücü eliyle camı silmek zorunda kalmaz.', safety: 2, comfort: 1, cost: 6, mass: 2, complexity: 0.01, requires: ['windshield'] },
  { id: 'fuelGauge', name: 'Yakıt göstergesi', year: 1922, group: 'equipment', desc: 'Depoya çubuk sokmaya son: gösterge panelinde benzinin ne kadar kaldığı görünür.', practicality: 2, cost: 5, electric: true, mass: 1, complexity: 0.01 },
  { id: 'turnSignals', name: 'Sinyal lambaları', year: 1939, group: 'safety', desc: 'Sürücü dönmeden önce kolunu camdan çıkarmaz; yanıp sönen lambalar arkadakini uyarır.', safety: 3, practicality: 1, cost: 8, electric: true, mass: 2, complexity: 0.01, requires: ['electricLights'] },
  { id: 'sealedBeam', name: 'Mühürlü farlar', year: 1940, group: 'safety', desc: 'Ampul, yansıtıcı ve cam tek parça: farlar kararmaz, gece yol iki kat aydınlanır.', safety: 3, cost: 10, electric: true, mass: 2, complexity: 0.01, requires: ['electricLights'] },
];

export interface CylinderOption {
  cylinders: number;
  layout: 'inline' | 'v';
  year: number;
  label: string;
  desc: string;
}

export const CYLINDER_OPTIONS: CylinderOption[] = [
  { cylinders: 1, layout: 'inline', year: 1900, label: 'Tek silindir', desc: 'En ucuz ve hafif. İki turda bir ateşler: çok sarsıntılı, büyüdükçe devri tıkanır.' },
  { cylinders: 2, layout: 'inline', year: 1900, label: '2 silindir sıra', desc: 'Ucuz ve basit. Tek silindirden yumuşak ama hâlâ titrek; küçük motorlar için.' },
  { cylinders: 3, layout: 'inline', year: 1904, label: '3 silindir sıra', desc: 'Küçük motorlar için orta yol: 2 silindirden yumuşak, 4 silindirden ucuz ve hafif. Biraz sallanır.' },
  { cylinders: 4, layout: 'inline', year: 1900, label: '4 silindir sıra', desc: 'Dönemin standardı: dengeli ve makul fiyatlı. Büyük hacimlerde titreşimi artar.' },
  { cylinders: 6, layout: 'inline', year: 1903, label: '6 silindir sıra', desc: 'Kendini dengeler: ipek gibi ve sessiz. Uzun, ağır ve pahalı.' },
  { cylinders: 6, layout: 'v', year: 1950, label: 'V6', desc: 'Altı silindir kısa bir blokta: kaputa sığar, sıra altıdan hafif; onun kadar yumuşak değil.' },
  { cylinders: 8, layout: 'v', year: 1914, label: 'V8', desc: 'Kısa, güçlü ve yumuşak; büyük hacim için ideal. Pahalı ve çok yakar.' },
  { cylinders: 8, layout: 'inline', year: 1919, label: '8 silindir sıra', desc: 'Çok yumuşak ve prestijli. Çok uzun, ağır ve pahalı.' },
  { cylinders: 12, layout: 'v', year: 1915, label: 'V12', desc: 'Lüksün simgesi, en pürüzsüz motorlardan. Çok pahalı ve ağır, bakımı zor.' },
  { cylinders: 16, layout: 'v', year: 1930, label: 'V16', desc: 'Gösteriş için: devasa ve pürüzsüz. Maliyet ve güvenilirlik ciddi sorun.' },
];

/** Max compression usable with the fuel of the era (octane rating). */
export function maxCompression(year: number): number {
  const pts: [number, number][] = [
    [1900, 4.2],
    [1915, 4.6],
    [1923, 5.4], // tetraethyl lead
    [1930, 6.0],
    [1940, 6.8],
    [1950, 7.5],
    [1955, 8.6],
    [1960, 9.5],
  ];
  return interp(pts, year);
}

export function interp(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

/** Penalty for using a technology soon after it appeared (fades over ~6 years). */
export function immaturityPenalty(base: number, unlockYear: number, year: number): number {
  if (base <= 0) return 0;
  return base * Math.exp(-Math.max(0, year - unlockYear) / 6);
}

export const byId = <T extends { id: string }>(list: T[], id: string): T => {
  const found = list.find((x) => x.id === id);
  if (!found) throw new Error(`Unknown id: ${id}`);
  return found;
};
