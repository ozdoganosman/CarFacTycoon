import { costIndex, newLineCost, shopCost, slotCost, toolingMultiple, MAX_SLOTS } from '../data/economy';
import { eventDef } from '../data/events';
import { MARKETS, marketScale, MAX_DEALER_LEVEL } from '../data/markets';
import { segmentDef } from '../data/segments';
import { STAGES, stationDef } from '../data/stations';
import { CHASSIS, byId } from '../data/tech';
import { aiDesign } from './ai';
import { FOCUS_KEYS, bonusFromPoints, evenFocus, normalizeFocus } from './development';
import { displacementCc } from './engine';
import { writeReviews } from './feedback';
import { emptyLine, lineReport, modernizeQuote, planBalancedLine, stationPrice, stationResale, turnkeyLineCost } from './factory';
import {
  shareEngineers,
  availableSegments,
  credit,
  dealerUpgradeCost,
  engineersBusy,
  gates,
  materialUnitCost,
} from './game';
import { modelScores, priceNow, referencePrice } from './market';
import { stateRng } from './rng';
import { experienceFactor, newEstimate } from './estimate';
import { TESTS, SUPPLIERS, expectedDefects, generateDefects } from './testing';
import { yearFloat } from './time';
import type {
  CarDesign,
  CarModel,
  ComponentKey,
  DevBonus,
  FocusKey,
  GameState,
  MarketId,
  Project,
  SegmentId,
  StageId,
  SupplierChoice,
  TestId,
} from './types';
import { NO_BONUS, computeCarStats } from './vehicle';
import { clamp, decide, earn, log, money, newId, shiftModal, spend } from './util';

export type ActionResult = { ok: true } | { ok: false; error: string };
const ok: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

function project(s: GameState, id: string): Project {
  const p = s.projects.find((x) => x.id === id);
  if (!p) throw new Error(`No project ${id}`);
  return p;
}

function model(s: GameState, id: string): CarModel {
  const m = s.models.find((x) => x.id === id);
  if (!m) throw new Error(`No model ${id}`);
  return m;
}

// ---------------- Staff ----------------

export function hireEngineers(s: GameState, n: number): ActionResult {
  const yf = yearFloat(s.week);
  const cost = n * 40 * costIndex(yf);
  if (s.company.cash < cost) return fail('Yeterli para yok.');
  spend(s, cost, 'other');
  s.company.engineers += n;
  // New hires dilute experience a little.
  s.company.skill = clamp(s.company.skill - n * 0.3, 10, 100);
  decide(s, 'staff', `${n} mühendis işe alındı (toplam ${s.company.engineers})`);
  return ok;
}

export function fireEngineers(s: GameState, n: number): ActionResult {
  if (s.company.engineers - n < 1) return fail('En az bir mühendis kalmalı.');
  s.company.engineers -= n;
  s.company.reputation = clamp(s.company.reputation - 0.2 * n, 0, 100);
  decide(s, 'staff', `${n} mühendis çıkarıldı (toplam ${s.company.engineers})`);
  return ok;
}

// ---------------- Projects ----------------

export interface StartProjectOptions {
  name: string;
  segment: SegmentId;
  targetPrice: number;
  platformId?: string;
  engineRefId?: string;
  replacesModelId?: string;
}

/** One line describing a design, for the decision log. */
export function designSummary(d: CarDesign): string {
  const e = d.engine;
  return `${d.chassis}/${d.body}, boy ${d.size.toFixed(2)}, stil ${d.styling.toFixed(2)}, ${e.cylinders} sil. ${e.layout} ${e.bore}×${e.stroke} mm ${e.valvetrain} r${e.compression}, ${d.gearbox.type} ${d.gearbox.gears} vites, ${d.suspension}, iç ${d.interior.toFixed(2)}, donanım [${d.features.join(', ')}]`;
}

/**
 * Where a new project starts. Never the class's typical car (that would hand
 * the player the answer): the company's latest car, or a plain workshop car
 * that is the same whatever the class.
 */
export function defaultDesign(s: GameState, segment: SegmentId): CarDesign {
  void segment;
  const yf = yearFloat(s.week);
  const latest = [...s.models].sort((a, b) => b.launchWeek - a.launchWeek)[0];
  if (latest) return structuredClone(latest.design);
  const { design } = aiDesign('family', Math.floor(yf), { style: 'mass', skill: 40, market: s.company.hq }, () => 0.5);
  return { ...design, size: 0.4, styling: 0.3, interior: 0.3, suspBalance: 0.5 };
}

export function startProject(s: GameState, o: StartProjectOptions): { ok: true; id: string } | { ok: false; error: string } {
  if (!availableSegments(s).includes(o.segment)) return { ok: false, error: 'Bu segment henüz açılmadı.' };
  const design = defaultDesign(s, o.segment);
  const plat = o.platformId ? s.platforms.find((p) => p.id === o.platformId) : undefined;
  if (plat) {
    design.chassis = plat.chassis;
    design.size = plat.size;
    design.suspension = plat.suspension;
  }
  const eng = o.engineRefId ? s.engines.find((e) => e.id === o.engineRefId) : undefined;
  if (eng) design.engine = { ...eng.design };
  const id = newId(s, 'p');
  const free = s.company.engineers - engineersBusy(s);
  const p: Project = {
    id,
    name: o.name.trim() || `Proje ${id.slice(1)}`,
    segment: o.segment,
    targetPrice: o.targetPrice,
    kind: 'new',
    replacesModelId: o.replacesModelId,
    platformId: plat?.id,
    engineRefId: eng?.id,
    design,
    phase: 'design',
    createdWeek: s.week,
    engineers: Math.max(1, free),
    dev: { required: 0, done: 0, focus: evenFocus(), points: { performance: 0, efficiency: 0, comfort: 0, safety: 0, cost: 0, quality: 0 } },
    defects: [],
    defectPrior: 0,
    tests: { dyno: { planned: 4, done: 0 }, road: { planned: 8, done: 0 }, crash: { planned: 0, done: 0 }, durability: { planned: 8, done: 0 } },
    testWeeks: 0,
    suppliers: { engine: 'quality', gearbox: 'quality', electrics: 'quality' },
    estimate: newEstimate(stateRng(s), experienceFactor(s)),
    autoCapacity: true,
  };
  decide(s, 'project:' + id, `Yeni proje: ${p.name} (${o.segment}, hedef fiyat ${money(o.targetPrice)}${plat ? ', ortak platform' : ''}${eng ? ', ortak motor' : ''})`);
  s.projects.push(p);
  return { ok: true, id };
}

