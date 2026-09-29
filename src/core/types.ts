import type { CityId } from '../data/cities';
import type { DifficultyId } from '../data/difficulty';
import type { StateId } from '../data/states';
// Shared types for the CarFacTycoon simulation core.
// Everything stored in GameState must stay JSON-serializable (save games).
import type { ToolingTier } from '../data/tooling';

export type { ToolingTier };

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

export type FocusKey = 'performance' | 'efficiency' | 'comfort' | 'handling' | 'safety' | 'practicality' | 'cost' | 'quality';
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
  | 'airCon'
  | 'windshield'
  | 'speedometer'
  | 'spareWheel'
  | 'rearMirror'
  | 'wipers'
  | 'fuelGauge'
  | 'turnSignals'
  | 'sealedBeam';

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
  /** Engineering know-how built in (magneto, dampers…); older designs have none. */
  knowhow?: string[];
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
  /** Chassis tuning: development focus and road tests. */
  handling?: number;
  /** Packaging, luggage room, ease of servicing (development focus). */
  practicality?: number;
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
  /** What the unit cost is made of (sums to unitCost), for the designer's cost breakdown. */
  costParts: Record<CostPart, number>;
  /** Multipliers already in the parts: development focus (cost) and workshop know-how. */
  costMults: { focus: number; knowhow: number };
  complexity: number; // production complexity multiplier (1 = typical)
  devWork: number; // engineer-weeks at productivity 1
}

export type CostPart = 'engine' | 'gearbox' | 'chassis' | 'body' | 'suspension' | 'running' | 'interior' | 'styling' | 'electrics' | 'features';

export type Scores = Record<AttrKey, number>;

