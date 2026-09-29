import { useRef, useState } from 'react';
import { t, msg } from '../../../i18n';
import { fmtPercent } from '../../../i18n/format';
import type { BodyId, SuspensionTypeId } from '../../../core/types';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Readout, Slider } from './controls';
import { TAU, alpha, clamp, fmt, fs, hash01, mix, mod, paperGrid, roundRect, spring, text, type Ctx } from './draw';

// The car's own suspension on a test road: cobbles, a pothole under the left
// wheels, a hump, a wavy stretch and a bend. A half-car model (body heave and
// pitch, a front and a rear axle on tyres) is integrated in real time from the
// design: spring rate from the comfort/grip setting, damping from the dampers
// the company knows how to make, axle mass from the suspension type, tyre
// stiffness from the tyres of the day. A front view shows the body rolling in
// the bend and the solid axle tilting both wheels over the pothole.

export interface SuspensionSimProps {
  suspension: SuspensionTypeId;
  /** 0 = soft (comfort), 1 = stiff (grip). */
  balance: number;
  /** Know-how the design carries (dampers, tyres, anti-roll bar). */
  knowhow?: string[];
  year: number;
  /** Body style: the car on the test road looks like the one being designed. */
  body?: BodyId;
}

const G = 9.81;
const M = 1000; // sprung mass, kg
const A = 1.3; // CG → front axle, m
const B = 1.5; // CG → rear axle
const R = 0.36; // wheel radius
const TRACK = 1.36;
const CG_H = 0.8;
const EX = 3; // vertical motions drawn three times larger
const COURSE = 98;
const H_ROLL = 0.45; // CG height over the roll axis
const I_ROLL = M * 0.55 * 0.55;
const BUMP_TRAVEL = 0.09; // compression before the bump stop

const SECTIONS = [
  { x: 8, name: msg('Parke taş') },
  { x: 25.5, name: msg('Çukur (sol teker)') },
  { x: 32.5, name: msg('Kasis') },
  { x: 42, name: msg('Dalgalı yol') },
  { x: 74, name: msg('Viraj') },
];

/** Road height (m) at course position x under the left (-1), right (1) or both (0) wheels. */
function road(x: number, side: -1 | 0 | 1): number {
  if (side === 0) return (road(x, -1) + road(x, 1)) / 2;
  const u = mod(x, COURSE);
  let h = 0;
  if (u >= 8 && u < 20) {
    const i = Math.floor(u / 0.28);
    const fr = (u - i * 0.28) / 0.28;
    h += (0.008 + 0.012 * hash01(i + (side > 0 ? 500 : 0))) * Math.pow(Math.sin(Math.PI * fr), 0.6);
  }
  if (side < 0 && u >= 25.5 && u < 26.5) h -= 0.07 * Math.sin(Math.PI * (u - 25.5)) ** 2;
  if (u >= 32.5 && u < 36.5) h += 0.065 * Math.sin((Math.PI * (u - 32.5)) / 4) ** 2;
  // long swells: at touring speed they rock the body at its own bouncing rate
  if (u >= 42 && u < 69) h += 0.045 * Math.sin((Math.PI * (u - 42)) / 9) ** 2 * (side > 0 ? 0.8 : 1);
  return h;
}

/** Sideways acceleration in the bend at speed v (in g). */
function latG(x: number, v: number): number {
  const u = mod(x, COURSE);
  if (u < 74 || u >= 92) return 0;
  const ramp = Math.min(1, (u - 74) / 3, (92 - u) / 3);
  return ramp * Math.min(0.6, (v * v) / (40 * G));
}

type Pt = [number, number];

/** Outline of the car in the style of its year and body (m; x forward, y up from the ground at rest). */
interface BodyShape {
  side: Pt[];
  glass: Pt[][];
  heads: Pt[];
  /** The windscreen of an open car. */
  screen?: [Pt, Pt];
  /** Separate wings over the wheels (gone with the flat-sided bodies of the 1940s). */
  wings: boolean;
  front: Pt[];
  frontGlass?: Pt[];
  frontHeads: Pt[];
  lampY: number;
}