/** Facelift: short project on an existing model (styling, trim, equipment, tuning). */
export function startFacelift(s: GameState, modelId: string): { ok: true; id: string } | { ok: false; error: string } {
  const m = model(s, modelId);
  if (s.projects.some((p) => p.replacesModelId === modelId && p.kind === 'facelift')) return { ok: false, error: 'Bu model için zaten bir makyaj projesi var.' };
  const id = newId(s, 'p');
  const free = s.company.engineers - engineersBusy(s);
  s.projects.push({
    id,
    name: `${m.name} (makyaj)`,
    segment: m.segment,
    targetPrice: m.price,
    kind: 'facelift',
    replacesModelId: m.id,
    platformId: m.platformId,
    engineRefId: m.engineId,
    design: structuredClone(m.design),
    phase: 'design',
    createdWeek: s.week,
    engineers: Math.max(1, free),
    dev: { required: 0, done: 0, focus: evenFocus(), points: { performance: 0, efficiency: 0, comfort: 0, safety: 0, cost: 0, quality: 0 } },
    defects: [],
    defectPrior: 0,
    tests: { dyno: { planned: 0, done: 0 }, road: { planned: 3, done: 0 }, crash: { planned: 0, done: 0 }, durability: { planned: 0, done: 0 } },
    testWeeks: 0,
    suppliers: { ...m.suppliers },
    // Engineers already know the car well: a facelift starts with tighter estimates.
    estimate: (() => {
      const e = newEstimate(stateRng(s), experienceFactor(s));
      for (const k of Object.keys(e.width) as (keyof typeof e.width)[]) e.width[k] *= 0.6;
      return e;
    })(),
    lineId: s.lines.find((l) => l.modelId === m.id)?.id,
  });
  decide(s, 'project:' + id, `Makyaj projesi: ${m.name}`);
  return { ok: true, id };
}

export function updateDesign(s: GameState, pid: string, design: CarDesign): ActionResult {
  const p = project(s, pid);
  if (p.phase !== 'design') return fail('Tasarım geliştirme başladıktan sonra değiştirilemez.');
  p.design = design;
  return ok;
}

export function renameProject(s: GameState, pid: string, name: string) {
  project(s, pid).name = name;
}

/** Engineering work needed, after platform / engine reuse discounts. */
export function requiredWork(s: GameState, p: Project): number {
  const stats = computeCarStats(p.design, yearFloat(s.week));
  let w = stats.devWork;
  if (p.kind === 'facelift') return w * 0.35;
  const plat = p.platformId && s.platforms.find((x) => x.id === p.platformId);
  if (plat && plat.chassis === p.design.chassis && plat.size === p.design.size && plat.suspension === p.design.suspension) w *= 0.7;
  const eng = p.engineRefId && s.engines.find((x) => x.id === p.engineRefId);
  if (eng && JSON.stringify(eng.design) === JSON.stringify(p.design.engine)) w *= 0.75;
  return w;
}

/** Bonus the car ends up with if development runs to 100% with the current focus. */
export function projectedBonus(s: GameState, p: Project): DevBonus {
  if (p.bonus) return p.bonus;
  const required = p.phase === 'design' ? requiredWork(s, p) : p.dev.required;
  const remaining = Math.max(0, required - p.dev.done);
  const points = { ...p.dev.points };
  for (const k of Object.keys(points) as FocusKey[]) points[k] += p.dev.focus[k] * remaining;
  return bonusFromPoints(points, required, Math.max(p.dev.done, required), s.company.skill);
}

export function setFocus(s: GameState, pid: string, focus: Record<FocusKey, number>) {
  project(s, pid).dev.focus = normalizeFocus(focus);
  const p = project(s, pid);
  decide(s, 'focus:' + pid, `${p.name}: odak ${FOCUS_KEYS.map((k) => `${k} %${Math.round(p.dev.focus[k] * 100)}`).join(', ')}`);
}

/** Shared engineers can be a fraction of a person per project. */
const fmtEngineers = (n: number) => String(Math.round(n * 10) / 10);

export function beginDevelopment(s: GameState, pid: string): ActionResult {
  const p = project(s, pid);
  if (p.phase !== 'design') return fail('Proje zaten geliştirmede.');
  p.dev.required = requiredWork(s, p);
  p.phase = 'development';
  shareEngineers(s);
  log(s, `${p.name}: geliştirme başladı (${fmtEngineers(p.engineers)} mühendis).`);
  decide(s, 'dev:' + pid, `${p.name}: geliştirme başladı, ${fmtEngineers(p.engineers)} mühendis · ${designSummary(p.design)}`);
  return ok;
}

