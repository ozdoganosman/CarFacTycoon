// Shared types for the CarFacTycoon simulation core.
// Everything stored in GameState must stay JSON-serializable (save games).

export type SegmentId = 'city' | 'family' | 'sport' | 'pickup' | 'luxury' | 'suv';
export type MarketId = 'usa' | 'europe';

/** Car attributes buyers care about. Each is scored 0-100 relative to the era's average car. */
export type AttrKey =
  | 'accel'
  | 'topSpeed'
  | 'economy'
  | 'comfort'
  | 'handling'
  | 'safety'
  | 'reliability'
  | 'prestige'
  | 'practicality';

export type FocusKey = 'performance' | 'efficiency' | 'comfort' | 'safety' | 'cost' | 'quality';
export type ComponentKey = 'engine' | 'gearbox' | 'electrics';
export type SupplierChoice = 'inhouse' | 'cheap' | 'quality';
export type TestId = 'dyno' | 'road' | 'crash' | 'durability';
export type StageId = 'press' | 'body' | 'paint' | 'assembly';
export type DefectArea = 'engine' | 'gearbox' | 'chassis' | 'electrics' | 'brakes' | 'body';
export type Severity = 'minor' | 'major' | 'critical';

export type ChassisId = 'ladder' | 'monocoque';
export type BodyId = 'phaeton' | 'roadster' | 'coupe' | 'sedan' | 'pickup' | 'station' | 'suv';
export type ValvetrainId = 'sv' | 'ioe' | 'ohv' | 'ohc' | 'dohc';
export type FuelSystemId = 'carb' | 'carb2' | 'injection';
export type AspirationId = 'na' | 'supercharger';
export type GearboxTypeId = 'sliding' | 'synchro' | 'automatic';
export type SuspensionTypeId = 'leaf' | 'ifs' | 'allind';
export type FeatureId =
  | 'steelBody'
  | 'fourWheelBrakes'
  | 'hydraulicBrakes'
  | 'safetyGlass'
  | 'discBrakes'
  | 'paddedDash'
  | 'seatBelt'
  | 'electricStart'
  | 'electricLights'
  | 'heater'
  | 'radio'
  | 'powerSteering'
  | 'airCon';

export interface EngineDesign {
  cylinders: number;
  layout: 'inline' | 'v';
  bore: number; // mm
  stroke: number; // mm
  compression: number; // ratio, e.g. 4.5
  valvetrain: ValvetrainId;
  fuelSystem: FuelSystemId;
  aspiration: AspirationId;
  /** Compression ignition (from 1936). Absent means petrol. */
  fuel?: 'petrol' | 'diesel';
}

export interface GearboxDesign {
  type: GearboxTypeId;
  gears: number;
  /** 0 = short (acceleration) .. 1 = long (economy, cruising). */
  spread: number;
}

export interface CarDesign {
  chassis: ChassisId;
  body: BodyId;
  /** 0 = small .. 1 = large. */
  size: number;
  /** Styling / coachwork investment 0..1. */
  styling: number;
  engine: EngineDesign;
  gearbox: GearboxDesign;
  suspension: SuspensionTypeId;
  /** 0 = soft/comfort .. 1 = firm/handling. */
  suspBalance: number;
  features: FeatureId[];
  /** Interior quality 0..1. */
  interior: number;
}

/** Bonuses earned during development, applied on top of the raw design. */
export interface DevBonus {
  powerMult: number;
  massMult: number;
  fuelMult: number;
  comfort: number;
  safety: number;
  costMult: number;
  reliability: number;
  /** Quality work: fewer latent defects when development ends (older saves lack it). */
  defectMult?: number;
  /** Chassis tuning from road tests. */
  handling?: number;
}

export interface EngineStats {
  displacementCc: number;
  powerHp: number;
  powerKw: number;
  peakPowerRpm: number;
  torqueNm: number;
  peakTorqueRpm: number;
  redline: number;
  bmepKpa: number;
  pistonSpeed: number; // mean piston speed at redline, m/s
  massKg: number;
  cost: number;
  smoothness: number; // comfort contribution
  knockLimit: number; // max safe compression for this bore / fuel
  knocking: boolean;
  /** British RAC ("treasury") horsepower used by the European tax rule. */
  taxHp: number;
  peakEfficiency: number;
  diesel?: boolean; // brake thermal efficiency at best point
  reliabilityPenalty: number;
}

