import {
  BODIES,
  CHASSIS,
  FEATURES,
  GEARBOX_TYPES,
  SUSPENSIONS,
  byId,
  immaturityPenalty,
  interp,
} from '../data/tech';
import { knowhowEffects } from '../data/knowhow';
import { computeEngine, curveFor, torqueAt, type TorqueCurve } from './engine';
import type { CarDesign, CarStats, CostPart, DevBonus, EngineStats } from './types';

export const NO_BONUS: DevBonus = {
  powerMult: 1,
  massMult: 1,
  fuelMult: 1,
  comfort: 0,
  safety: 0,
  costMult: 1,
  reliability: 0,
};

const G = 9.81;
const RHO = 1.2;
const PAYLOAD = 150; // driver + passenger, kg
const FUEL_MJ_PER_L = 32;
/** Real-world losses the idealised model misses (warm-up, idling, mixture enrichment). */
const REAL_WORLD_FUEL = 1.3;

export const rollingResistance = (year: number) =>
  interp([[1900, 0.022], [1930, 0.016], [1960, 0.013]], year);
export const tyreGrip = (year: number) => interp([[1900, 0.6], [1930, 0.72], [1960, 0.85]], year);
export const wheelRadius = (year: number, size: number) =>
  interp([[1900, 0.4], [1930, 0.36], [1960, 0.33]], year) * (0.94 + 0.12 * size);
/** Typical cruising speed of the era (roads got better). */
export const cruiseSpeed = (year: number) => interp([[1900, 35], [1920, 50], [1940, 70], [1960, 90]], year);
const streamlining = (year: number) => 1 - 0.35 * Math.min(1, Math.max(0, (year - 1925) / 35));

const GEAR_SPREAD: Record<number, number> = { 1: 1, 2: 2.0, 3: 2.9, 4: 3.6, 5: 4.1, 6: 4.6 };

interface DriveModel {
  tc: TorqueCurve;
  ratios: number[];
  r: number;
  eta: number;
  mass: number;
  crr: number;
  cda: number;
  grip: number;
  shiftTime: number;
}

function roadLoadN(d: DriveModel, v: number): number {
  return d.crr * d.mass * G + 0.5 * RHO * d.cda * v * v;
}

function rpmAt(d: DriveModel, v: number, ratio: number): number {
  return ((v / (2 * Math.PI * d.r)) * 60) * ratio;
}

/** Wheel force (N) in a gear at speed v, including clutch slip at launch. */
function wheelForce(d: DriveModel, v: number, ratio: number): number {
  let rpm = rpmAt(d, v, ratio);
  if (rpm > d.tc.redline) return 0;
  rpm = Math.max(rpm, 0.35 * d.tc.redline); // clutch slip keeps engine in its band at launch
  // 0.85: installed (net) torque is below the test-bench figure.
  const f = (0.85 * torqueAt(d.tc, rpm) * ratio * d.eta) / d.r;
  return Math.min(f, d.grip * d.mass * G * 0.5);
}

function wheelPowerW(d: DriveModel, v: number, ratio: number): number {
  const rpm = rpmAt(d, v, ratio);
  if (rpm > d.tc.redline || rpm < 0.2 * d.tc.redline) return 0;
  return ((torqueAt(d.tc, rpm) * rpm * 2 * Math.PI) / 60) * d.eta;
}

/** Top speed (m/s): highest speed where available wheel power still beats road load. */
function topSpeed(d: DriveModel): number {
  let best = 0;
  for (let kmh = 5; kmh <= 320; kmh += 0.5) {
    const v = kmh / 3.6;
    const need = roadLoadN(d, v) * v;
    let avail = 0;
    for (const g of d.ratios) avail = Math.max(avail, wheelPowerW(d, v, g));
    if (avail >= need) best = v;
    else if (best > 0) break;
  }
  return best;
}

/** Straight-line speed where max wheel power equals road load, ignoring gearing. */
function dragLimitedSpeed(pWheel: number, crr: number, mass: number, cda: number): number {
  let lo = 1;
  let hi = 150;
  for (let i = 0; i < 60; i++) {
    const v = (lo + hi) / 2;
    const need = (crr * mass * G + 0.5 * RHO * cda * v * v) * v;
    if (need > pWheel) hi = v;
    else lo = v;
  }
  return lo;
}