export function finishDevelopment(s: GameState, pid: string): ActionResult {
  const p = project(s, pid);
  if (p.phase !== 'development') return fail('Proje geliştirmede değil.');
  if (p.dev.done < p.dev.required) return fail('Geliştirme henüz tamamlanmadı.');
  const yf = yearFloat(s.week);
  p.bonus = bonusFromPoints(p.dev.points, p.dev.required, p.dev.done, s.company.skill);
  p.devBonus = p.bonus;
  const stats = computeCarStats(p.design, yf, p.bonus);
  let lambda = expectedDefects(stats, s.company.skill, s.company.modelsLaunched) * (p.bonus.defectMult ?? 1);
  if (p.kind === 'facelift') lambda *= 0.3;
  else {
    if (p.engineRefId) lambda *= 0.8;
    if (p.platformId) lambda *= 0.85;
  }
  p.defectPrior = lambda;
  p.defects = generateDefects(lambda, stateRng(s), p.id);
  const protoCost = (p.kind === 'facelift' ? 1 : 3) * materialUnitCost(s, { stats, suppliers: p.suppliers, unitsBuilt: 0 });
  spend(s, protoCost, 'rnd');
  p.phase = 'testing';
  // Tests unavailable in this era cannot be planned.
  for (const t of TESTS) if (t.year > yf) p.tests[t.id].planned = 0;
  log(s, `${p.name}: prototipler hazır (${money(protoCost)}). Test programı başladı.`);
  decide(s, 'dev:' + pid, `${p.name}: teste geçildi (geliştirme %${Math.round((100 * p.dev.done) / p.dev.required)}, beklenen gizli kusur ${lambda.toFixed(1)})`);
  return ok;
}

export function setTestPlan(s: GameState, pid: string, test: TestId, weeks: number): ActionResult {
  const p = project(s, pid);
  const def = TESTS.find((t) => t.id === test)!;
  if (def.year > yearFloat(s.week)) return fail(`${def.name} henüz yapılamıyor.`);
  p.tests[test].planned = Math.max(p.tests[test].done, Math.round(weeks));
  decide(s, 'tests:' + pid, `${p.name}: test planı ${TESTS.map((t) => `${t.id} ${p.tests[t.id].planned}hf`).join(', ')}`);
  return ok;
}

export function finishTesting(s: GameState, pid: string): ActionResult {
  const p = project(s, pid);
  if (p.phase !== 'testing') return fail('Proje testte değil.');
  for (const t of TESTS) p.tests[t.id].planned = p.tests[t.id].done;
  p.phase = 'production';
  if (!gates(s).suppliers) p.suppliers = { engine: 'quality', gearbox: 'quality', electrics: 'quality' };
  if (p.kind === 'facelift' && p.lineId) {
    // Facelifts reuse the existing tooling; only a short changeover.
    const q = toolingQuote(s, p, p.lineId);
    spend(s, q.cost, 'investment');
    p.toolingCost = q.cost;
    p.productionReadyWeek = s.week + q.weeks;
  }
  decide(s, 'tests:' + pid, `${p.name}: test bitti (${TESTS.map((t) => `${t.id} ${p.tests[t.id].done}hf`).join(', ')}; bulunamayan kusur ${p.defects.filter((d) => !d.found).length})`);
  return ok;
}

export function setSupplier(s: GameState, pid: string, comp: ComponentKey, choice: SupplierChoice): ActionResult {
  const p = project(s, pid);
  if (!gates(s).suppliers) return fail('Yap ya da satın al kararı ikinci modelinle açılır.');
  if (choice === 'inhouse' && !s.company.shops[comp]) return fail('Önce bu parça için atölye kurmalısın.');
  p.suppliers[comp] = choice;
  decide(s, `supplier:${pid}:${comp}`, `${p.name}: ${comp} tedarikçisi ${choice}`);
  return ok;
}

export interface ToolingQuote {
  cost: number;
  weeks: number;
  leadWeeks: number;
  sharedPlatform: boolean;
}

export function toolingQuote(s: GameState, p: Project, lineId: string): ToolingQuote {
  const yf = yearFloat(s.week);
  const stats = computeCarStats(p.design, yf, p.bonus ?? NO_BONUS);
  const line = s.lines.find((l) => l.id === lineId);
  const onLine = line && s.models.find((m) => m.id === line.modelId && m.status === 'active');
  const chassis = byId(CHASSIS, p.design.chassis);
  let factor = 1;
  let shared = false;
  if (p.kind === 'facelift') factor = 0.3;
  else if (p.platformId && onLine && onLine.platformId === p.platformId) {
    factor = 0.4;
    shared = true;
  } else if (p.platformId) factor = 0.7;
  const cost = toolingMultiple(yf) * stats.unitCost * costIndex(yf) * chassis.tooling * factor;
  const weeks = p.kind === 'facelift' ? 3 : Math.round((5 + 4 * stats.complexity) * (factor < 1 ? 0.6 : 1));
  const leadWeeks = Math.max(...(Object.keys(p.suppliers) as ComponentKey[]).map((k) => SUPPLIERS.find((x) => x.id === p.suppliers[k])!.leadWeeks));
  return { cost, weeks, leadWeeks, sharedPlatform: shared };
}

