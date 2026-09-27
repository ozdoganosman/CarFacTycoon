import { ASPIRATIONS, FUEL_SYSTEMS, VALVETRAINS, byId, immaturityPenalty, maxCompression } from '../data/tech';
import type { EngineDesign, EngineStats } from './types';

// Engine model: a simplified but physically grounded 4-stroke Otto engine.
//  - Displacement from bore/stroke/cylinders.
//  - Max rpm limited by mean piston speed (long stroke => lower redline).
//  - Torque from BMEP, which rises with compression ratio (Otto efficiency),
//    breathing (valvetrain, fuel system) and the era's metallurgy/know-how.
//  - A parabolic torque curve peaking at x0 * redline.

export const TECH_K = (year: number) => 1700 + 12 * Math.min(60, Math.max(0, year - 1900));

// Diesel (compression ignition, first production car 1936): no knock limit, so
// compression runs 14-22:1 and efficiency is high, but the smoke limit keeps
// mean pressure low, slow combustion keeps revs low, and the block must be heavy.
export const DIESEL_YEAR = 1936;
export const isDiesel = (e: Pick<EngineDesign, 'fuel'>) => e.fuel === 'diesel';
export const DIESEL_COMPRESSION: [number, number] = [14, 22];
const dieselRpmCap = (year: number) => 2800 + 25 * Math.max(0, year - DIESEL_YEAR);

export function displacementCc(e: Pick<EngineDesign, 'cylinders' | 'bore' | 'stroke'>): number {
  const b = e.bore / 10;
  const s = e.stroke / 10;
  return e.cylinders * (Math.PI / 4) * b * b * s;
}

/** British RAC horsepower: bore² (inches) × cylinders / 2.5. Ignores stroke entirely. */
export function racHp(e: Pick<EngineDesign, 'cylinders' | 'bore'>): number {
  const d = e.bore / 25.4;
  return (d * d * e.cylinders) / 2.5;
}

/** Knock-limited compression: big bores have long flame paths and knock earlier. */
export function knockLimit(bore: number, year: number): number {
  return maxCompression(year) - 0.018 * Math.max(0, bore - 85);
}

export function otto(r: number): number {
  return 1 - Math.pow(r, -0.3);
}

export interface TorqueCurve {
  tmax: number;
  x0: number;
  c: number;
  redline: number;
}

/** Torque (Nm) at a given rpm. Falls off parabolically either side of the peak. */
export function torqueAt(tc: TorqueCurve, rpm: number): number {
  const x = rpm / tc.redline;
  const t = tc.tmax * (1 - tc.c * (x - tc.x0) * (x - tc.x0));
  return Math.max(0, t);
}

export function curveFor(e: EngineDesign, year: number, powerMult = 1): TorqueCurve {
  const vt = byId(VALVETRAINS, e.valvetrain);
  const fs = byId(FUEL_SYSTEMS, e.fuelSystem);
  const asp = byId(ASPIRATIONS, e.aspiration);
  const vd = displacementCc(e) / 1e6; // m³
  const techYears = Math.min(60, Math.max(0, year - 1900));
  const diesel = isDiesel(e);
  const pistonLimit = vt.pistonSpeed + 0.055 * techYears;
  let redline = (30000 * pistonLimit) / e.stroke;
  redline = Math.min(redline, vt.rpmCap + 15 * techYears, diesel ? dieselRpmCap(year) : Infinity);
  // Overhead valves with a big bore get bigger valves -> better breathing.
  const boreRatio = e.bore / e.stroke;
  const breathing = vt.id === 'sv' ? 1 : 1 + 0.06 * Math.max(-0.4, Math.min(0.5, boreRatio - 1));
  const kl = knockLimit(e.bore, year);
  const knockLoss = !diesel && e.compression > kl ? 1 - 0.12 * (e.compression - kl) : 1;
  // A diesel's own injection pump replaces the carburettor; the smoke limit caps its pressure.
  const fuelVe = diesel ? 0.62 : fs.ve;
  const bmep = TECH_K(year) * otto(e.compression) * vt.ve * fuelVe * breathing * asp.boost * knockLoss * powerMult;
  const tmax = (bmep * 1000 * vd) / (4 * Math.PI);
  // Choose curvature so that power peaks at ~92% of redline.
  const xp = 0.92;
  const c = 1 / ((xp - vt.x0) * (xp - vt.x0) + 2 * xp * (xp - vt.x0));
  return { tmax, x0: vt.x0, c, redline };
}