function simulateAcceleration(d: DriveModel): { t50: number; t100: number | null } {
  const dt = 0.05;
  const mEff = d.mass * 1.06;
  let v = 0;
  let t = 0.3; // driver reaction / clutch take-up
  let gear = 0;
  let shiftLeft = 0;
  let t50 = NaN;
  let t100: number | null = null;
  while (t < 120) {
    let f = 0;
    let driving = false;
    if (shiftLeft > 0) {
      shiftLeft -= dt;
    } else {
      // Upshift when the next gear gives more force or we hit the rev limiter.
      if (gear < d.ratios.length - 1) {
        const rpm = rpmAt(d, v, d.ratios[gear]);
        const here = wheelForce(d, v, d.ratios[gear]);
        const next = wheelForce(d, v, d.ratios[gear + 1]);
        if (rpm >= 0.985 * d.tc.redline || (v > 1 && next > here)) {
          gear++;
          shiftLeft = d.shiftTime;
        }
      }
      if (shiftLeft <= 0) {
        f = wheelForce(d, v, d.ratios[gear]);
        driving = true;
      }
    }
    const a = (f - roadLoadN(d, v)) / mEff;
    if (v < 0.5 && a <= 0) break; // cannot even move off (absurd designs)
    v = Math.max(0, v + a * dt);
    t += dt;
    if (Number.isNaN(t50) && v >= 50 / 3.6) t50 = t;
    if (v >= 100 / 3.6) {
      t100 = t;
      break;
    }
    if (driving && a < 0.003 && gear === d.ratios.length - 1) break;
  }
  return { t50: Number.isNaN(t50) ? 99 : t50, t100 };
}

export interface FuelBreakdown {
  cruise: number;
  city: number;
  combined: number;
}

function fuelAt(d: DriveModel, eng: EngineStats, v: number, extraEnergyJ: number): number {
  // Pick the highest gear that keeps the engine above ~22% of redline.
  let ratio = d.ratios[d.ratios.length - 1];
  for (let i = d.ratios.length - 1; i >= 0; i--) {
    ratio = d.ratios[i];
    if (rpmAt(d, v, ratio) >= 0.22 * d.tc.redline) break;
  }
  const rpm = Math.min(d.tc.redline, Math.max(rpmAt(d, v, ratio), 0.22 * d.tc.redline));
  const pNeed = (roadLoadN(d, v) * v) / d.eta;
  const pAvail = (torqueAt(d.tc, rpm) * rpm * 2 * Math.PI) / 60;
  const load = Math.min(1, Math.max(0.03, pNeed / Math.max(1, pAvail)));
  // Throttled engines waste energy pumping air; spinning fast wastes it on friction.
  // A diesel has no throttle to pump against, so it stays efficient at part load.
  const partLoad = eng.diesel ? 0.55 + 0.45 * Math.sqrt(load) : 0.3 + 0.7 * Math.sqrt(load);
  const eta = eng.peakEfficiency * partLoad * (1 - 0.25 * (rpm / d.tc.redline) ** 2);
  const energy = roadLoadN(d, v) * 1e5 + extraEnergyJ; // J per 100 km at the wheels
  // Diesel fuel carries about 12% more energy per litre.
  return (REAL_WORLD_FUEL * energy) / (eta * d.eta) / (FUEL_MJ_PER_L * (eng.diesel ? 1.12 : 1) * 1e6);
}