export function startTooling(s: GameState, pid: string, lineId: string): ActionResult {
  const p = project(s, pid);
  if (p.phase !== 'production') return fail('Proje üretim hazırlığında değil.');
  if (p.productionReadyWeek !== undefined) return fail('Kalıp hazırlığı zaten başladı.');
  const q = toolingQuote(s, p, lineId);
  if (s.company.cash < q.cost) return fail(`Kalıplar için ${money(q.cost)} gerekiyor.`);
  spend(s, q.cost, 'investment');
  p.lineId = lineId;
  p.toolingCost = q.cost;
  p.productionReadyWeek = s.week + Math.max(q.weeks, q.leadWeeks);
  log(s, `${p.name}: kalıplar sipariş edildi (${money(q.cost)}); ${Math.max(q.weeks, q.leadWeeks)} hafta sonra üretime hazır.`);
  decide(s, 'tooling:' + pid, `${p.name}: kalıplar ${money(q.cost)}, ${Math.max(q.weeks, q.leadWeeks)} hafta`);
  return ok;
}

export function cancelProject(s: GameState, pid: string): ActionResult {
  const gone = s.projects.find((p) => p.id === pid);
  if (gone) decide(s, 'project:' + pid, `Proje iptal: ${gone.name} (${gone.phase})`);
  s.projects = s.projects.filter((p) => p.id !== pid);
  s.modals = s.modals.filter((m) => !(m.kind === 'phase' && m.projectId === pid));
  return ok;
}

export interface LaunchOptions {
  price: number;
  markets: MarketId[];
  autoShow: boolean;
}

export function autoShowCost(s: GameState, markets: MarketId[]): number {
  const yf = yearFloat(s.week);
  return markets.reduce((a, m) => a + 1500 * costIndex(yf) * Math.sqrt(marketScale(m, yf)), 0);
}