export interface CarStats {
  engine: EngineStats;
  massKg: number;
  cd: number;
  frontalArea: number;
  gearRatios: number[]; // overall ratios (incl. final drive), 1st..top
  accel50: number; // seconds 0-50 km/h
  accel100: number | null; // seconds 0-100 km/h (null if unreachable)
  topSpeed: number; // km/h
  fuel: number; // L/100km
  comfort: number;
  handling: number;
  safety: number;
  reliability: number; // design reliability before defects
  prestige: number;
  practicality: number;
  unitCost: number; // materials & components, at cost index 1
  componentCost: Record<ComponentKey, number>;
  complexity: number; // production complexity multiplier (1 = typical)
  devWork: number; // engineer-weeks at productivity 1
}

export type Scores = Record<AttrKey, number>;

export interface Defect {
  id: string;
  area: DefectArea;
  severity: Severity;
  found: boolean;
  /** Set when the defect became public in the field (recall/service campaign). */
  surfaced?: boolean;
  fixed?: boolean;
  /** The player chose to stay silent about a surfaced defect. */
  ignored?: boolean;
}

export type ProjectPhase = 'design' | 'development' | 'testing' | 'production' | 'ready';

/**
 * Engineers' estimate of how the car will score, before buyers see it.
 * width = half-width of the range in score points; offsets bias the centre so the
 * range does not simply give away the true value. Tests narrow the widths.
 */
export interface Estimate {
  offsets: Record<AttrKey, number>;
  width: Record<AttrKey, number>;
  /** How green the engineering team is (1 = seasoned; about 2 for a first car). */
  experience?: number;
}

export interface LaunchReport {
  weeks: number;
  sold: number;
  built: number;
  demand: number;
  capacity: number;
  market: MarketId;
  rank: number;
  offers: number;
  share: number;
  praise: AttrKey[];
  complaints: AttrKey[];
  price: 'high' | 'low' | 'fair';
  advice: string[];
}

export interface Project {
  id: string;
  name: string;
  segment: SegmentId;
  targetPrice: number;
  kind: 'new' | 'facelift';
  replacesModelId?: string;
  platformId?: string;
  engineRefId?: string;
  design: CarDesign;
  phase: ProjectPhase;
  createdWeek: number;
  engineers: number;
  dev: {
    required: number;
    done: number;
    focus: Record<FocusKey, number>;
    points: Record<FocusKey, number>;
  };
  bonus?: DevBonus;
  defects: Defect[];
  /** Expected number of defects at the start of testing (drives the risk estimate). */
  defectPrior: number;
  tests: Record<TestId, { planned: number; done: number }>;
  testWeeks: number;
  suppliers: Record<ComponentKey, SupplierChoice>;
  estimate?: Estimate;
  lineId?: string;
  /** Chosen during production prep; carried to the model at launch. */
  autoCapacity?: boolean;
  /** The bonus as development left it; testing adds its tuning on top. */
  devBonus?: DevBonus;
  productionReadyWeek?: number;
  toolingCost?: number;
  notes?: string[];
}

export interface Review {
  magazine: string;
  score: number; // 1..10
  quote: string;
}

export interface WeekRecord {
  week: number;
  built: number;
  sold: number;
  revenue: number;
  cost: number;
}

export interface CarModel {
  id: string;
  name: string;
  segment: SegmentId;
  design: CarDesign;
  bonus: DevBonus;
  stats: CarStats;
  platformId: string;
  engineId: string;
  generation: number;
  faceliftCount: number;
  launchWeek: number;
  refreshWeek: number;
  /** Base price in launch-week money; indexed for inflation when `indexPrice` is set. */
  price: number;
  priceWeek: number;
  indexPrice: boolean;
  markets: MarketId[];
  /** Share of its lines' throughput to use, 0..1. Lines point at models via ProductionLine.modelId. */
  productionRate: number;
  /** Let the factory follow demand: add capacity while buyers wait, give it back when they don't. */
  autoCapacity?: boolean;
  lowDemandMonths?: number;
  inventory: number;
  suppliers: Record<ComponentKey, SupplierChoice>;
  defects: Defect[];
  testWeeks: number;
  unitsBuilt: number;
  unitsSold: number;
  soldByMarket: Record<MarketId, number>;
  revenueTotal: number;
  profitTotal: number;
  history: WeekRecord[];
  reviews: Review[];
  reviewScore: number;
  hype: number;
  /** What buyers believe about reliability; drifts toward the real value as cars age in the field. */
  perceivedReliability: number;
  fieldFailures: number;
  warrantyCost: number;
  status: 'active' | 'retired';
  retiredWeek?: number;
  /** Cached scores & appeal, refreshed monthly. */
  cache?: {
    week: number;
    scores: Scores;
    appeal: Record<MarketId, number>;
  };
  lastDemand?: Record<MarketId, number>;
  /** Week when the first-month launch report is due. */
  launchReportWeek?: number;
}