export function computeCarStats(design: CarDesign, year: number, bonus: DevBonus = NO_BONUS): CarStats {
  const chassis = byId(CHASSIS, design.chassis);
  const body = byId(BODIES, design.body);
  const gb = byId(GEARBOX_TYPES, design.gearbox.type);
  const susp = byId(SUSPENSIONS, design.suspension);
  const feats = design.features.map((f) => byId(FEATURES, f));
  const has = (id: string) => design.features.includes(id as never);
  const sizeScale = 0.75 + 0.6 * design.size;
  const kh = knowhowEffects(design.knowhow);
  const powerMult = bonus.powerMult * kh.power;

  const engine = computeEngine(design.engine, year, powerMult);
  const gearboxMass = 20 + 8 * design.gearbox.gears + gb.mass;

  // ---- Mass ----
  // Bigger cars need disproportionately heavier structure; all-steel bodies add ~15%.
  const structure =
    (200 + body.mass) * Math.pow(sizeScale, 1.3) * chassis.massFactor * (has('steelBody') ? 1.15 : 1);
  const featureMass = feats.filter((f) => f.id !== 'steelBody').reduce((s, f) => s + f.mass, 0);
  const mass =
    (structure +
      engine.massKg +
      gearboxMass +
      susp.mass * sizeScale +
      90 * sizeScale +
      (20 + 60 * design.interior) * sizeScale +
      featureMass) *
    bonus.massMult *
    kh.mass;
  const testMass = mass + PAYLOAD;

  // ---- Aero ----
  const cd = body.cd * streamlining(year) * (1 - 0.06 * design.styling) * kh.cd;
  const area = 1.9 + 0.8 * design.size + body.area;

  // ---- Driveline ----
  const tc = curveFor(design.engine, year, powerMult);
  const eta = gb.efficiency;
  const r = wheelRadius(year, design.size);
  const crr = rollingResistance(year);
  const vDrag = dragLimitedSpeed(engine.powerKw * 1000 * eta, crr, testMass, cd * area);
  const gFactor = 1.2 - 0.5 * design.gearbox.spread;
  const topRatio = (engine.peakPowerRpm * gFactor * 2 * Math.PI * r) / (60 * vDrag);
  const n = design.gearbox.gears;
  const firstRatio = topRatio * (GEAR_SPREAD[n] ?? 3);
  const ratios: number[] = [];
  for (let i = 0; i < n; i++) {
    ratios.push(n === 1 ? topRatio : firstRatio * Math.pow(topRatio / firstRatio, i / (n - 1)));
  }
  const drive: DriveModel = {
    tc,
    ratios,
    r,
    eta,
    mass: testMass,
    crr,
    cda: cd * area,
    grip: tyreGrip(year),
    shiftTime: gb.shiftTime,
  };
  const vmax = topSpeed(drive);
  const acc = simulateAcceleration(drive);

  // ---- Fuel: blend of steady cruising and stop-and-go town driving ----
  const vc = Math.min(cruiseSpeed(year), 0.8 * vmax * 3.6) / 3.6;
  const vCity = Math.min(vc * 0.55, 30 / 3.6);
  const stopsPer100km = 150;
  const cityExtra = stopsPer100km * 0.5 * testMass * vCity * vCity;
  const fuelCruise = fuelAt(drive, engine, vc, 0);
  const fuelCity = fuelAt(drive, engine, vCity, cityExtra);
  const fuel = (0.55 * fuelCruise + 0.45 * fuelCity) * bonus.fuelMult * kh.fuel;

  // ---- Soft attributes (absolute points; scoring compares them with the era) ----
  const sum = (key: 'comfort' | 'handling' | 'safety' | 'prestige' | 'practicality' | 'reliability') =>
    feats.reduce((s, f) => s + (f[key] ?? 0), 0);
  const closed = body.closed;

  const comfort =
    10 +
    body.comfort +
    12 * design.size +
    susp.comfort +
    18 * (1 - design.suspBalance) +
    engine.smoothness +
    15 * design.interior +
    gb.comfort +
    Math.min(8, Math.max(-4, (mass - 700) / 150)) +
    sum('comfort') +
    kh.comfort +
    bonus.comfort;

  const handling =
    20 +
    susp.handling +
    22 * design.suspBalance +
    chassis.handling +
    body.cog +
    8 * (1 - design.size) -
    Math.min(18, Math.max(-6, (mass - 800) / 70)) +
    sum('handling') +
    kh.handling +
    (bonus.handling ?? 0);

  const safety =
    10 +
    body.safety +
    chassis.safety +
    Math.min(10, Math.max(-3, (mass - 600) / 120)) +
    0.12 * handling +
    sum('safety') +
    kh.safety +
    bonus.safety;

  const featureImmaturity = feats.reduce((s, f) => s + immaturityPenalty(3, f.year, year), 0);
  const reliability =
    72 -
    engine.reliabilityPenalty -
    gb.reliability -
    immaturityPenalty(gb.immaturity, gb.year, year) -
    susp.reliability -
    immaturityPenalty(susp.immaturity, susp.year, year) -
    immaturityPenalty(6, chassis.year, year) -
    featureImmaturity -
    0.6 * feats.length +
    sum('reliability') +
    kh.reliability +
    bonus.reliability;

  const prestige =
    10 -
    (design.engine.fuel === 'diesel' ? 3 : 0) +
    25 * design.styling +
    body.prestige +
    12 * design.size +
    (design.engine.cylinders >= 16 ? 20 : design.engine.cylinders >= 12 ? 16 : design.engine.cylinders >= 8 ? 10 : design.engine.cylinders >= 6 ? 5 : design.engine.cylinders <= 2 ? -5 : design.engine.cylinders === 3 ? -2 : 0) +
    15 * design.interior +
    gb.prestige +
    sum('prestige') +
    kh.prestige;

  const practicality =
    20 +
    body.practicality +
    20 * design.size +
    gb.practicality +
    (closed ? 5 : 0) +
    sum('practicality') +
    kh.practicality +
    (bonus.practicality ?? 0);

  // ---- Cost ----
  const gearboxCost = 25 + 12 * n + gb.cost;
  const electricsCost = 20 + feats.filter((f) => f.electric).reduce((s, f) => s + f.cost, 0);
  const otherFeatures = feats.filter((f) => !f.electric).reduce((s, f) => s + f.cost, 0);
  const structureCost = (chassis.cost + body.cost * (has('steelBody') ? 1.2 : 1)) * sizeScale;
  const baseCost =
    structureCost +
    engine.cost +
    gearboxCost +
    electricsCost +
    susp.cost * sizeScale +
    70 * sizeScale +
    (20 + 200 * design.interior * design.interior) * sizeScale +
    60 * design.styling +
    otherFeatures;
  const mult = bonus.costMult * kh.cost;
  const unitCost = baseCost * mult;
  const costParts: Record<CostPart, number> = {
    engine: engine.cost * mult,
    gearbox: gearboxCost * mult,
    chassis: chassis.cost * sizeScale * mult,
    body: body.cost * (has('steelBody') ? 1.2 : 1) * sizeScale * mult,
    suspension: susp.cost * sizeScale * mult,
    running: 70 * sizeScale * mult,
    interior: (20 + 200 * design.interior * design.interior) * sizeScale * mult,
    styling: 60 * design.styling * mult,
    electrics: electricsCost * mult,
    features: otherFeatures * mult,
  };

  const complexity =
    0.75 +
    0.35 * design.size +
    body.complexity +
    chassis.complexity +
    0.02 * design.engine.cylinders +
    feats.reduce((s, f) => s + f.complexity, 0) +
    0.2 * design.styling +
    0.2 * design.interior;

  const vtExtra = { sv: 0, ioe: 0.05, ohv: 0.1, ohc: 0.2, dohc: 0.4 }[design.engine.valvetrain];
  const devWork =
    30 *
    (0.8 +
      0.5 * design.size +
      0.03 * design.engine.cylinders +
      0.25 * design.styling +
      0.2 * design.interior +
      0.05 * feats.length +
      vtExtra +
      (design.gearbox.type === 'automatic' ? 0.3 : 0) +
      (design.engine.aspiration === 'supercharger' ? 0.3 : 0) +
      (design.engine.fuelSystem === 'injection' ? 0.4 : 0) +
      (design.chassis === 'monocoque' ? 0.3 : 0)) *
    (1 + Math.max(0, year - 1900) / 15);

  return {
    engine,
    massKg: mass,
    cd,
    frontalArea: area,
    gearRatios: ratios,
    accel50: acc.t50,
    accel100: acc.t100,
    topSpeed: vmax * 3.6,
    fuel,
    comfort,
    handling,
    safety,
    reliability,
    prestige,
    practicality,
    unitCost,
    componentCost: {
      engine: engine.cost * bonus.costMult,
      gearbox: gearboxCost * bonus.costMult,
      electrics: electricsCost * bonus.costMult,
    },
    costParts,
    costMults: { focus: bonus.costMult, knowhow: kh.cost },
    complexity,
    devWork,
  };
}