export function launchModel(s: GameState, pid: string, o: LaunchOptions): { ok: true; modelId: string } | { ok: false; error: string } {
  const p = project(s, pid);
  if (p.phase !== 'ready') return { ok: false, error: 'Üretim hattı henüz hazır değil.' };
  const markets = o.markets.filter((m) => s.markets[m].unlocked);
  if (!markets.length) return { ok: false, error: 'En az bir pazar seç.' };
  if (o.price <= 0) return { ok: false, error: 'Geçerli bir fiyat gir.' };
  const yf = yearFloat(s.week);
  const bonus = p.bonus ?? NO_BONUS;
  const stats = computeCarStats(p.design, yf, bonus);
  const venue = o.autoShow
    ? `${Math.floor(yf)} ${MARKETS.find((x) => x.id === (markets.includes(s.company.hq) ? s.company.hq : markets[0]))!.name} Otomobil Fuarı`
    : 'Fabrika avlusunda basın günü';
  if (o.autoShow) {
    const cost = autoShowCost(s, markets);
    spend(s, cost, 'marketing');
    for (const m of markets) s.markets[m].awareness = clamp(s.markets[m].awareness + 0.05, 0, 1);
  }
  const rng = stateRng(s);

  if (p.kind === 'facelift' && p.replacesModelId) {
    const m = model(s, p.replacesModelId);
    m.design = p.design;
    m.bonus = bonus;
    m.stats = stats;
    m.price = o.price;
    m.priceWeek = s.week;
    m.markets = markets;
    m.suppliers = p.suppliers;
    m.defects.push(...p.defects);
    m.faceliftCount += 1;
    m.refreshWeek = s.week;
    m.cache = undefined;
    m.perceivedReliability = Math.max(m.perceivedReliability, (m.perceivedReliability + stats.reliability) / 2);
    const reviews = writeReviews(s, m, rng);
    m.reviews = reviews;
    m.reviewScore = reviews.reduce((a, r) => a + r.score, 0) / reviews.length;
    m.hype += 3 + Math.max(0, m.reviewScore - 5) * 0.8 + (o.autoShow ? 2 : 0);
    m.priceCeiling = o.price / costIndex(yf);
    s.projects = s.projects.filter((x) => x.id !== p.id);
    s.company.skill = clamp(s.company.skill + (100 - s.company.skill) * 0.02, 0, 100);
    m.launchReportWeek = s.week + 4;
    s.modals.push({ kind: 'launch', modelId: m.id, venue, facelift: true });
    log(s, `${m.name} makyajlı haliyle satışta.`, 'good');
    decide(s, 'launch:' + m.id, `${m.name} lansmanı${p.kind === 'facelift' ? ' (makyaj)' : ''}: fiyat ${money(o.price)} (sınıf ${money(referencePrice(s.company.hq, m.segment, yf))}), ${markets.join('+')}, fuar ${o.autoShow ? 'var' : 'yok'}, dergi ${m.reviewScore.toFixed(1)}`);
    return { ok: true, modelId: m.id };
  }

  // Platform & engine library entries.
  const plat = p.platformId ? s.platforms.find((x) => x.id === p.platformId) : undefined;
  let platformId: string;
  if (plat && plat.chassis === p.design.chassis && plat.size === p.design.size && plat.suspension === p.design.suspension) {
    platformId = plat.id;
  } else {
    platformId = newId(s, 'pl');
    s.platforms.push({
      id: platformId,
      name: `${p.name} platformu`,
      chassis: p.design.chassis,
      size: p.design.size,
      suspension: p.design.suspension,
      createdWeek: s.week,
    });
  }
  const eng = p.engineRefId ? s.engines.find((x) => x.id === p.engineRefId) : undefined;
  let engineId: string;
  if (eng && JSON.stringify(eng.design) === JSON.stringify(p.design.engine)) {
    engineId = eng.id;
  } else {
    engineId = newId(s, 'e');
    const cc = displacementCc(p.design.engine);
    s.engines.push({
      id: engineId,
      name: `${(cc / 1000).toFixed(1)} L ${p.design.engine.layout === 'v' ? 'V' : ''}${p.design.engine.cylinders} (${p.name})`,
      design: { ...p.design.engine },
      createdWeek: s.week,
    });
  }

  const id = newId(s, 'm');
  const m: CarModel = {
    id,
    name: p.name,
    segment: p.segment,
    design: p.design,
    bonus,
    stats,
    platformId,
    engineId,
    generation: 1,
    faceliftCount: 0,
    launchWeek: s.week,
    refreshWeek: s.week,
    price: o.price,
    priceWeek: s.week,
    indexPrice: true,
    markets,
    productionRate: 1,
    autoCapacity: p.autoCapacity ?? true,
    inventory: 0,
    suppliers: p.suppliers,
    defects: p.defects,
    testWeeks: p.testWeeks,
    unitsBuilt: 0,
    unitsSold: 0,
    soldByMarket: { usa: 0, europe: 0 },
    revenueTotal: 0,
    profitTotal: 0,
    history: [],
    reviews: [],
    reviewScore: 5,
    hype: 0,
    perceivedReliability: stats.reliability,
    fieldFailures: 0,
    warrantyCost: 0,
    status: 'active',
  };
  if (p.replacesModelId) {
    const old = s.models.find((x) => x.id === p.replacesModelId);
    if (old) {
      m.generation = old.generation + 1;
      // The old model's other lines switch over to the new generation after a short changeover.
      for (const l of s.lines) {
        if (l.modelId === old.id && l.id !== p.lineId) {
          l.modelId = id;
          l.retoolUntilWeek = s.week + 2;
        }
      }
      retire(s, old, 'Yeni kuşağa yer açtı');
    }
  }
  // Take over the production line.
  if (p.lineId) {
    const line = s.lines.find((l) => l.id === p.lineId);
    if (line) {
      const other = s.models.find((x) => x.id === line.modelId && x.status === 'active');
      if (other && other.id !== p.replacesModelId) log(s, `${other.name}, ${line.name} hattını yeni ${m.name} modeline bıraktı.`, 'warn');
      line.modelId = id;
      line.military = false;
      // Launch stock: two weeks of output.
      const tp = lineReport(s, line, stats.complexity).throughput * 2;
      spend(s, tp * materialUnitCost(s, m), 'materials');
      m.inventory = tp;
      m.unitsBuilt = tp;
    }
  }
  s.models.push(m);
  s.projects = s.projects.filter((x) => x.id !== p.id);
  const reviews = writeReviews(s, m, rng);
  m.reviews = reviews;
  m.reviewScore = reviews.reduce((a, r) => a + r.score, 0) / reviews.length;
  m.hype = Math.max(0, 3 + (m.reviewScore - 5) * 1.2 + (o.autoShow ? 3 : 0));
  m.priceCeiling = o.price / costIndex(yf);
  s.company.modelsLaunched += 1;
  s.company.skill = clamp(s.company.skill + (100 - s.company.skill) * 0.06, 0, 100);
  s.company.reputation = clamp(s.company.reputation + (m.reviewScore - 5.5) * 1.5, 0, 100);
  m.launchReportWeek = s.week + 4;
  s.modals.push({ kind: 'launch', modelId: m.id, venue });
  log(s, `${m.name} piyasaya çıktı! Dergilerin ortalaması: ${m.reviewScore.toFixed(1)}/10.`, 'good');
  decide(s, 'launch:' + m.id, `${m.name} lansmanı${p.kind === 'facelift' ? ' (makyaj)' : ''}: fiyat ${money(o.price)} (sınıf ${money(referencePrice(s.company.hq, m.segment, yf))}), ${markets.join('+')}, fuar ${o.autoShow ? 'var' : 'yok'}, dergi ${m.reviewScore.toFixed(1)}`);

  // Progressive unlocks.
  if (s.company.modelsLaunched === 1) {
    for (const mk of MARKETS) s.markets[mk.id].unlocked = true;
    s.modals.push({
      kind: 'unlock',
      title: 'Yeni imkânlar açıldı',
      body:
        `İhracat: Artık ${MARKETS.filter((x) => x.id !== s.company.hq).map((x) => x.name).join(', ')} pazarında da satış yapabilirsin. Gümrük vergisi ve nakliye masrafı var; önce bayi ağı kur.\n\n` +
        'Yap ya da satın al: Bir sonraki projende motor, şanzıman ve elektrik parçalarını kimden alacağını sen seçeceksin.',
    });
  }
  if (s.company.modelsLaunched === 2) {
    s.modals.push({
      kind: 'unlock',
      title: 'Platform paylaşımı açıldı',
      body:
        'Yeni projelerde mevcut bir platformu (şasi + boyut + süspansiyon) ve motoru yeniden kullanabilirsin. Geliştirme işi, kalıp maliyeti ve hata riski düşer.\n\n' +
        'Ama abartma: aynı platformda üçten fazla model olursa dergiler “hepsi aynı araba” diye eleştirir ve prestij düşer.',
    });
  }
  return { ok: true, modelId: id };
}

function retire(s: GameState, m: CarModel, reason: string) {
  m.status = 'retired';
  m.retiredWeek = s.week;
  if (m.inventory > 0) {
    // Dealers clear leftover stock at a discount.
    const value = m.inventory * m.price * 0.6;
    earn(s, value);
    log(s, `${m.name} stoğu (${Math.round(m.inventory)} araç) indirimle satıldı: ${money(value)}.`);
    m.inventory = 0;
  }
  for (const l of s.lines) if (l.modelId === m.id) l.modelId = undefined;
  log(s, `${m.name} üretimden kalktı. ${reason}.`);
}