export interface Platform {
  id: string;
  name: string;
  chassis: ChassisId;
  size: number;
  suspension: SuspensionTypeId;
  createdWeek: number;
}

export interface EngineLibraryEntry {
  id: string;
  name: string;
  design: EngineDesign;
  createdWeek: number;
}

export interface ProductionLine {
  id: string;
  name: string;
  slots: number;
  stations: Record<StageId, string[]>;
  modelId?: string;
  retoolUntilWeek?: number;
  /** When a line is working on military orders during the war. */
  military?: boolean;
  /** Sections that also work a night shift. */
  nightShift?: Partial<Record<StageId, boolean>>;
}

export interface MarketState {
  unlocked: boolean;
  dealerLevel: number;
  awareness: number;
  adBudget: number; // $ per week (in current money)
}

export interface RivalCompany {
  id: string;
  name: string;
  home: MarketId;
  founded: number;
  closes?: number;
  skill: number;
  size: number; // 0..1 reach / distribution strength
  style: 'mass' | 'premium' | 'sport' | 'utility';
  segments: SegmentId[];
  color: string;
  unitsSold: number;
  yearSold: Record<number, number>;
}

export interface RivalModel {
  id: string;
  companyId: string;
  name: string;
  segment: SegmentId;
  launchWeek: number;
  design: CarDesign;
  stats: CarStats;
  price: number;
  priceIndexAtLaunch: number;
  markets: MarketId[];
  active: boolean;
  unitsSold: number;
  cache?: { week: number; scores: Scores; appeal: Record<MarketId, number> };
}

export type ModalItem =
  | { kind: 'event'; eventId: string }
  | { kind: 'card'; cardId: string }
  | { kind: 'recall'; modelId: string; defectId: string }
  | { kind: 'service'; modelId: string; defectId: string }
  | { kind: 'reviews'; modelId: string }
  | { kind: 'launch'; modelId: string; venue: string; facelift?: boolean }
  | { kind: 'launchReport'; modelId: string; report: LaunchReport }
  | { kind: 'phase'; projectId: string; phase: ProjectPhase }
  | { kind: 'yearReport'; year: number }
  | { kind: 'unlock'; title: string; body: string }
  | { kind: 'gameOver' };

export interface LogEntry {
  week: number;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'bad';
}

export interface FinanceWeek {
  week: number;
  revenue: number;
  materials: number;
  labor: number;
  salaries: number;
  dealers: number;
  marketing: number;
  rnd: number;
  warranty: number;
  interest: number;
  other: number;
  investment: number;
}

export interface YearSummary {
  year: number;
  revenue: number;
  profit: number;
  unitsSold: number;
  shareByMarket: Record<MarketId, number>;
  cashEnd: number;
  costs: Record<Exclude<keyof FinanceWeek, 'week' | 'revenue'>, number>;
}

export interface Company {
  name: string;
  hq: MarketId;
  cash: number;
  loan: number;
  reputation: number; // 0..100
  engineers: number;
  skill: number; // engineering skill 0..100
  shops: Record<ComponentKey, boolean>;
  modelsLaunched: number;
  negativeWeeks: number;
  highWages: boolean;
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  week: number;
  endWeek: number;
  company: Company;
  projects: Project[];
  models: CarModel[];
  platforms: Platform[];
  engines: EngineLibraryEntry[];
  lines: ProductionLine[];
  markets: Record<MarketId, MarketState>;
  rivals: RivalCompany[];
  rivalModels: RivalModel[];
  /** Knowledge of segment preferences: 0 unknown, 1 hinted, 2 known. */
  knowledge: Record<SegmentId, Partial<Record<AttrKey, number>>>;
  firedEvents: string[];
  flags: Record<string, number>;
  modals: ModalItem[];
  log: LogEntry[];
  finance: FinanceWeek[];
  years: YearSummary[];
  /** Units sold per (market, segment) last year and this year for share reports. */
  segmentSales: Record<string, number>;
  unlockedTech: string[];
  cardsSeen: string[];
  settings: { engineerMode: boolean; autoPauseCards: boolean };
  gameOver?: { reason: 'bankrupt' | 'end'; week: number };
  nextId: number;
  /** The player's key decisions, newest last (read when a playtest is studied). */
  decisions?: { week: number; key: string; text: string }[];
  /** Errors caught while the game ran, for bug reports. */
  errors?: { week: number; at: string; message: string; stack?: string }[];
}