export interface Defect {
  id: string;
  area: DefectArea;
  severity: Severity;
  found: boolean;
  /** Only shows after long use in customers' hands: tests rarely catch it. */
  stubborn?: boolean;
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
  /** What the project has been waiting on the player for, and since when (for the standing-still warning). */
  waitKind?: 'design' | 'tested' | 'tooling' | 'launch';
  waitSince?: number;
  engineers: number;
  dev: {
    required: number;
    done: number;
    focus: Record<FocusKey, number>;
    points: Record<FocusKey, number>;
    /** Focus areas the player has pinned: moving another slider leaves them alone. */
    locked?: FocusKey[];
  };
  bonus?: DevBonus;
  defects: Defect[];
  /** Expected number of defects at the start of testing (drives the risk estimate). */
  defectPrior: number;
  /** The prototype's unit cost in 1900 dollars (sets what a test week costs). */
  protoUnitCost?: number;
  /** Body dies and fixtures ordered for production. */
  tooling?: ToolingTier;
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
  /** Highest price (in 1900 dollars) the press has accepted; a big jump above it soon after launch is punished. */
  priceCeiling?: number;
  /** Let the factory follow demand: add capacity while buyers wait, give it back when they don't. */
  /** Body dies and fixtures it is built with (older saves: standard). */
  tooling?: ToolingTier;
  /** Sales milestones and firsts the papers have already covered. */
  newsFlags?: string[];
  autoCapacity?: boolean;
  /** Net spent by automatic capacity on this model so far. */
  autoSpent?: number;
  /** Why automatic capacity is not growing although buyers wait (last month). */
  autoHold?: 'war' | 'margin' | 'cash' | 'payback' | 'full' | 'successor';
  /** What would make growth pay (set with autoHold 'payback'). */
  autoHint?: string;
  /** Buyers' demand smoothed over the last months (for building). */
  demandTrend?: number;
  /** The model's share of its class over the last months (all markets it is sold in). */
  shareTrend?: number;
  lowDemandMonths?: number;
  inventory: number;
  suppliers: Record<ComponentKey, SupplierChoice>;
  defects: Defect[];
  testWeeks: number;
  unitsBuilt: number;
  /** Production know-how carried over from the generation it replaced (counts like cars built for costs). */
  experience?: number;
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
  /** A new line is being built and equipped until this week. */
  buildUntilWeek?: number;
  /** When automatic capacity last rebuilt it (at most once a year). */
  rebuiltWeek?: number;
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

/** The company in one state: its dealers and service, and its cars on the road there. */
export interface StateNet {
  /** Franchised dealers (in the home state the factory's own showroom sells too). */
  dealers: number;
  /** Company service shops. */
  service: number;
  /** How well known the make is here, 0-1. */
  awareness: number;
  /** Our cars on the road here, and their average age in years. */
  parc: number;
  parcAge: number;
  /** Our cars scrapped here, all time. */
  scrapped: number;
  /** Sold here: all time, this year, last year. */
  sold: number;
  soldYear: number;
  soldLastYear: number;
  /** Freight paid on cars sent here this year. */
  freightYear?: number;
  /** When the first dealer opened (week). */
  openedWeek?: number;
  /** A dealer search under way: it ends that week, with this chance of finding one. */
  search?: { until: number; chance: number };
  /** Searches that found nobody (each makes the next one easier). */
  tries?: number;
  /** The first dealer's name, for the map. */
  firstDealer?: string;
}

export interface NetworkState {
  states: Partial<Record<StateId, StateNet>>;
  /** The year the "this year" counters belong to. */
  year: number;
  /** Open a service shop by itself where cars wait too long for repairs. */
  autoService?: boolean;
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
  | { kind: 'news'; newsId: string }
  | { kind: 'unlock'; title: string; body: string }
  | { kind: 'insolvency'; stage: 'first' | 'last' }
  /** The company stands still: a design left on the desk, or no new car coming while the range ages. Stops the clock. */
  | { kind: 'stall'; reason: 'design' | 'idle' | 'polish' | 'tested' | 'tooling' | 'launch'; projectId?: string }
  /** Research finished (and what started next from the queue): a corner note that does not stop the clock. */
  | { kind: 'research'; done: string[]; started: string[] }
  | { kind: 'gameOver' };

export interface LogEntry {
  week: number;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'bad';
  /** What the news is about (older saves: the company). */
  cat?: LogCategory;
}

export type LogCategory = 'company' | 'buyers' | 'rival' | 'tech';

export interface FinanceWeek {
  week: number;
  revenue: number;
  /** Of `investment`: what "meet demand automatically" spent, less machines it sold. */
  auto?: number;
  materials: number;
  labor: number;
  salaries: number;
  dealers: number;
  /** Railway freight on cars sent out of the home state (missing in old saves). */
  freight?: number;
  marketing: number;
  rnd: number;
  warranty: number;
  interest: number;
  other: number;
  investment: number;
  /** Corporate income tax paid (on the previous year's profit). Missing in old saves. */
  tax: number;
}

export interface YearSummary {
  year: number;
  revenue: number;
  profit: number;
  unitsSold: number;
  shareByMarket: Record<MarketId, number>;
  cashEnd: number;
  costs: Record<Exclude<keyof FinanceWeek, 'week' | 'revenue' | 'auto'>, number>;
}

export interface Company {
  name: string;
  hq: MarketId;
  /** The town the factory stands in (older saves: Detroit). */
  city?: CityId;
  cash: number;
  loan: number;
  reputation: number; // 0..100
  engineers: number;
  /** Research staff: learn new technology faster (they do not develop cars). */
  researchers?: number;
  skill: number; // engineering skill 0..100
  shops: Record<ComponentKey, boolean>;
  modelsLaunched: number;
  negativeWeeks: number;
  /** Salary paid to engineers with nothing to do (no project, test or research), for the post-mortem. */
  idleSalary?: number;
  /** Past losses not yet set against taxable profit. */
  lossCarry?: number;
  /** Last year's corporate tax still to pay, in quarterly instalments. */
  taxOwed?: number;
  taxInstalments?: number;
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
  /** Newspaper front pages published so far (older saves lack it). */
  news?: NewsIssue[];
  /** Technologies the company has learned, and what its engineers are researching now (older saves lack it). */
  /** queue: subjects waiting for a free slot, in order; they start by themselves when there is room and money. */
  research?: { known: string[]; active: { id: string; weeksLeft: number; weeks: number; /** Research speed when it started (staff hired later speed it up). */ speed?: number }[]; queue?: string[] };
  cardsSeen: string[];
  /** The racing team: budget level 0-3 and the fame its results earned. */
  racing?: { level: number; fame: number; wins?: number; winYears?: number[]; paused?: boolean; dry?: number; last?: { year: number; race: string; result: 'win' | 'podium' | 'none'; model: string } };
  /** Rival companies the player has bought. */
  acquired?: string[];
  /** Dealers, service and cars on the road, state by state (older saves get one on load). */
  network?: NetworkState;
  /** modeChosen: the player picked the engine designer mode themselves (older saves defaulted to the simple one). */
  settings: { engineerMode: boolean; autoPauseCards: boolean; modeChosen?: boolean; difficulty?: DifficultyId };
  gameOver?: { reason: 'bankrupt' | 'end'; week: number };
  nextId: number;
  /** Number for the next line's name, so names are never reused. */
  nextLineNo?: number;
  /** The player's key decisions, newest last (read when a playtest is studied). */
  decisions?: { week: number; key: string; text: string }[];
  /** Errors caught while the game ran, for bug reports. */
  errors?: { week: number; at: string; message: string; stack?: string }[];
}

// ---------------- Newspapers ----------------

export interface NewsStoryData {
  headline: string;
  deck?: string;
  body: string;
}

export type NewsArt = { kind: 'car'; modelId: string } | { kind: 'tech'; area: string };

export interface NewsLetter {
  name: string;
  place: string;
  role: string;
  stars: number;
  text: string;
  tone: 'good' | 'bad' | 'mixed';
}

export interface NewsIssue {
  id: string;
  week: number;
  kind: 'tech' | 'boom';
  lead: NewsStoryData & { art: NewsArt; caption?: string; paragraphs?: string[] };
  side: NewsStoryData[];
  world?: NewsStoryData;
  stats?: { label: string; value: string }[];
  ad?: { modelId: string; slogan: string; lines: string[]; price: number };
  letters?: NewsLetter[];
}