// ---------------- Models on sale ----------------

/** Price rise above the launch level (after inflation) that the press lets pass in a car's first years. */
export const HIKE_TOLERANCE = 0.08;

export function setModelPrice(s: GameState, id: string, price: number) {
  const m = model(s, id);
  const ci = costIndex(yearFloat(s.week));
  const before = priceNow(m, s.week);
  m.price = Math.max(1, price);
  m.priceWeek = s.week;
  decide(s, 'price:' + id, `${m.name}: fiyat ${money(m.price)} (sınıf ${money(referencePrice(s.company.hq, m.segment, yearFloat(s.week)))})`);
  // Launching cheap for good reviews and raising the price later is noticed.
  const ceiling = m.priceCeiling ?? before / ci;
  const real = m.price / ci;
  if ((s.week - m.launchWeek) / 52 < 3 && real > ceiling * (1 + HIKE_TOLERANCE)) {
    m.priceCeiling = real;
    const old = m.reviewScore;
    const reviews = writeReviews(s, m, stateRng(s));
    const fresh = reviews.reduce((a, r) => a + r.score, 0) / reviews.length;
    if (fresh < old) {
      m.reviews = reviews;
      m.reviewScore = fresh;
    }
    s.company.reputation = clamp(s.company.reputation - Math.max(0.5, (old - m.reviewScore) * 1.5), 0, 100);
    m.hype = 0;
    log(
      s,
      `Basın ${m.name} modeline gelen %${Math.round((real / ceiling - 1) * 100)} zammı eleştirdi: dergi ortalaması ${old.toFixed(1)} → ${m.reviewScore.toFixed(1)}. Lansman heyecanı söndü.`,
      'warn',
    );
  }
}

export function setModelMarkets(s: GameState, id: string, markets: MarketId[]) {
  model(s, id).markets = markets.filter((m) => s.markets[m].unlocked);
  decide(s, 'markets:' + id, `${model(s, id).name}: pazarlar ${model(s, id).markets.join('+')}`);
}

export function setProductionRate(s: GameState, id: string, rate: number) {
  model(s, id).productionRate = clamp(rate, 0, 1);
  decide(s, 'rate:' + id, `${model(s, id).name}: üretim hızı %${Math.round(model(s, id).productionRate * 100)}`);
}

export function retireModel(s: GameState, id: string) {
  retire(s, model(s, id), 'Satıştan çekildi');
  decide(s, 'retire:' + id, `${model(s, id).name} satıştan çekildi`);
}

/** Put a model on a line (or clear the line with modelId undefined). A line holds one model; a model may use many lines. */
export function assignLine(s: GameState, lineId: string, modelId: string | undefined): ActionResult {
  const line = s.lines.find((l) => l.id === lineId);
  if (!line) return fail('Hat bulunamadı.');
  if (line.modelId === modelId) return ok;
  if (!modelId) {
    line.modelId = undefined;
    return ok;
  }
  const m = model(s, modelId);
  const yf = yearFloat(s.week);
  const cost = retoolCost(s, m);
  if (s.company.cash < cost) return fail(`Hat değişimi için ${money(cost)} gerekiyor.`);
  spend(s, cost, 'investment');
  line.modelId = m.id;
  line.retoolUntilWeek = s.week + 3;
  line.military = false;
  void yf;
  decide(s, 'line:' + lineId, `${line.name} → ${m.name} (kalıp ${money(cost)})`);
  return ok;
}

export function retoolCost(s: GameState, m: CarModel): number {
  return 5 * m.stats.unitCost * costIndex(yearFloat(s.week)) * byId(CHASSIS, m.design.chassis).tooling;
}

// ---------------- Factory ----------------

export function buyLine(s: GameState): ActionResult {
  const cost = newLineCost(yearFloat(s.week));
  if (s.company.cash < cost) return fail(`Yeni hat için ${money(cost)} gerekiyor.`);
  spend(s, cost, 'investment');
  const n = s.lines.length + 1;
  s.lines.push(emptyLine(`L${s.nextId++}`, `Hat ${n}`));
  decide(s, 'buyLine', `Boş hat kuruldu (${money(cost)}), toplam ${s.lines.length} hat`);
  return ok;
}

export function expandLine(s: GameState, lineId: string): ActionResult {
  const line = s.lines.find((l) => l.id === lineId)!;
  if (line.slots >= MAX_SLOTS) return fail('Hat en büyük boyutta.');
  const cost = slotCost(yearFloat(s.week), line.slots);
  if (s.company.cash < cost) return fail(`Genişletme için ${money(cost)} gerekiyor.`);
  spend(s, cost, 'investment');
  line.slots += 1;
  decide(s, 'expand:' + lineId, `${line.name} genişletildi: ${line.slots} yer`);
  return ok;
}

export function buyStation(s: GameState, lineId: string, stage: StageId, stationId: string): ActionResult {
  const line = s.lines.find((l) => l.id === lineId)!;
  const def = stationDef(stationId);
  if (def.stage !== stage) return fail('Bu istasyon bu bölüme konamaz.');
  if (def.year > yearFloat(s.week)) return fail('Bu teknoloji henüz yok.');
  if (line.stations[stage].length >= line.slots) return fail('Bölümde boş yer yok. Hattı genişlet ya da bir istasyon sat.');
  const cost = stationPrice(stationId, s.week);
  if (s.company.cash < cost) return fail(`${def.name} için ${money(cost)} gerekiyor.`);
  spend(s, cost, 'investment');
  line.stations[stage].push(stationId);
  decide(s, `station:${lineId}:${stage}`, `${line.name} ${stage}: ${line.stations[stage].length} istasyon (son: ${def.name})`);
  return ok;
}