const SMOOTHNESS: Record<number, number> = { 1: -9, 2: -5, 3: -2, 4: 0, 6: 7, 8: 9, 12: 12, 16: 13 };

export function computeEngine(e: EngineDesign, year: number, powerMult = 1): EngineStats {
  const vt = byId(VALVETRAINS, e.valvetrain);
  const fs = byId(FUEL_SYSTEMS, e.fuelSystem);
  const asp = byId(ASPIRATIONS, e.aspiration);
  const cc = displacementCc(e);
  const liters = cc / 1000;
  const tc = curveFor(e, year, powerMult);

  let peakP = 0;
  let peakPrpm = 0;
  for (let rpm = 300; rpm <= tc.redline; rpm += 25) {
    const p = (torqueAt(tc, rpm) * rpm * 2 * Math.PI) / 60;
    if (p > peakP) {
      peakP = p;
      peakPrpm = rpm;
    }
  }
  const diesel = isDiesel(e);
  const kl = diesel ? 99 : knockLimit(e.bore, year);
  const knocking = !diesel && e.compression > kl + 0.05;
  const mass = (25 + 32 * liters + 7 * e.cylinders + (e.layout === 'v' ? 8 : 0)) * (asp.id === 'supercharger' ? 1.08 : 1) * (diesel ? 1.35 : 1);
  const cost =
    (40 + 18 * e.cylinders + 30 * liters) * vt.costMult * (e.layout === 'v' ? 1.1 : 1) * (diesel ? 1.4 : 1) + (diesel ? 60 : fs.cost) + asp.cost;

  const bmepKpa = (tc.tmax * 4 * Math.PI) / (cc / 1e6) / 1000;
  // Stress: output well above what the era considers normal costs reliability.
  const eraBmep = TECH_K(year) * otto(maxCompression(year) - 0.5) * 0.8;
  const stress = Math.max(0, bmepKpa / eraBmep - 1.05);
  const reliabilityPenalty =
    1.1 * (e.cylinders - 1) +
    vt.reliability +
    (diesel ? -3 + immaturityPenalty(8, DIESEL_YEAR, year) : fs.reliability) +
    asp.reliability +
    22 * stress +
    (knocking ? 6 + 10 * (e.compression - kl) : 0) +
    immaturityPenalty(vt.immaturity, vt.year, year) +
    (diesel ? 0 : immaturityPenalty(fs.immaturity, fs.year, year)) +
    immaturityPenalty(asp.immaturity, asp.year, year);

  const peakEfficiency = 0.55 * otto(e.compression) * vt.effMult * (diesel ? 0.9 : fs.eff) * asp.eff * (knocking ? 0.93 : 1);

  return {
    displacementCc: cc,
    powerKw: peakP / 1000,
    powerHp: peakP / 745.7,
    peakPowerRpm: peakPrpm,
    torqueNm: tc.tmax,
    peakTorqueRpm: tc.x0 * tc.redline,
    redline: tc.redline,
    bmepKpa,
    pistonSpeed: (2 * (e.stroke / 1000) * tc.redline) / 60,
    massKg: mass,
    cost,
    // Diesel knock: rattly at idle, shaking in town.
    // A V6 is not self-balancing like a straight six.
    smoothness: (SMOOTHNESS[e.cylinders] ?? 0) - (e.cylinders === 6 && e.layout === 'v' ? 3 : 0) - (diesel ? 7 : 0),
    knockLimit: kl,
    knocking,
    taxHp: racHp(e),
    peakEfficiency,
    diesel,
    reliabilityPenalty,
  };
}

/** Bore & stroke for a target displacement and stroke/bore ratio. */
export function boreStrokeFor(cc: number, cylinders: number, strokeRatio: number): { bore: number; stroke: number } {
  // cc = n * pi/4 * b² * (r*b)  (in cm) => b = cbrt(4cc / (n*pi*r))
  const bCm = Math.cbrt((4 * cc) / (cylinders * Math.PI * strokeRatio));
  const bore = Math.round(bCm * 10 * 2) / 2;
  const stroke = Math.round(bore * strokeRatio * 2) / 2;
  return { bore, stroke };
}