export function bodyShape(body: BodyId | undefined, year: number): BodyShape {
  const early = year < 1925;
  const pontoon = year >= 1942;
  if (body === 'phaeton' || body === 'roadster' || body === undefined) {
    const roadster = body === 'roadster';
    const screen: [Pt, Pt] | undefined = year >= 1906 ? [[roadster ? 0.45 : 0.55, 1.08], [roadster ? 0.4 : 0.48, 1.45]] : undefined;
    return {
      side: roadster
        ? [[-1.9, 0.62], [2.0, 0.62], [2.0, 0.98], [0.75, 1.0], [0.45, 1.06], [-0.55, 1.06], [-1.0, 0.95], [-1.9, 0.88]]
        : [[-2.0, 0.62], [2.0, 0.62], [2.0, 1.0], [0.85, 1.02], [0.55, 1.1], [-0.25, 1.1], [-0.35, 1.16], [-1.85, 1.16], [-2.0, 1.05]],
      glass: [],
      heads: roadster ? [[-0.15, 1.3]] : [[0.05, 1.32], [-1.0, 1.36]],
      screen,
      wings: true,
      front: [[-0.82, 0.6], [0.82, 0.6], [0.86, 1.06], [-0.86, 1.06]],
      frontGlass: screen ? [[-0.62, 1.06], [0.62, 1.06], [0.6, 1.42], [-0.6, 1.42]] : undefined,
      frontHeads: roadster ? [[-0.25, 1.3]] : [[-0.3, 1.3], [0.3, 1.3]],
      lampY: 1.0,
    };
  }
  const tail = body === 'station' || body === 'suv' ? -1.95 : body === 'coupe' ? -0.8 : body === 'pickup' ? -0.35 : -1.55;
  let side: Pt[];
  let glass: Pt[][];
  let front: Pt[];
  let frontGlass: Pt[];
  if (pontoon) {
    const top = body === 'suv' ? 1.72 : 1.47;
    side =
      body === 'pickup'
        ? [[-2.15, 0.52], [2.15, 0.52], [2.15, 1.0], [0.95, 1.04], [0.5, top], [-0.35, top], [-0.4, 1.04], [-2.15, 1.04]]
        : [[-2.15, 0.48], [2.15, 0.48], [2.15, 0.98], [0.95, 1.02], [0.5, top], [tail < -1.5 ? -2.05 : tail, top], [tail < -1.5 ? -2.12 : tail - 0.5, 1.05], [-2.15, 1.0]];
    glass = [[[0.4, 1.12], [0.44, top - 0.08], [-0.3, top - 0.08], [-0.3, 1.12]]];
    if (tail < -0.9) glass.push([[-0.42, 1.12], [-0.42, top - 0.08], [Math.max(tail, -1.9) + 0.15, top - 0.08], [Math.max(tail, -1.9) + 0.35, 1.12]]);
    front = [[-0.92, 0.48], [0.92, 0.48], [0.94, 1.0], [0.62, 1.08], [0.52, top], [-0.52, top], [-0.62, 1.08], [-0.94, 1.0]];
    frontGlass = [[-0.46, 1.12], [0.46, 1.12], [0.42, top - 0.07], [-0.42, top - 0.07]];
  } else {
    const top = early ? 1.8 : 1.57;
    const lean = early ? 0.05 : 0.3;
    side = [[-2.05, 0.62], [2.05, 0.62], [2.05, 1.02], [0.8, 1.06], [0.5 + lean * 0.3, 1.1], [0.5 - lean, top], [tail, top], [tail - (body === 'coupe' && !early ? 0.9 : 0.05), 1.1], ...(body === 'pickup' ? ([[-2.05, 1.08]] as Pt[]) : ([[-2.05, 1.08]] as Pt[]))];
    glass = [[[0.42 - lean * 0.2, 1.2], [0.44 - lean, top - 0.12], [-0.3, top - 0.12], [-0.3, 1.2]]];
    if (tail < -0.9) glass.push([[-0.42, 1.2], [-0.42, top - 0.12], [tail + 0.15, top - 0.12], [tail + 0.15, 1.2]]);
    front = [[-0.82, 0.6], [0.82, 0.6], [0.86, 1.06], [0.62, 1.1], [0.56, top], [-0.56, top], [-0.62, 1.1], [-0.86, 1.06]];
    frontGlass = [[-0.46, 1.18], [0.46, 1.18], [0.44, top - 0.1], [-0.44, top - 0.1]];
  }
  return {
    side,
    glass,
    heads: tail < -0.9 ? [[0.0, 1.33], [-1.1, 1.35]] : [[0.0, 1.33]],
    wings: !pontoon,
    front,
    frontGlass,
    frontHeads: [[-0.28, 1.32]],
    lampY: pontoon ? 0.82 : early ? 1.0 : 0.92,
  };
}

type Damper = 'none' | 'friction' | 'hydraulic';

export interface SuspParams {
  front: 'solid' | 'indep';
  rear: 'solid' | 'indep';
  mu: [number, number];
  ks: [number, number];
  cs: [number, number];
  fric: [number, number];
  kt: number;
  ct: number;
  fn: number;
  damper: Damper;
  tyre: string;
  kRoll: number;
  cRoll: number;
  fRoll: number;
  coupling: number;
  antiRoll: boolean;
  shape: BodyShape;
}