export function sellStation(s: GameState, lineId: string, stage: StageId, index: number): ActionResult {
  const line = s.lines.find((l) => l.id === lineId)!;
  const id = line.stations[stage][index];
  if (!id) return fail('İstasyon yok.');
  line.stations[stage].splice(index, 1);
  earn(s, stationResale(id, s.week));
  decide(s, `station:${lineId}:${stage}`, `${line.name} ${stage}: bir ${stationDef(id).name} satıldı`);
  return ok;
}

/** Build `count` new lines, fully equipped and balanced, and put `modelId` on them. */
export function buildTurnkeyLines(s: GameState, count: number, modelId: string | undefined, allowBlack: boolean): ActionResult {
  const m = modelId ? model(s, modelId) : undefined;
  const each = turnkeyLineCost(s.week, allowBlack) + (m ? retoolCost(s, m) : 0);
  const total = each * count;
  if (count < 1) return fail('En az bir hat seç.');
  if (s.company.cash < total) return fail(`${count} hat için ${money(total)} gerekiyor.`);
  const plan = planBalancedLine(yearFloat(s.week), allowBlack);
  for (let i = 0; i < count; i++) {
    spend(s, each, 'investment');
    const line = emptyLine(`L${s.nextId++}`, `Hat ${s.lines.length + 1}`);
    line.slots = MAX_SLOTS;
    for (const st of STAGES) line.stations[st.id] = [...plan[st.id]];
    if (m) {
      line.modelId = m.id;
      line.retoolUntilWeek = s.week + 3;
    }
    s.lines.push(line);
  }
  decide(s, 'turnkey', `${count} anahtar teslim hat${m ? ` (${m.name})` : ''}, ${money(total)}${allowBlack ? ', siyah boya' : ''}; toplam ${s.lines.length} hat`);
  return ok;
}

/** Rebuild a line with today's best stations, balanced; reusable stations stay, the rest are sold. */
export function modernizeLine(s: GameState, lineId: string, allowBlack: boolean): ActionResult {
  const line = s.lines.find((l) => l.id === lineId);
  if (!line) return fail('Hat bulunamadı.');
  const q = modernizeQuote(line, s.week, allowBlack);
  if (q.after <= q.before * 1.02) return fail('Bu hat zaten güncel.');
  if (s.company.cash < q.cost) return fail(`Yenileme için ${money(q.cost)} gerekiyor.`);
  spend(s, q.buy + q.expand, 'investment');
  earn(s, q.resale);
  line.slots = MAX_SLOTS;
  for (const st of STAGES) line.stations[st.id] = [...q.plan[st.id]];
  // Two weeks to install the new machines.
  if (line.modelId) line.retoolUntilWeek = Math.max(line.retoolUntilWeek ?? 0, s.week + 2);
  decide(s, 'modernize:' + lineId, `${line.name} yenilendi: ham kapasite ${q.before.toFixed(0)} → ${q.after.toFixed(0)} (${money(q.cost)})`);
  return ok;
}

export function setNightShift(s: GameState, lineId: string, stage: StageId, on: boolean): ActionResult {
  const line = s.lines.find((l) => l.id === lineId);
  if (!line) return fail('Hat bulunamadı.');
  line.nightShift = { ...line.nightShift, [stage]: on };
  decide(s, `night:${lineId}:${stage}`, `${line.name} ${stage}: gece vardiyası ${on ? 'açık' : 'kapalı'}`);
  return ok;
}

export function setProjectAutoCapacity(s: GameState, pid: string, on: boolean) {
  const p = project(s, pid);
  p.autoCapacity = on;
  decide(s, 'autocap:' + pid, `${p.name}: talebi otomatik karşıla ${on ? 'açık' : 'kapalı'}`);
}

export function setModelAutoCapacity(s: GameState, id: string, on: boolean) {
  const m = model(s, id);
  m.autoCapacity = on;
  m.lowDemandMonths = 0;
  decide(s, 'autocap:' + id, `${m.name}: talebi otomatik karşıla ${on ? 'açık' : 'kapalı'}`);
}

export function setLineMilitary(s: GameState, lineId: string, military: boolean): ActionResult {
  if (military && !((s.flags.militaryUntil ?? 0) > yearFloat(s.week))) return fail('Aktif bir askeri sözleşme yok.');
  s.lines.find((l) => l.id === lineId)!.military = military;
  return ok;
}

export function buildShop(s: GameState, comp: ComponentKey): ActionResult {
  if (s.company.shops[comp]) return fail('Atölye zaten var.');
  const cost = shopCost(yearFloat(s.week));
  if (s.company.cash < cost) return fail(`Atölye için ${money(cost)} gerekiyor.`);
  spend(s, cost, 'investment');
  s.company.shops[comp] = true;
  decide(s, 'shop:' + comp, `${comp} atölyesi kuruldu (${money(cost)})`);
  return ok;
}

// ---------------- Markets ----------------

export function upgradeDealers(s: GameState, market: MarketId): ActionResult {
  const ms = s.markets[market];
  if (!ms.unlocked) return fail('Bu pazar henüz açılmadı.');
  if (ms.dealerLevel >= MAX_DEALER_LEVEL) return fail('Bayi ağı en üst seviyede.');
  const cost = dealerUpgradeCost(s, market);
  if (s.company.cash < cost) return fail(`Bayi ağını büyütmek için ${money(cost)} gerekiyor.`);
  spend(s, cost, 'investment');
  ms.dealerLevel += 1;
  ms.awareness = clamp(ms.awareness + 0.03, 0, 1);
  decide(s, 'dealers:' + market, `${market} bayi seviyesi ${ms.dealerLevel} (${money(cost)})`);
  return ok;
}