/** Speed (km/h) at redline in each gear — for the gearbox chart. */
export function gearSpeeds(stats: CarStats, year: number, size: number): number[] {
  const r = wheelRadius(year, size);
  return stats.gearRatios.map((g) => ((stats.engine.redline / g / 60) * 2 * Math.PI * r) * 3.6);
}

/** Wheel force (N) vs speed for each gear — for the gearbox chart. */
export function tractionCurves(
  design: CarDesign,
  stats: CarStats,
  year: number,
  bonus: DevBonus = NO_BONUS,
): { gear: number; points: { kmh: number; force: number }[] }[] {
  const tc = curveFor(design.engine, year, bonus.powerMult);
  const gb = byId(GEARBOX_TYPES, design.gearbox.type);
  const r = wheelRadius(year, design.size);
  return stats.gearRatios.map((ratio, i) => {
    const pts: { kmh: number; force: number }[] = [];
    for (let x = 0.2; x <= 1.0001; x += 0.04) {
      const rpm = x * tc.redline;
      const v = (rpm / 60 / ratio) * 2 * Math.PI * r;
      pts.push({ kmh: v * 3.6, force: (torqueAt(tc, rpm) * ratio * gb.efficiency) / r });
    }
    return { gear: i + 1, points: pts };
  });
}

/** Torque & power curve samples — for the engine chart. */
export function engineCurve(design: CarDesign, year: number, powerMult = 1) {
  const tc = curveFor(design.engine, year, powerMult);
  const pts: { rpm: number; torque: number; hp: number }[] = [];
  for (let x = 0.15; x <= 1.0001; x += 0.025) {
    const rpm = x * tc.redline;
    const t = torqueAt(tc, rpm);
    pts.push({ rpm, torque: t, hp: (t * rpm * 2 * Math.PI) / 60 / 745.7 });
  }
  return pts;
}