export function suspParams(p: SuspensionSimProps): SuspParams {
  const kh = new Set(p.knowhow ?? []);
  const front = p.suspension === 'leaf' ? 'solid' : 'indep';
  const rear = p.suspension === 'allind' ? 'indep' : 'solid';
  const damper: Damper = kh.has('kh:hydraulicDampers') ? 'hydraulic' : kh.has('kh:frictionDampers') ? 'friction' : 'none';
  const bal = clamp(p.balance, 0, 1);
  const fn = 0.95 + 1.1 * bal; // body bounce frequency, Hz
  const massF = (M * B) / (A + B);
  const massR = (M * A) / (A + B);
  const w = TAU * fn;
  const ks: [number, number] = [massF * w * w, massR * w * w];
  // damping ratio and dry friction by damper type; leaf springs rub between their leaves
  const zeta = damper === 'hydraulic' ? 0.22 + 0.2 * bal : damper === 'friction' ? 0.1 : 0.05;
  const dry = damper === 'friction' ? 380 : 0;
  const leafRub = (t: 'solid' | 'indep') => (t === 'solid' ? 150 : 20);
  const cs: [number, number] = [2 * zeta * Math.sqrt(ks[0] * massF), 2 * zeta * Math.sqrt(ks[1] * massR)];
  const fric: [number, number] = [dry + leafRub(front), dry + leafRub(rear)];
  const mu: [number, number] = [front === 'solid' ? 85 : 48, rear === 'solid' ? 95 : 52];
  // Turkish, compared below; shown with t().
  const tyre = kh.has('kh:radialTires') ? msg('Radyal') : kh.has('kh:balloonTires') ? msg('Balon') : msg('Yüksek basınçlı dar lastik');
  const kt = tyre === 'Radyal' ? 250_000 : tyre === 'Balon' ? 210_000 : 340_000;
  const antiRoll = kh.has('kh:antiRoll');
  const fRollHz = fn * 1.6 * (antiRoll ? 1.35 : 1);
  const kRoll = I_ROLL * (TAU * fRollHz) ** 2;
  return {
    front,
    rear,
    mu,
    ks,
    cs,
    fric,
    kt,
    ct: 500,
    fn,
    damper,
    tyre,
    kRoll,
    cRoll: 2 * (zeta + 0.05) * Math.sqrt(kRoll * I_ROLL),
    fRoll: (fric[0] + fric[1]) * 0.25,
    coupling: front === 'solid' ? 0.55 : 0.25,
    antiRoll,
    shape: bodyShape(p.body, p.year),
  };
}

interface Sim {
  x: number;
  z: number;
  vz: number;
  th: number;
  vth: number;
  zu: [number, number];
  vu: [number, number];
  phi: number;
  vphi: number;
  load: [number, number];
  bump: [number, number];
  // running measures
  acc2: number;
  load2: number;
  air: number;
  rollPeak: number;
  trace: { acc: number; load: number }[];
  traceClock: number;
}

function newSim(): Sim {
  return { x: 0, z: 0, vz: 0, th: 0, vth: 0, zu: [0, 0], vu: [0, 0], phi: 0, vphi: 0, load: [1, 1], bump: [0, 0], acc2: 0, load2: 0, air: 0, rollPeak: 0, trace: [], traceClock: 0 };
}

const TRACE_HZ = 30;
const TRACE_SECONDS = 6;

/** Advance the model by dt seconds at speed v (m/s). */
function step(s: Sim, p: SuspParams, v: number, dt: number) {
  const h = 0.0005;
  const n = Math.max(1, Math.round(dt / h));
  const sub = dt / n;
  const massAxle = [(M * B) / (A + B), (M * A) / (A + B)];
  const lever = [A, -B];
  for (let k = 0; k < n; k++) {
    const x1 = s.x + v * sub;
    const dFs = [0, 0];
    const acc = [0, 0];
    for (let i = 0; i < 2; i++) {
      const ax = i === 0 ? A : -B;
      const r0 = road(s.x + ax, 0);
      const vr = (road(x1 + ax, 0) - r0) / sub;
      const zb = s.z + lever[i] * s.th;
      const vb = s.vz + lever[i] * s.vth;
      const rel = s.zu[i] - zb; // + = spring compressed
      const vrel = s.vu[i] - vb;
      let f = p.ks[i] * rel + p.cs[i] * vrel + p.fric[i] * Math.tanh(vrel / 0.02);
      const over = rel - BUMP_TRAVEL;
      if (over > 0) {
        f += p.ks[i] * 12 * over;
        s.bump[i] = 0.35;
      }
      dFs[i] = f;
      const st = (massAxle[i] + p.mu[i]) * G;
      const ft = Math.max(0, st + p.kt * (r0 - s.zu[i]) + p.ct * (vr - s.vu[i]));
      s.load[i] = ft / st;
      acc[i] = (ft - (massAxle[i] * G + f) - p.mu[i] * G) / p.mu[i];
    }
    const az = (dFs[0] + dFs[1]) / M;
    const ath = (A * dFs[0] - B * dFs[1]) / (M * 1.2 * 1.2);
    // roll: the bend leans the body out; the road tilts it through the springs
    const phiRoad = (road(s.x + A, -1) - road(s.x + A, 1)) / TRACK;
    const phiRoad1 = (road(x1 + A, -1) - road(x1 + A, 1)) / TRACK;
    const vphiRoad = (phiRoad1 - phiRoad) / sub;
    const relPhi = s.phi - p.coupling * phiRoad;
    const relVphi = s.vphi - p.coupling * vphiRoad;
    const aphi = (M * latG(s.x, v) * G * H_ROLL - p.kRoll * relPhi - p.cRoll * relVphi - p.fRoll * Math.tanh(relVphi / 0.02)) / I_ROLL;
    s.vz += az * sub;
    s.vth += ath * sub;
    s.vphi += aphi * sub;
    for (let i = 0; i < 2; i++) s.vu[i] += acc[i] * sub;
    s.z += s.vz * sub;
    s.th += s.vth * sub;
    s.phi += s.vphi * sub;
    for (let i = 0; i < 2; i++) s.zu[i] += s.vu[i] * sub;
    s.x = x1;
    // what the passenger feels, just behind the centre of gravity
    const seat = az - 0.3 * ath;
    const kk = sub / 2.5;
    s.acc2 += (seat * seat - s.acc2) * kk;
    const dl = (s.load[0] - 1) ** 2;
    s.load2 += (dl - s.load2) * kk;
    s.air += ((s.load[0] < 0.1 || s.load[1] < 0.1 ? 1 : 0) - s.air) * kk;
    s.traceClock += sub;
    if (s.traceClock >= 1 / TRACE_HZ) {
      s.traceClock -= 1 / TRACE_HZ;
      s.trace.push({ acc: seat, load: s.load[0] });
      if (s.trace.length > TRACE_HZ * TRACE_SECONDS) s.trace.shift();
    }
  }
  s.rollPeak = Math.max(Math.abs(s.phi), s.rollPeak * Math.exp(-dt / 4));
  s.bump = [Math.max(0, s.bump[0] - dt), Math.max(0, s.bump[1] - dt)];
}