export function setAdBudget(s: GameState, market: MarketId, amount: number) {
  s.markets[market].adBudget = Math.max(0, amount);
}

export function marketResearchCost(s: GameState): number {
  const yf = yearFloat(s.week);
  return 2000 * costIndex(yf) * Math.sqrt(marketScale(s.company.hq, yf));
}

export function marketResearch(s: GameState, segment: SegmentId): ActionResult {
  const cost = marketResearchCost(s);
  if (s.company.cash < cost) return fail(`Araştırma için ${money(cost)} gerekiyor.`);
  spend(s, cost, 'marketing');
  const k = s.knowledge[segment];
  for (const key of Object.keys(segmentDef(segment).weights) as (keyof typeof k)[]) k[key] = 2;
  log(s, `${segmentDef(segment).name} pazar araştırması tamamlandı.`, 'good');
  decide(s, 'research', `Pazar araştırması (${money(cost)})`);
  return ok;
}

// ---------------- Finance ----------------

export function takeLoan(s: GameState, amount: number): ActionResult {
  const c = credit(s);
  const room = c.limit - s.company.loan;
  if (amount > room) return fail(`Banka en fazla ${money(Math.max(0, room))} daha verir.`);
  s.company.loan += amount;
  s.company.cash += amount;
  decide(s, 'loan', `Kredi: ${money(amount)}, toplam borç ${money(s.company.loan)}`);
  return ok;
}

export function repayLoan(s: GameState, amount: number): ActionResult {
  const a = Math.min(amount, s.company.loan, Math.max(0, s.company.cash));
  s.company.loan -= a;
  s.company.cash -= a;
  decide(s, 'loan', `Kredi ödendi, kalan borç ${money(s.company.loan)}`);
  return ok;
}

// ---------------- Modals & decisions ----------------

export function dismissModal(s: GameState) {
  shiftModal(s);
}

export function dismissYearReport(s: GameState) {
  s.modals = s.modals.filter((m) => m.kind !== 'yearReport');
}

export function chooseEventOption(s: GameState, eventId: string, choiceId: string) {
  const ev = eventDef(eventId);
  ev?.choices?.find((c) => c.id === choiceId)?.apply?.(s);
  decide(s, 'event:' + eventId, `Olay ${eventId}: ${ev?.choices?.find((c) => c.id === choiceId)?.label ?? choiceId}`);
  shiftModal(s);
}

export function recallDecision(s: GameState, modelId: string, defectId: string, decision: 'recall' | 'ignore') {
  const m = model(s, modelId);
  const d = m.defects.find((x) => x.id === defectId);
  const yf = yearFloat(s.week);
  if (d) {
    if (decision === 'recall') {
      const perCar = (d.severity === 'critical' ? 25 : 10) * costIndex(yf);
      const cost = m.unitsSold * perCar;
      spend(s, cost, 'warranty');
      d.fixed = true;
      s.company.reputation = clamp(s.company.reputation - (d.severity === 'critical' ? 3 : 1), 0, 100);
      m.perceivedReliability -= d.severity === 'critical' ? 3 : 1;
      log(s, `${m.name} geri çağrıldı: ${Math.round(m.unitsSold)} araç, ${money(cost)}.`, 'warn');
    } else {
      d.ignored = true;
      if (d.severity !== 'critical') {
        m.perceivedReliability -= 4;
        s.company.reputation = clamp(s.company.reputation - 1, 0, 100);
      }
      log(s, `${m.name}: kusur için bir şey yapılmadı.`, 'warn');
    }
  }
  decide(s, 'recall:' + defectId, `${m.name}: kusur için ${decision === 'recall' ? 'geri çağırma' : 'hiçbir şey yapmama'}`);
  shiftModal(s);
}

export function setEngineerMode(s: GameState, on: boolean) {
  s.settings.engineerMode = on;
  s.settings.modeChosen = true;
}

export function setAutoPauseCards(s: GameState, on: boolean) {
  s.settings.autoPauseCards = on;
}

/** Quick read of the best score gap for the UI. */
export function modelSummary(s: GameState, id: string) {
  const m = model(s, id);
  return modelScores(s, m);
}

/** A throw-away CarModel for a project, used to preview demand before launch. */
export function previewModel(s: GameState, p: Project, price: number, markets: MarketId[]): CarModel {
  const stats = computeCarStats(p.design, yearFloat(s.week), p.bonus ?? NO_BONUS);
  return {
    id: `preview-${p.id}`,
    name: p.name,
    segment: p.segment,
    design: p.design,
    bonus: p.bonus ?? NO_BONUS,
    stats,
    platformId: p.platformId ?? 'preview',
    engineId: p.engineRefId ?? 'preview',
    generation: 1,
    faceliftCount: 0,
    launchWeek: s.week,
    refreshWeek: s.week,
    price,
    priceWeek: s.week,
    indexPrice: true,
    markets,
    productionRate: 1,
    inventory: 0,
    suppliers: p.suppliers,
    defects: [],
    testWeeks: p.testWeeks,
    unitsBuilt: 0,
    unitsSold: 0,
    soldByMarket: { usa: 0, europe: 0 },
    revenueTotal: 0,
    profitTotal: 0,
    history: [],
    reviews: [],
    reviewScore: 6,
    hype: 3,
    perceivedReliability: stats.reliability,
    fieldFailures: 0,
    warrantyCost: 0,
    status: 'active',
  };
}