/** Drive the test road for a while and report the measures (used by tests). */
export function driveTest(props: SuspensionSimProps, kmh: number, seconds: number) {
  const s = newSim();
  const p = suspParams(props);
  let peakRoll = 0;
  let maxAcc2 = 0;
  let air = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    step(s, p, kmh / 3.6, 1 / 60);
    peakRoll = Math.max(peakRoll, Math.abs(s.phi));
    maxAcc2 = Math.max(maxAcc2, s.acc2);
    air = Math.max(air, s.air);
  }
  return { comfort: Math.sqrt(maxAcc2), loadVar: Math.sqrt(s.load2), air, rollDeg: (peakRoll * 180) / Math.PI };
}

export function comfortWord(rms: number): { word: string; tone: 'good' | 'warn' | 'bad' } {
  if (rms < 1.3) return { word: t('Rahat'), tone: 'good' };
  if (rms < 2.6) return { word: t('Sarsıntılı'), tone: 'warn' };
  return { word: t('Çok sert'), tone: 'bad' };
}

function drawSim(ctx: Ctx, w: number, h: number, c: ThemeColors, s: Sim, p: SuspParams, v: number) {
  const f = fs(w);
  paperGrid(ctx, w, h, c);
  const wide = w >= 620;
  const stripH = clamp(h * 0.26, 70, 100);
  const strip = { x: 10, y: h - stripH - 6, w: w - 20, h: stripH };
  const side = { x: 0, y: 0, w: wide ? w * 0.64 : w, h: strip.y - 6 };
  const front = wide ? { x: side.w, y: 0, w: w - side.w, h: strip.y - 6 } : { x: w * 0.6, y: f * 4.8, w: w * 0.4, h: (strip.y - 6) * 0.5 };
  const tone = (t: 'good' | 'warn' | 'bad') => (t === 'good' ? c.good : t === 'warn' ? c.warn : c.bad);

  // ---------- side view ----------
  const span = wide ? 7 : 6.2;
  const k = side.w / span;
  const gy = side.y + side.h - 18;
  const carX = side.x + side.w * 0.46;
  const SX = (wx: number) => carX + (wx - s.x) * k;
  const roadY = (wx: number) => gy - road(wx, 0) * EX * k;
  // road with the sections' names
  ctx.beginPath();
  ctx.moveTo(side.x, side.y + side.h);
  for (let px = side.x; px <= side.x + side.w; px += 2) ctx.lineTo(px, roadY(s.x + (px - carX) / k));
  ctx.lineTo(side.x + side.w, side.y + side.h);
  ctx.closePath();
  ctx.fillStyle = alpha(c.muted, 0.22);
  ctx.fill();
  ctx.beginPath();
  for (let px = side.x; px <= side.x + side.w; px += 2) {
    const y = roadY(s.x + (px - carX) / k);
    if (px === side.x) ctx.moveTo(px, y);
    else ctx.lineTo(px, y);
  }
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  for (const sec of SECTIONS) {
    for (const lap of [-1, 0, 1]) {
      const wx = Math.floor(s.x / COURSE) * COURSE + lap * COURSE + sec.x;
      const px = SX(wx);
      if (px < side.x - 80 || px > side.x + side.w) continue;
      ctx.strokeStyle = alpha(c.muted, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, gy + 2);
      ctx.lineTo(px, gy - 22);
      ctx.stroke();
      text(ctx, t(sec.name), px + 3, gy - 22, { size: f - 2, color: c.muted, baseline: 'middle', bg: alpha(c.panel, 0.85) });
    }
  }

  // body pose
  const bodyY = gy - (CG_H + s.z * EX) * k;
  const pitch = Math.atan(s.th * EX);
  const toBody = (bx: number, by: number): [number, number] => {
    const dx = bx * k;
    const dy = -(by - CG_H) * k;
    return [carX + dx * Math.cos(-pitch) - dy * Math.sin(-pitch), bodyY + dx * Math.sin(-pitch) + dy * Math.cos(-pitch)];
  };
  const wheelC = (i: number): [number, number] => {
    const ax = i === 0 ? A : -B;
    return [carX + ax * k, gy - (R + s.zu[i] * EX) * k];
  };

  // wheels: spokes turn with distance; the tyre turns red when it leaves the road
  for (let i = 0; i < 2; i++) {
    const [wx, wy] = wheelC(i);
    const air = s.load[i] < 0.1;
    ctx.beginPath();
    ctx.arc(wx, wy, R * k, 0, TAU);
    ctx.fillStyle = air ? alpha(c.bad, 0.85) : mix(c.ink, c.panel, 0.15);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(wx, wy, R * k * 0.68, 0, TAU);
    ctx.fillStyle = c.panel;
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    const rot = s.x / R;
    ctx.beginPath();
    for (let sp = 0; sp < 10; sp++) {
      const a = rot + (sp * TAU) / 10;
      ctx.moveTo(wx + Math.cos(a) * 0.06 * k, wy + Math.sin(a) * 0.06 * k);
      ctx.lineTo(wx + Math.cos(a) * R * k * 0.66, wy + Math.sin(a) * R * k * 0.66);
    }
    ctx.stroke();
    // load arrow under the tyre
    const lh = clamp(s.load[i], 0, 2.5) * 0.35 * k;
    if (!air) {
      ctx.fillStyle = alpha(c.good, 0.7);
      ctx.fillRect(wx - 3, gy + 3, 6, Math.min(14, lh * 0.25));
    }
  }

  // body in the style of its year, drawn in body coordinates (m, y up from the ground at rest)
  const poly = (pts: Pt[]) => {
    ctx.beginPath();
    pts.forEach(([bx, by], i) => {
      const [X, Y] = toBody(bx, by);
      if (i) ctx.lineTo(X, Y);
      else ctx.moveTo(X, Y);
    });
    ctx.closePath();
  };
  const sh = p.shape;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.5;
  poly(sh.side);
  ctx.fillStyle = alpha(c.accent, 0.6);
  ctx.fill();
  ctx.stroke();
  for (const g of sh.glass) {
    poly(g);
    ctx.fillStyle = alpha(c.panel, 0.8);
    ctx.fill();
    ctx.stroke();
  }
  if (sh.screen) {
    const [a1, a2] = [toBody(...sh.screen[0]), toBody(...sh.screen[1])];
    ctx.beginPath();
    ctx.moveTo(a1[0], a1[1]);
    ctx.lineTo(a2[0], a2[1]);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (sh.wings) {
    for (const ax of [A, -B]) {
      const [fx, fy] = toBody(ax, 0.62);
      ctx.beginPath();
      ctx.arc(fx, fy + 0.08 * k, (R + 0.08) * k, Math.PI + 0.25 - pitch, -0.25 - pitch);
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  // the passengers: heads bob with the body
  sh.heads.forEach(([bx, by], i) => {
    // shoulders: down to the seat in an open car, only what the window shows in a closed one
    const deep = sh.glass.length ? 0.2 : 0.36;
    poly([
      [bx - 0.12, by - deep],
      [bx + 0.08, by - deep],
      [bx + 0.07, by - 0.1],
      [bx - 0.1, by - 0.1],
    ]);
    ctx.fillStyle = mix(c.ink, c.panel, 0.35);
    ctx.fill();
    const [hx, hy] = toBody(bx, by);
    ctx.beginPath();
    ctx.arc(hx, hy, 0.1 * k, 0, TAU);
    ctx.fillStyle = mix(c.panel, c.ink, 0.35);
    ctx.fill();
    if (i === 0 && Math.sqrt(s.acc2) > 2.6) text(ctx, '!', hx + 0.16 * k, hy - 0.1 * k, { size: f + 2, weight: 700, color: c.bad, align: 'center', baseline: 'middle' });
  });

  // suspension, drawn over wheels and body as if the car were see-through
  for (let i = 0; i < 2; i++) {
    const ax = i === 0 ? A : -B;
    const [wx, wy] = wheelC(i);
    const type = i === 0 ? p.front : p.rear;
    ctx.strokeStyle = mix(c.accent2, c.ink, 0.25);
    ctx.lineWidth = 2;
    if (type === 'solid') {
      // a leaf spring hung from the frame by shackles, clamped to the axle in the middle:
      // the more it is loaded, the more it arches
      const h1 = toBody(ax - 0.55, 0.64);
      const h2 = toBody(ax + 0.55, 0.64);
      const e1 = toBody(ax - 0.55, 0.5);
      const e2 = toBody(ax + 0.55, 0.5);
      const mid: [number, number] = [wx, wy - 0.07 * k];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(h1[0], h1[1]);
      ctx.lineTo(e1[0], e1[1]);
      ctx.moveTo(h2[0], h2[1]);
      ctx.lineTo(e2[0], e2[1]);
      ctx.stroke();
      const leaf = (l: number) => {
        const len = 1 - l * 0.22;
        const dy = l * Math.max(2, 0.035 * k);
        const a1: [number, number] = [mix2(mid[0], e1[0], len), mix2(mid[1], e1[1], len) + dy * 0.5];
        const a2: [number, number] = [mix2(mid[0], e2[0], len), mix2(mid[1], e2[1], len) + dy * 0.5];
        const m2: [number, number] = [mid[0], mid[1] + dy];
        ctx.beginPath();
        ctx.moveTo(a1[0], a1[1]);
        ctx.quadraticCurveTo(2 * m2[0] - (a1[0] + a2[0]) / 2, 2 * m2[1] - (a1[1] + a2[1]) / 2, a2[0], a2[1]);
        ctx.lineWidth = l === 0 ? 2.4 : 1.6;
        ctx.stroke();
      };
      for (let l = 0; l < 4; l++) leaf(l);
      ctx.fillStyle = c.ink;
      ctx.fillRect(mid[0] - 0.06 * k, mid[1] - 2, 0.12 * k, Math.max(4, 0.12 * k));
    } else {
      const top = toBody(ax - 0.12, 0.72);
      spring(ctx, wx - 0.12 * k, wy - 0.06 * k, top[0], top[1], 6, 0.12 * k);
      ctx.stroke();
      // wishbone
      const inner = toBody(ax - 0.45, 0.45);
      ctx.beginPath();
      ctx.moveTo(inner[0], inner[1]);
      ctx.lineTo(wx, wy + 0.05 * k);
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    // damper
    if (p.damper === 'hydraulic') {
      const top = toBody(ax + 0.18, 0.75);
      const bot: [number, number] = [wx + 0.16 * k, wy];
      const ang = Math.atan2(top[1] - bot[1], top[0] - bot[0]);
      const len = Math.hypot(top[0] - bot[0], top[1] - bot[1]);
      ctx.save();
      ctx.translate(bot[0], bot[1]);
      ctx.rotate(ang);
      ctx.fillStyle = mix(c.metal, c.ink, 0.2);
      ctx.fillRect(0, -0.045 * k, len * 0.55, 0.09 * k);
      ctx.fillStyle = c.metal;
      ctx.fillRect(len * 0.5, -0.02 * k, len * 0.5, 0.04 * k);
      ctx.restore();
    } else if (p.damper === 'friction') {
      const pivot = toBody(ax + 0.3, 0.6);
      ctx.beginPath();
      ctx.arc(pivot[0], pivot[1], 0.09 * k, 0, TAU);
      ctx.fillStyle = mix(c.metal, c.ink, 0.2);
      ctx.fill();
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pivot[0], pivot[1]);
      ctx.lineTo(wx + 0.12 * k, wy - 0.05 * k);
      ctx.strokeStyle = mix(c.ink, c.metal, 0.3);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (s.bump[i] > 0) text(ctx, t('Dayandı!'), wx, wy - R * k - 6, { size: f - 1, weight: 700, color: c.bad, align: 'center', baseline: 'bottom', bg: alpha(c.panel, 0.9) });
  }

  // live measures, top left
  const rms = Math.sqrt(s.acc2);
  const cw = comfortWord(rms);
  const loadVar = Math.sqrt(s.load2);
  const grip = loadVar < 0.2 && s.air < 0.01 ? { word: t('Yola yapışık'), tone: 'good' as const } : loadVar < 0.35 && s.air < 0.04 ? { word: t('Tekerler seğiriyor'), tone: 'warn' as const } : { word: t('Tekerler sekiyor'), tone: 'bad' as const };
  let ty = 8;
  const row = (label: string, word: string, t: 'good' | 'warn' | 'bad', detail: string) => {
    const x0 = side.x + 10;
    const lw = text(ctx, `${label}: `, x0, ty, { size: f - 1, color: c.muted, baseline: 'top' });
    const ww = text(ctx, word, x0 + lw, ty, { size: f - 1, weight: 700, color: tone(t), baseline: 'top' });
    text(ctx, ` ${detail}`, x0 + lw + ww, ty, { size: f - 2, color: c.muted, baseline: 'top' });
    ty += f * 1.35;
  };
  row(t('Yolcu'), cw.word, cw.tone, t('({v} m/s² sarsıntı)', { v: fmt(rms, 1) }));
  const tyreLoad = fmtPercent(loadVar, 0);
  row(
    t('Yol tutuş'),
    grip.word,
    grip.tone,
    s.air > 0.005 ? t('(lastik yükü ±{load}, {air} havada)', { load: tyreLoad, air: fmtPercent(s.air, 0) }) : t('(lastik yükü ±{load})', { load: tyreLoad }),
  );
  text(ctx, t('{speed} km/s · dikey hareketler {x} kat büyütüldü', { speed: fmt(v * 3.6), x: EX }), side.x + 10, ty, { size: f - 3, color: c.muted, baseline: 'top' });

  // ---------- front view ----------
  drawFront(ctx, front, c, s, p, v, f, wide);

  // ---------- strip: what the passenger and the front tyre feel ----------
  const half = (strip.h - f * 1.3) / 2;
  const tracePlot = (y: number, title: string, color: string, get: (q: { acc: number; load: number }) => number, lo: number, hi: number, ref: number, badBelow?: number) => {
    const Y = (val: number) => y + half - ((clamp(val, lo, hi) - lo) / (hi - lo)) * (half - 2);
    ctx.strokeStyle = alpha(c.muted, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(strip.x, Y(ref));
    ctx.lineTo(strip.x + strip.w, Y(ref));
    ctx.stroke();
    if (badBelow !== undefined) {
      ctx.fillStyle = alpha(c.bad, 0.12);
      ctx.fillRect(strip.x, Y(badBelow), strip.w, y + half - Y(badBelow));
    }
    const N = TRACE_HZ * TRACE_SECONDS;
    ctx.beginPath();
    s.trace.forEach((q, i) => {
      const px = strip.x + ((i + N - s.trace.length) / N) * strip.w;
      if (i) ctx.lineTo(px, Y(get(q)));
      else ctx.moveTo(px, Y(get(q)));
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, title, strip.x + 4, y + 2, { size: f - 3, color, weight: 600, baseline: 'top', bg: alpha(c.panel, 0.8) });
  };
  text(ctx, t('Son 6 saniye'), strip.x, strip.y, { size: f - 1, weight: 600, color: c.ink, baseline: 'top' });
  tracePlot(strip.y + f * 1.3, t('Yolcunun hissettiği sarsıntı'), c.accent, (q) => q.acc, -8, 8, 0);
  tracePlot(strip.y + f * 1.3 + half, t('Ön lastiğin yola basma kuvveti (kırmızı: havada)'), c.good, (q) => q.load, 0, 2.2, 1, 0.1);
}

function mix2(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function drawFront(ctx: Ctx, box: { x: number; y: number; w: number; h: number }, c: ThemeColors, s: Sim, p: SuspParams, v: number, f: number, wide: boolean) {
  ctx.save();
  if (!wide) {
    roundRect(ctx, box.x, box.y, box.w - 8, box.h, 6);
    ctx.fillStyle = alpha(c.panel, 0.92);
    ctx.fill();
    ctx.strokeStyle = alpha(c.line, 1);
    ctx.stroke();
  }
  text(ctx, t('Önden'), box.x + 8, box.y + 8, { size: f - 1, weight: 700, color: c.ink, baseline: 'top' });
  const k = Math.min((box.w - 20) / 2.3, (box.h - f * 3.4) / 2.05);
  const cx = box.x + box.w / 2 - (wide ? 0 : 4);
  const gy = box.y + box.h - f * 1.6;
  const ax = s.x + A;
  const rL = road(ax, -1);
  const rR = road(ax, 1);
  const rC = (rL + rR) / 2;
  const X = (x: number) => cx + x * k;
  const Y = (y: number) => gy - y * k;
  // ground under each wheel
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(-1.15), Y(rL * EX));
  ctx.lineTo(X(-0.2), Y(rL * EX));
  ctx.moveTo(X(0.2), Y(rR * EX));
  ctx.lineTo(X(1.15), Y(rR * EX));
  ctx.stroke();
  const zl = R + (s.zu[0] + rL - rC) * EX;
  const zr = R + (s.zu[0] + rR - rC) * EX;
  const phi = s.phi * 1.5;
  const heave = (s.z + A * s.th) * EX;
  const rc = 0.5;
  const body = (bx: number, by: number): [number, number] => {
    const dy = by - rc;
    const x = bx * Math.cos(phi) - dy * Math.sin(phi);
    const y = bx * Math.sin(phi) + dy * Math.cos(phi) + rc + heave;
    return [X(x), Y(y)];
  };
  const wheelX = TRACK / 2;
  const camber = p.front === 'solid' ? Math.atan2(zl - zr, TRACK) : phi * 0.35;
  // links
  ctx.strokeStyle = mix(c.ink, c.metal, 0.3);
  ctx.lineWidth = 3;
  if (p.front === 'solid') {
    ctx.beginPath();
    ctx.moveTo(X(-wheelX), Y(zl));
    ctx.lineTo(X(wheelX), Y(zr));
    ctx.stroke();
    ctx.lineWidth = 1.5;
    for (const sx of [-0.45, 0.45]) {
      const t = (sx + wheelX) / TRACK;
      const ay = zl + (zr - zl) * t;
      const top = body(sx, 0.62);
      spring(ctx, X(sx), Y(ay + 0.04), top[0], top[1], 4, 0.12 * k);
      ctx.stroke();
    }
  } else {
    for (const sd of [-1, 1]) {
      const zc = sd < 0 ? zl : zr;
      const lo = body(sd * 0.3, 0.38);
      const up = body(sd * 0.35, 0.68);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(lo[0], lo[1]);
      ctx.lineTo(X(sd * (wheelX - 0.12)), Y(zc - 0.12));
      ctx.moveTo(up[0], up[1]);
      ctx.lineTo(X(sd * (wheelX - 0.12)), Y(zc + 0.16));
      ctx.stroke();
      ctx.lineWidth = 1.5;
      const top = body(sd * 0.42, 0.78);
      spring(ctx, X(sd * (wheelX - 0.3)), Y(zc - 0.08), top[0], top[1], 4, 0.1 * k);
      ctx.stroke();
    }
  }
  if (p.antiRoll) {
    const a1 = body(-0.5, 0.42);
    const a2 = body(0.5, 0.42);
    ctx.strokeStyle = c.accent2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a1[0], a1[1]);
    ctx.lineTo(a2[0], a2[1]);
    ctx.stroke();
  }
  // wheels
  for (const [sd, zc] of [
    [-1, zl],
    [1, zr],
  ] as const) {
    ctx.save();
    ctx.translate(X(sd * wheelX), Y(zc));
    ctx.rotate(-camber);
    ctx.fillStyle = s.load[0] < 0.1 ? alpha(c.bad, 0.85) : mix(c.ink, c.panel, 0.15);
    roundRect(ctx, -0.08 * k, -R * k, 0.16 * k, 2 * R * k, 4);
    ctx.fill();
    ctx.restore();
  }
  // body
  const poly = (pts: Pt[]) => {
    ctx.beginPath();
    pts.forEach(([bx, by], i) => {
      const [px, py] = body(bx, by);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
  };
  const sh = p.shape;
  poly(sh.front);
  ctx.fillStyle = alpha(c.accent, 0.85);
  ctx.fill();
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (sh.frontGlass) {
    poly(sh.frontGlass);
    ctx.fillStyle = alpha(c.panel, 0.7);
    ctx.fill();
    ctx.stroke();
  }
  for (const [hx0, hy0] of sh.frontHeads) {
    const deep = sh.glass.length ? 0.16 : 0.34;
    poly([
      [hx0 - 0.15, hy0 - deep],
      [hx0 + 0.15, hy0 - deep],
      [hx0 + 0.12, hy0 - 0.1],
      [hx0 - 0.12, hy0 - 0.1],
    ]);
    ctx.fillStyle = mix(c.ink, c.panel, 0.35);
    ctx.fill();
    const [hx, hy] = body(hx0, hy0);
    ctx.beginPath();
    ctx.arc(hx, hy, 0.1 * k, 0, TAU);
    ctx.fillStyle = mix(c.panel, c.ink, 0.35);
    ctx.fill();
  }
  for (const sx of [-0.6, 0.6]) {
    const [lx, ly] = body(sx, sh.lampY);
    ctx.beginPath();
    ctx.arc(lx, ly, 0.08 * k, 0, TAU);
    ctx.fillStyle = c.panel;
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.stroke();
  }
  // the bend: sideways push and how far the body leans
  const lat = latG(s.x, v);
  if (lat > 0.03) {
    const [bx, by] = body(0, 1.0);
    const len = (0.3 + lat) * k;
    ctx.strokeStyle = c.bad;
    ctx.fillStyle = c.bad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - len, by);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx - len - 7, by);
    ctx.lineTo(bx - len + 2, by - 5);
    ctx.lineTo(bx - len + 2, by + 5);
    ctx.closePath();
    ctx.fill();
    text(ctx, t('Viraj {v} g', { v: fmt(lat, 2) }), box.x + box.w - 10, box.y + 8, { size: f - 2, weight: 700, color: c.bad, align: 'right', baseline: 'top' });
  }
  const rollDeg = (s.rollPeak * 180) / Math.PI;
  text(ctx, t('Virajda yatma: {v}°', { v: fmt(rollDeg, 1) }), box.x + 8, box.y + box.h - f * 0.3, {
    size: f - 2,
    color: rollDeg > 5 ? c.bad : rollDeg > 3 ? c.warn : c.muted,
    weight: 600,
    baseline: 'bottom',
  });
  if (p.antiRoll && wide) text(ctx, t('Viraj demiri'), box.x + box.w - 10, box.y + box.h - f * 0.3, { size: f - 3, color: c.accent2, align: 'right', baseline: 'bottom' });
  ctx.restore();
}

const DAMPER_NAMES: Record<Damper, string> = {
  none: msg('Yok: yalnız yaprak sürtünmesi'),
  friction: msg('Sürtünmeli'),
  hydraulic: msg('Hidrolik'),
};

function eraSpeed(year: number) {
  return Math.round(clamp(25 + (year - 1900) * 0.9, 25, 80) / 5) * 5;
}

export function SuspensionSim(props: SuspensionSimProps) {
  const [kmh, setKmh] = useState(() => eraSpeed(props.year));
  const sim = useRef<Sim>(newSim());
  const p = suspParams(props);
  const v = kmh / 3.6;
  const ref = useCanvasAnimation(
    (ctx, _t, w, h, c, dt) => {
      if (dt > 0) step(sim.current, p, v, Math.min(dt, 0.05));
      drawSim(ctx, w, h, c, sim.current, p, v);
    },
    [props.suspension, props.balance, (props.knowhow ?? []).join(','), kmh],
    { aspect: (w) => (w >= 620 ? 2.3 : w / 360), minHeight: 300, maxHeight: 420 },
  );
  const layout = p.front === p.rear ? (p.front === 'solid' ? t('Önde ve arkada sabit aks') : t('Dört teker bağımsız')) : t('Önde bağımsız, arkada sabit aks');
  const damper = t(DAMPER_NAMES[p.damper]);
  const tyre = t(p.tyre);
  return (
    <AnimFrame
      name="suspensionSim"
      canvasRef={ref}
      label={t('Süspansiyon deneme yolu: {layout}, {damper} amortisör, {tyre} lastik, {speed} km/s.', { layout, damper, tyre, speed: kmh })}
      readouts={
        <>
          <Readout label={t('Düzen')} value={layout} />
          <Readout label={t('Gövde salınımı')} value={t('{v} Hz', { v: fmt(p.fn, 1) })} />
          <Readout label={t('Amortisör')} value={damper} />
          <Readout label={t('Lastik')} value={tyre} />
          <Readout label={t('Yaysız kütle (ön)')} value={t('{v} kg', { v: p.mu[0] })} />
        </>
      }
      controls={<Slider label={t('Hız')} value={kmh} min={10} max={100} step={5} onChange={setKmh} format={(x) => t('{v} km/s', { v: x })} />}
    />
  );
}
