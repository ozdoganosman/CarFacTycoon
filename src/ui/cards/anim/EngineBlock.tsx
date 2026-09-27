import { useMemo, useRef, useState } from 'react';
import { CYLINDER_OPTIONS } from '../../../data/tech';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Readout, Slider } from './controls';
import { TAU, alpha, clamp, fmt, fs, hatchRect, mix, mod, paperGrid, rad, roundRect, text, type Ctx } from './draw';
import { paragraph } from './text';

// The whole engine at work: every cylinder with its own piston, rod and crank
// throw, firing in the engine's real order. Below it, the torque the crankshaft
// feels over one working cycle (two turns): a single cylinder kicks once and then
// has to be dragged through three strokes by the flywheel; six or more overlap
// into a smooth push. The block itself shakes as much as its pistons leave
// unbalanced.

export interface EngineBlockProps {
  cylinders: number;
  layout: 'inline' | 'v';
  /** Bore and stroke in mm: the drawing keeps their proportion. */
  bore: number;
  stroke: number;
  diesel?: boolean;
}

const ROD_RATIO = 1.75;
const LAMBDA = 1 / (2 * ROD_RATIO); // crank radius / rod length: size of the second-order shake

/** Firing orders of the period's engines; firings are evenly spaced over the 720° cycle. */
const ORDERS: Record<string, number[]> = {
  '1inline': [1],
  '2inline': [1, 2],
  '3inline': [1, 3, 2],
  '4inline': [1, 3, 4, 2],
  '6inline': [1, 5, 3, 6, 2, 4],
  '8inline': [1, 6, 2, 5, 8, 3, 7, 4],
  '6v': [1, 2, 3, 4, 5, 6],
  '8v': [1, 8, 4, 3, 6, 5, 7, 2],
  '12v': [1, 7, 5, 11, 3, 9, 6, 12, 2, 8, 4, 10],
  '16v': [1, 9, 6, 14, 2, 10, 5, 13, 8, 16, 3, 11, 7, 15, 4, 12],
};

/** Angle between the two banks of a V engine (degrees). */
const V_ANGLE: Record<number, number> = { 6: 60, 8: 90, 12: 60, 16: 45 };

const IN_OPEN = -10;
const IN_CLOSE = 215;
const EX_OPEN = 505;
const EX_CLOSE = 730;

interface Cyl {
  n: number;
  /** Global crank angle (0..720) at which this cylinder fires. */
  fire: number;
  /** Bore axis, radians clockwise from straight up. */
  axis: number;
  /** Crank throw it sits on, counted from the front. */
  cell: number;
}

export interface EngineConfig {
  vee: boolean;
  order: number[];
  cyls: Cyl[];
  cells: number;
  vAngle: number;
  step: number;
}

export function engineConfig(n: number, layout: 'inline' | 'v'): EngineConfig {
  const vee = layout === 'v' && n >= 6;
  const order = ORDERS[`${n}${vee ? 'v' : 'inline'}`] ?? Array.from({ length: n }, (_, i) => i + 1);
  const step = 720 / n;
  const F = (c: number) => order.indexOf(c) * step;
  const vAngle = vee ? (V_ANGLE[n] ?? 90) : 0;
  const cyls: Cyl[] = [];
  if (!vee) for (let i = 1; i <= n; i++) cyls.push({ n: i, fire: F(i), axis: 0, cell: i - 1 });
  else {
    const half = n / 2;
    for (let j = 0; j < half; j++) {
      const [a, b] = n >= 12 ? [j + 1, j + 1 + half] : [2 * j + 1, 2 * j + 2];
      // Put each cylinder on the side where the two share one crank pin (a split pin otherwise).
      const flip = Math.abs(mod(F(b) - F(a), 360) - (360 - vAngle)) < 1;
      const s = flip ? 1 : -1;
      cyls.push({ n: a, fire: F(a), axis: rad((s * vAngle) / 2), cell: j });
      cyls.push({ n: b, fire: F(b), axis: rad((-s * vAngle) / 2), cell: j });
    }
  }
  return { vee, order, cyls, cells: vee ? n / 2 : n, vAngle, step };
}

/** Where a cylinder is in its own four strokes: 0 = top of intake, 360 = firing. */
const cycleOf = (th: number, c: Cyl) => mod(th - c.fire + 360, 720);

/** Torque one cylinder puts on the crank, in arbitrary units, at cycle angle l. */
function cylTorque(l: number, diesel: boolean): number {
  if (l >= 360 && l < 540) {
    const x = (l - 360) / 180;
    return Math.sin(Math.PI * x) * Math.exp(-(diesel ? 2.8 : 2.2) * x);
  }
  if (l >= 180 && l < 360) {
    // squeezing the charge drags the crank back, most of all just before the top
    const y = (l - 180) / 180;
    return -(diesel ? 0.8 : 0.55) * Math.sin(Math.PI * y) * y * y;
  }
  return -0.03; // pumping gas in and out
}

export interface TorqueTrace {
  step: number;
  total: number[];
  per: number[][];
  mean: number;
  max: number;
  min: number;
  /** Half the peak-to-peak swing as a share of the mean torque. */
  ripple: number;
}

export function torqueTrace(cfg: EngineConfig, diesel: boolean): TorqueTrace {
  const step = 3;
  const total: number[] = [];
  const per: number[][] = cfg.cyls.map(() => []);
  for (let x = 0; x <= 720; x += step) {
    let s = 0;
    cfg.cyls.forEach((c, i) => {
      const v = cylTorque(cycleOf(x, c), diesel);
      per[i].push(v);
      s += v;
    });
    total.push(s);
  }
  const mean = total.slice(0, -1).reduce((a, b) => a + b, 0) / (total.length - 1);
  const max = Math.max(...total);
  const min = Math.min(...total);
  return { step, total, per, mean, max, min, ripple: (max - min) / (2 * mean) };
}

export interface Balance {
  label: string;
  tone: 'good' | 'warn' | 'bad';
  note: string;
}

export function balanceOf(n: number, layout: 'inline' | 'v'): Balance {
  const vee = layout === 'v' && n >= 6;
  if (n === 1) return { label: 'Çok sarsıntılı', tone: 'bad', note: 'Pistonu dengeleyen başka piston yok: motor her turda zıplar.' };
  if (n === 2) return { label: 'Çok sarsıntılı', tone: 'bad', note: 'İki piston birlikte inip çıkar: tek silindir gibi zıplar.' };
  if (n === 3) return { label: 'Yalpalıyor', tone: 'warn', note: 'Uçtaki pistonlar motoru bir öne bir arkaya yatırır.' };
  if (n === 4) return { label: 'Hafif titrek', tone: 'warn', note: 'Pistonlar karşılıklı çalışır ama yüksek devirde vızıldar.' };
  if (vee && n === 6) return { label: 'Az yalpalı', tone: 'warn', note: '60° V6’da küçük bir yalpa kalır.' };
  if (vee && n === 8) return { label: 'Dengeli', tone: 'good', note: 'Çapraz krank ve karşı ağırlıklar sarsıntıyı söndürür.' };
  return { label: 'Kusursuz dengeli', tone: 'good', note: 'Pistonların kuvvetleri birbirini tamamen götürür.' };
}

/** How far the block is thrown about by its pistons at crank angle th (px and rad). */
function shakeAt(cfg: EngineConfig, th: number): { x: number; y: number; rot: number } {
  const n = cfg.cyls.length;
  if (cfg.vee) return { x: 0, y: 0, rot: n === 6 ? 0.008 * Math.sin(rad(th)) : 0 };
  let fx = 0;
  let fy = 0;
  let m = 0;
  const mid = (cfg.cells - 1) / 2;
  for (const c of cfg.cyls) {
    const a = rad(cycleOf(th, c));
    const f = Math.cos(a) + LAMBDA * Math.cos(2 * a);
    fy += f;
    m += (c.cell - mid) * f;
    if (n <= 2) {
      // the crank's counterweight trades half the up-and-down kick for a sideways one
      fy -= 0.5 * Math.cos(a);
      fx += 0.5 * Math.sin(a);
    }
  }
  return { x: (4 * fx) / n, y: (-4 * fy) / n, rot: (0.035 * m) / n };
}

function valveLift(th: number, open: number, close: number): number {
  const half = (close - open) / 2;
  const d = mod(th - (open + close) / 2 + 360, 720) - 360;
  if (Math.abs(d) >= half) return 0;
  const c = Math.cos((Math.PI / 2) * (d / half));
  return c * c;
}

function strokeColors(c: ThemeColors) {
  return [c.accent2, mix(c.accent2, c.ink, 0.35), c.fire, c.muted];
}

function gasOf(l: number, c: ThemeColors): { color: string; a: number } {
  if (l < 180) return { color: c.accent2, a: 0.22 };
  if (l < 360) return { color: mix(c.accent2, c.ink, 0.3), a: 0.22 + 0.25 * ((l - 180) / 180) };
  if (l < 540) {
    const k = (l - 360) / 180;
    return { color: mix(c.fire, c.muted, clamp(k * 1.3, 0, 1)), a: 0.3 + 0.5 * Math.exp(-k * 5) };
  }
  return { color: c.muted, a: 0.2 };
}

/** Cylinder geometry in bore units (bore = 1). */
interface Geo {
  S: number;
  r: number;
  L: number;
  ph: number;
  p2c: number;
  clr: number;
  wt: number;
  hh: number;
  hf: number;
  top: number;
  liner: number;
  Rw: number;
  halfW: number;
}

function geometry(strokeToBore: number, diesel: boolean): Geo {
  const S = clamp(strokeToBore, 0.55, 1.7);
  const r = S / 2;
  const L = ROD_RATIO * S;
  const ph = 0.6;
  const p2c = 0.3;
  const clr = S / ((diesel ? 11 : 5.5) - 1);
  const wt = 0.14;
  const hh = 0.34;
  const hf = r + L + p2c + clr;
  return { S, r, L, ph, p2c, clr, wt, hh, hf, top: hf + hh + 0.1, liner: -r + L + p2c - ph * 0.85, Rw: r + 0.14, halfW: 0.5 + wt };
}

const pinHeight = (g: Geo, a: number) => {
  const s = g.r * Math.sin(a);
  return g.r * Math.cos(a) + Math.sqrt(g.L * g.L - s * s);
};

/** Bounding box of one crank throw's cylinders (x right, y up, bore units). */
function cellBox(g: Geo, axes: number[], extraTop = 0) {
  let minX = -g.Rw;
  let maxX = g.Rw;
  let minY = -g.Rw;
  let maxY = g.Rw;
  for (const p of axes) {
    for (const [u, v] of [
      [-g.halfW, g.top + extraTop],
      [g.halfW, g.top + extraTop],
      [-g.halfW, g.liner],
      [g.halfW, g.liner],
    ]) {
      const x = u * Math.cos(p) + v * Math.sin(p);
      const y = -u * Math.sin(p) + v * Math.cos(p);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, maxX, minY, maxY };
}

interface DrawArgs {
  th: number;
  cfg: EngineConfig;
  trace: TorqueTrace;
  g: Geo;
  diesel: boolean;
  title: string;
  balance: Balance;
}

function drawEngine(ctx: Ctx, w: number, h: number, c: ThemeColors, a: DrawArgs) {
  const { th, cfg, trace, g, diesel } = a;
  const f = fs(w);
  const sc = strokeColors(c);
  const n = cfg.cyls.length;
  paperGrid(ctx, w, h, c);

  const wide = w >= 560;
  // short engines get a side panel; long ones and Vs need the full width
  const sidePanel = wide && !cfg.vee && n <= 6;
  const stripH = clamp(h * 0.25, 62, 96);
  const strip = { x: 10, y: h - stripH - 6, w: w - 20, h: stripH };
  const infoW = sidePanel ? clamp(w * 0.3, 210, 290) : 0;
  const chipsPerRow = sidePanel ? 8 : n;
  const chip = sidePanel ? clamp((infoW - 24) / Math.min(n, 8) - 4, 16, 26) : clamp(((wide ? w * 0.5 : w) - 24) / n - 4, 13, 22);
  const topH = sidePanel ? 0 : f * 1.5 + chip + 14;
  const eng = { x: 6, y: 4 + topH, w: w - infoW - 12, h: strip.y - 8 - (4 + topH) };
  const current = cfg.cyls.find((cy) => cycleOf(th, cy) >= 360 && cycleOf(th, cy) < 360 + cfg.step);

  // ----- engine drawing -----
  const axes = cfg.vee ? [cfg.cyls[0].axis, cfg.cyls[1].axis] : [0];
  const gap = 0.16;
  const flyU = 0.75; // room for the flywheel at the back
  const padT = f * 0.4;
  const padB = f * 1.4;
  // the numbers above the heads need room too, which depends on the scale: settle it in a few passes
  const fit = (extra: number) => {
    const bx = cellBox(g, axes, extra);
    const cw = bx.maxX - bx.minX;
    const tw = cfg.cells * cw + (cfg.cells - 1) * gap + flyU;
    return { box: bx, cellW: cw, totalW: tw, k: Math.min((eng.w - 16) / tw, (eng.h - padT - padB) / (bx.maxY - bx.minY), 120) };
  };
  const labelPx = f * 1.5;
  let lay = fit(0.6);
  lay = fit(labelPx / lay.k);
  lay = fit(labelPx / lay.k);
  const { box, cellW, totalW, k } = lay;
  const contentH = (box.maxY - box.minY) * k;
  const y0 = eng.y + padT + (eng.h - padT - padB - contentH) / 2;
  const cy = y0 + box.maxY * k;
  const x0 = eng.x + 8 + (eng.w - 16 - totalW * k) / 2;
  const cx = (j: number) => x0 + (j * (cellW + gap) - box.minX) * k;
  const lw = clamp(k * 0.02, 1, 1.6);
  const metalLight = mix(c.metal, c.panel, 0.45);
  const metalMid = mix(c.metal, c.panel, 0.15);
  const hatch = alpha(c.muted, 0.4);

  const sh = shakeAt(cfg, th);
  const midX = (cx(0) + cx(cfg.cells - 1)) / 2;
  ctx.save();
  ctx.translate(midX + sh.x, cy + sh.y);
  ctx.rotate(sh.rot);
  ctx.translate(-midX, -cy);

  // crankshaft running through every throw, flywheel at the back
  const shaftEnd = cx(cfg.cells - 1) + (-box.minX + gap + flyU * 0.55) * k;
  ctx.fillStyle = metalMid;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1;
  const shaftH = Math.max(3, 0.12 * k);
  ctx.fillRect(cx(0) - g.Rw * k * 0.6, cy - shaftH / 2, shaftEnd - cx(0) + g.Rw * k * 0.6, shaftH);
  ctx.strokeRect(cx(0) - g.Rw * k * 0.6, cy - shaftH / 2, shaftEnd - cx(0) + g.Rw * k * 0.6, shaftH);
  {
    const fr = (g.Rw + 0.35) * k;
    const fwd = Math.max(6, 0.22 * k);
    const fx = shaftEnd - fwd / 2;
    ctx.fillStyle = mix(c.metal, c.ink, 0.15);
    roundRect(ctx, fx, cy - fr, fwd, fr * 2, 2);
    ctx.fill();
    ctx.stroke();
    // marks on the rim sliding past: the flywheel turning edge-on
    ctx.strokeStyle = alpha(c.panel, 0.8);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const ang = rad(th) + (i * TAU) / 6;
      if (Math.cos(ang) < 0) continue;
      const yy = cy - Math.sin(ang) * fr * 0.92;
      ctx.moveTo(fx + 1, yy);
      ctx.lineTo(fx + fwd - 1, yy);
    }
    ctx.stroke();
    // label above the wheel: below it would run into the torque strip's heading
    text(ctx, 'Volan', Math.min(fx + fwd / 2, w - 20), cy - fr - 3, { size: f - 2, color: c.muted, align: 'center', baseline: 'bottom' });
  }

  const labels: { x: number; y: number; cyl: Cyl; l: number }[] = [];
  for (let j = 0; j < cfg.cells; j++) {
    const X0 = cx(j);
    const mine = cfg.cyls.filter((cyl) => cyl.cell === j);
    const pins: number[] = [];
    // --- cylinders: walls, gas, piston, head ---
    for (const cyl of mine) {
      const l = cycleOf(th, cyl);
      const crankA = rad(mod(l, 360));
      const d = pinHeight(g, crankA);
      const crown = d + g.p2c;
      const pinAng = cyl.axis + crankA;
      if (!pins.some((p) => Math.abs(Math.atan2(Math.sin(p - pinAng), Math.cos(p - pinAng))) < 0.02)) pins.push(pinAng);
      ctx.save();
      ctx.translate(X0, cy);
      ctx.rotate(cyl.axis);
      const U = (u: number) => u * k;
      const V = (v: number) => -v * k;
      // walls
      for (const side of [-1, 1]) {
        const ux = side < 0 ? -0.5 - g.wt : 0.5;
        ctx.fillStyle = alpha(c.line, 0.35);
        ctx.fillRect(U(ux), V(g.hf), g.wt * k, (g.hf - g.liner) * k);
        hatchRect(ctx, U(ux), V(g.hf), g.wt * k, (g.hf - g.liner) * k, hatch, 5);
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = lw;
        ctx.strokeRect(U(ux), V(g.hf), g.wt * k, (g.hf - g.liner) * k);
      }
      // gas
      const gs = gasOf(l, c);
      ctx.fillStyle = alpha(gs.color, gs.a);
      ctx.fillRect(U(-0.5), V(g.hf), k, (g.hf - crown) * k);
      // piston with rings
      ctx.fillStyle = metalLight;
      ctx.fillRect(U(-0.485), V(crown), 0.97 * k, g.ph * k);
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = lw;
      ctx.strokeRect(U(-0.485), V(crown), 0.97 * k, g.ph * k);
      if (k > 26) {
        ctx.beginPath();
        for (const dd of [0.07, 0.13]) {
          ctx.moveTo(U(-0.485), V(crown - dd));
          ctx.lineTo(U(0.485), V(crown - dd));
        }
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // head
      const hx = -0.5 - g.wt;
      ctx.fillStyle = alpha(c.line, 0.45);
      ctx.fillRect(U(hx), V(g.hf + g.hh), (1 + 2 * g.wt) * k, g.hh * k);
      hatchRect(ctx, U(hx), V(g.hf + g.hh), (1 + 2 * g.wt) * k, g.hh * k, hatch, 5);
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = lw;
      ctx.strokeRect(U(hx), V(g.hf + g.hh), (1 + 2 * g.wt) * k, g.hh * k);
      // valves dip into the chamber while open
      for (const [ux, open, close, col] of [
        [-0.26, IN_OPEN, IN_CLOSE, c.accent2],
        [0.26, EX_OPEN, EX_CLOSE, c.muted],
      ] as const) {
        const lift = valveLift(l, open, close) * 0.12;
        const yb = g.hf - lift;
        ctx.fillStyle = lift > 0.005 ? col : metalMid;
        ctx.fillRect(U(ux - 0.14), V(yb + 0.04), 0.28 * k, Math.max(1.5, 0.04 * k));
        ctx.fillStyle = metalMid;
        ctx.fillRect(U(ux - 0.02), V(g.hf + g.hh * 0.9 - lift), Math.max(1, 0.04 * k), (g.hh * 0.9 - 0.04) * k);
      }
      // spark plug or injector, and the moment of ignition
      ctx.fillStyle = c.ink;
      ctx.fillRect(U(-0.04), V(g.top), Math.max(1.5, 0.08 * k), (g.top - g.hf) * k);
      const sinceFire = l - 352;
      if (sinceFire >= 0 && sinceFire < (diesel ? 40 : 22)) {
        const q = sinceFire / (diesel ? 40 : 22);
        const sy = V(g.hf - 0.05);
        if (diesel) {
          ctx.fillStyle = alpha(c.fire, 0.75 * (1 - q));
          ctx.beginPath();
          ctx.moveTo(0, V(g.hf));
          ctx.lineTo(U(-0.3), V(g.hf - 0.12 - g.clr * 0.8));
          ctx.lineTo(U(0.3), V(g.hf - 0.12 - g.clr * 0.8));
          ctx.closePath();
          ctx.fill();
        } else {
          const rr = 0.35 * k;
          const glow = ctx.createRadialGradient(0, sy, 0, 0, sy, rr);
          glow.addColorStop(0, alpha(c.fire, 0.95 * (1 - q)));
          glow.addColorStop(1, alpha(c.fire, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(0, sy, rr, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
      // number above the head, kept upright
      const lv = g.top + (labelPx * 0.55) / k;
      labels.push({ x: X0 + Math.sin(cyl.axis) * lv * k, y: cy - Math.cos(cyl.axis) * lv * k, cyl, l });
    }

    // --- crank: counterweights and webs ---
    const sx = (p: number, rr: number) => X0 + Math.sin(p) * rr * k;
    const sy = (p: number, rr: number) => cy - Math.cos(p) * rr * k;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = lw;
    for (const p of pins) {
      // screen angle of the pin (canvas: 0 = right, clockwise)
      const sa = p - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(X0, cy, Math.min(g.r + 0.07, (cellW + gap) / 2 - 0.08) * k, sa + Math.PI / 2 + 0.35, sa + (3 * Math.PI) / 2 - 0.35);
      ctx.closePath();
      ctx.fillStyle = mix(c.metal, c.panel, 0.35);
      ctx.fill();
      ctx.stroke();
      const webW = 0.16 * k;
      ctx.save();
      ctx.translate(X0, cy);
      ctx.rotate(sa);
      ctx.beginPath();
      ctx.arc(0, 0, webW, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.arc(g.r * k, 0, webW, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = c.metal;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // --- rods ---
    for (const cyl of mine) {
      const l = cycleOf(th, cyl);
      const crankA = rad(mod(l, 360));
      const d = pinHeight(g, crankA);
      const p = cyl.axis + crankA;
      const px = sx(p, g.r);
      const py = sy(p, g.r);
      const qx = X0 + Math.sin(cyl.axis) * d * k;
      const qy = cy - Math.cos(cyl.axis) * d * k;
      const ang = Math.atan2(qy - py, qx - px);
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const wb = 0.1 * k;
      const ws = 0.06 * k;
      ctx.beginPath();
      ctx.moveTo(px + nx * wb, py + ny * wb);
      ctx.lineTo(qx + nx * ws, qy + ny * ws);
      ctx.lineTo(qx - nx * ws, qy - ny * ws);
      ctx.lineTo(px - nx * wb, py - ny * wb);
      ctx.closePath();
      ctx.fillStyle = metalMid;
      ctx.fill();
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(qx, qy, 0.07 * k, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    for (const p of pins) {
      ctx.beginPath();
      ctx.arc(sx(p, g.r), sy(p, g.r), 0.11 * k, 0, TAU);
      ctx.fillStyle = metalMid;
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(X0, cy, 0.08 * k, 0, TAU);
    ctx.fillStyle = c.panel;
    ctx.fill();
    ctx.stroke();
  }

  // the shake, drawn as little motion marks beside the block
  const amp = Math.hypot(sh.x, sh.y) + Math.abs(sh.rot) * cellW * k * cfg.cells * 0.5;
  if (amp > 0.8) {
    ctx.strokeStyle = alpha(a.balance.tone === 'bad' ? c.bad : c.warn, clamp(amp / 3, 0.2, 0.8));
    ctx.lineWidth = 1.5;
    const lx = cx(0) + box.minX * k - 6;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const yy = cy - (box.maxY * k * (0.2 + i * 0.25));
      ctx.moveTo(lx, yy - 5);
      ctx.quadraticCurveTo(lx - 5, yy, lx, yy + 5);
    }
    ctx.stroke();
  }
  ctx.restore();

  for (const lb of labels) {
    const firing = lb.l >= 360 && lb.l < 540;
    const rr = Math.max(7, f * 0.62);
    ctx.beginPath();
    ctx.arc(lb.x, lb.y, rr, 0, TAU);
    ctx.fillStyle = firing ? c.fire : c.panel;
    ctx.fill();
    ctx.strokeStyle = firing ? c.fire : c.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, String(lb.cyl.n), lb.x, lb.y + 0.5, { size: f - 2, weight: 700, color: firing ? c.panel : c.ink, align: 'center', baseline: 'middle' });
  }

  // stroke legend under the engine
  {
    let lx = eng.x + 10;
    const ly = eng.y + eng.h - f * 0.6;
    ['Emme', 'Sıkıştırma', 'İş', 'Egzoz'].forEach((name, i) => {
      ctx.fillStyle = alpha(sc[i], i === 2 ? 0.8 : 0.5);
      ctx.fillRect(lx, ly - 5, 10, 10);
      lx += 14 + text(ctx, name, lx + 14, ly, { size: f - 2, color: c.muted, baseline: 'middle' }) + 10;
    });
  }

  // ----- info: title, firing order, crank star, balance -----
  const drawChips = (x: number, y: number, size: number, perRow: number) => {
    cfg.order.forEach((num, i) => {
      const cx0 = x + (i % perRow) * (size + 4);
      const cy0 = y + Math.floor(i / perRow) * (size + 4);
      const on = current?.n === num;
      const next = cfg.order[(cfg.order.indexOf(current?.n ?? 0) + 1) % n] === num && n > 1;
      roundRect(ctx, cx0, cy0, size, size, 4);
      ctx.fillStyle = on ? c.fire : c.panel;
      ctx.fill();
      ctx.strokeStyle = on ? c.fire : next ? c.ink : alpha(c.muted, 0.7);
      ctx.lineWidth = next ? 1.5 : 1;
      ctx.stroke();
      text(ctx, String(num), cx0 + size / 2, cy0 + size / 2 + 0.5, { size: Math.max(11, size * 0.55), weight: 700, color: on ? c.panel : c.ink, align: 'center', baseline: 'middle' });
    });
    return y + Math.ceil(n / perRow) * (size + 4);
  };
  const drawChipsRow = (y: number) => {
    drawChips(10, y, chip, n);
    return 10 + n * (chip + 4);
  };

  const toneColor = a.balance.tone === 'good' ? c.good : a.balance.tone === 'warn' ? c.warn : c.bad;
  // crank throws seen from the end of the shaft, turning; cylinders sharing a throw are listed together
  const drawStar = (scx: number, scy: number, R: number, labels: boolean) => {
    ctx.strokeStyle = alpha(c.muted, 0.6);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(scx, scy, R, 0, TAU);
    ctx.stroke();
    if (cfg.vee) {
      for (const ax of axes) {
        ctx.beginPath();
        ctx.moveTo(scx, scy);
        ctx.lineTo(scx + Math.sin(ax) * R * 1.3, scy - Math.cos(ax) * R * 1.3);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    const groups: { ang: number; nums: number[] }[] = [];
    for (const cyl of cfg.cyls) {
      const p = cyl.axis + rad(mod(cycleOf(th, cyl), 360));
      const gr = groups.find((q) => Math.abs(Math.atan2(Math.sin(q.ang - p), Math.cos(q.ang - p))) < 0.05);
      if (gr) gr.nums.push(cyl.n);
      else groups.push({ ang: p, nums: [cyl.n] });
    }
    for (const gr of groups) {
      const hot = gr.nums.includes(current?.n ?? -1);
      ctx.strokeStyle = hot ? c.fire : c.ink;
      ctx.lineWidth = hot ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(scx, scy);
      ctx.lineTo(scx + Math.sin(gr.ang) * R * 0.8, scy - Math.cos(gr.ang) * R * 0.8);
      ctx.stroke();
      if (labels && groups.length <= 4) {
        text(ctx, gr.nums.join('·'), scx + Math.sin(gr.ang) * (R + f * 0.55), scy - Math.cos(gr.ang) * (R + f * 0.55), {
          size: f - 3,
          weight: 600,
          color: hot ? c.fire : c.muted,
          align: 'center',
          baseline: 'middle',
        });
      }
    }
    ctx.beginPath();
    ctx.arc(scx, scy, 2.5, 0, TAU);
    ctx.fillStyle = c.ink;
    ctx.fill();
  };
  const everyText = n === 1 ? 'İki turda tek ateşleme: krank üç zaman boyunca volanla döner.' : `Her ${fmt(cfg.step)}°’de bir ateşleme; turda ${fmt(n / 2, n % 2 ? 1 : 0)}.`;

  if (sidePanel) {
    const ix = w - infoW - 4;
    let y = 10;
    text(ctx, a.title, ix, y, { size: f + 3, weight: 700, color: c.ink, baseline: 'top', maxWidth: infoW - 8 });
    y += (f + 3) * 1.5;
    text(ctx, 'Ateşleme sırası', ix, y, { size: f - 1, color: c.muted, baseline: 'top' });
    y += f * 1.4;
    y = drawChips(ix, y, chip, chipsPerRow) + 2;
    y = paragraph(ctx, everyText, ix, y, infoW - 8, { size: f - 1, color: c.ink, maxLines: 2 }) + f * 0.5;
    text(ctx, a.balance.label, ix, y, { size: f, weight: 700, color: toneColor, baseline: 'top', maxWidth: infoW - 8 });
    y = paragraph(ctx, a.balance.note, ix, y + f * 1.4, infoW - 8, { size: f - 2, color: c.ink, maxLines: 2 });
    const R = Math.min(34, (strip.y - 10 - y) / 2 - f * 0.7);
    if (R >= 14) {
      const scy = y + f * 0.7 + R;
      drawStar(ix + R + f * 0.8, scy, R, true);
      paragraph(ctx, 'Krank, milin ucundan bakınca: aynı yöndeki kollar birlikte iner çıkar.', ix + 2 * R + f * 2.2, scy - f * 1.2, infoW - 2 * R - f * 2.6, { size: f - 3, color: c.muted, maxLines: 3 });
    }
  } else {
    text(ctx, `${a.title}${wide ? '' : ` · ${a.balance.label}`}`, 10, 8, { size: f + 1, weight: 700, color: c.ink, baseline: 'top', maxWidth: wide ? w * 0.5 : w - 20 });
    const rowY = 8 + f * 1.5;
    const endX = drawChipsRow(rowY);
    if (wide) {
      if (w * 0.53 - endX > 90) text(ctx, everyText, endX + 8, rowY + chip / 2, { size: f - 2, color: c.muted, baseline: 'middle', maxWidth: w * 0.53 - endX - 8 });
      const R = clamp((topH - 14) / 2, 14, 24);
      const scx = w - 12 - R - f * 0.4;
      const scy = 6 + topH / 2;
      drawStar(scx, scy, R, false);
      const bx = w * 0.55;
      const bw = scx - R - f * 1.2 - bx;
      text(ctx, a.balance.label, bx, 8, { size: f, weight: 700, color: toneColor, baseline: 'top', maxWidth: bw });
      paragraph(ctx, a.balance.note, bx, 8 + f * 1.45, bw, { size: f - 2, color: c.ink, maxLines: 2 });
    }
  }

  // ----- torque strip -----
  const headY = strip.y;
  text(ctx, 'Krank milindeki anlık tork · iki tur (720°)', strip.x, headY, { size: f - 1, weight: 600, color: c.ink, baseline: 'top' });
  const peak = trace.max / trace.mean;
  text(ctx, `Tepe: ortalamanın ${fmt(peak, 1)} katı${trace.min < 0 ? ' · arada krankı geri çeker' : ''}`, strip.x + strip.w, headY, {
    size: f - 2,
    color: trace.min < 0 ? c.bad : c.muted,
    align: 'right',
    baseline: 'top',
  });
  const px = strip.x;
  const py = strip.y + f * 1.35;
  const pw = strip.w;
  const ph = strip.h - f * 1.35;
  const lo = Math.min(0, trace.min) * 1.08;
  const hi = Math.max(trace.max, ...trace.per.map((q) => Math.max(...q))) * 1.08;
  const Yt = (v: number) => py + ph - ((v - lo) / (hi - lo)) * ph;
  const Xt = (deg: number) => px + (deg / 720) * pw;
  ctx.fillStyle = alpha(c.line, 0.35);
  ctx.fillRect(Xt(360), py, pw / 2, ph);
  text(ctx, '1. tur', Xt(6), py + 3, { size: f - 3, color: c.muted, baseline: 'top' });
  text(ctx, '2. tur', Xt(366), py + 3, { size: f - 3, color: c.muted, baseline: 'top' });
  // each cylinder's own push
  const last = trace.total.length - 1;
  trace.per.forEach((pts) => {
    ctx.beginPath();
    let on = false;
    pts.forEach((v, i) => {
      if (v > 0.01) {
        if (!on) ctx.moveTo(Xt(i * trace.step), Yt(0));
        ctx.lineTo(Xt(i * trace.step), Yt(v));
        on = true;
      } else if (on) {
        ctx.lineTo(Xt(i * trace.step), Yt(0));
        on = false;
      }
    });
    ctx.strokeStyle = alpha(c.fire, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  // the sum the crank actually feels
  ctx.beginPath();
  ctx.moveTo(Xt(0), Yt(0));
  trace.total.forEach((v, i) => ctx.lineTo(Xt(i * trace.step), Yt(v)));
  ctx.lineTo(Xt(last * trace.step), Yt(0));
  ctx.closePath();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = alpha(c.fire, 0.28);
  ctx.fillRect(px, py, pw, Yt(0) - py);
  ctx.fillStyle = alpha(c.bad, 0.35);
  ctx.fillRect(px, Yt(0), pw, py + ph - Yt(0));
  ctx.restore();
  ctx.beginPath();
  trace.total.forEach((v, i) => (i ? ctx.lineTo(Xt(i * trace.step), Yt(v)) : ctx.moveTo(Xt(0), Yt(v))));
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = alpha(c.muted, 0.8);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, Yt(0));
  ctx.lineTo(px + pw, Yt(0));
  ctx.stroke();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = c.accent;
  ctx.beginPath();
  ctx.moveTo(px, Yt(trace.mean));
  ctx.lineTo(px + pw, Yt(trace.mean));
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, 'ortalama', px + pw - 2, Yt(trace.mean) - 2, { size: f - 3, color: c.accent, align: 'right', baseline: 'bottom' });
  // cursor
  const ci = Math.round(mod(th, 720) / trace.step);
  const cxp = Xt(ci * trace.step);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cxp, py);
  ctx.lineTo(cxp, py + ph);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cxp, Yt(trace.total[ci]), 3.5, 0, TAU);
  ctx.fillStyle = c.ink;
  ctx.fill();
}

export function EngineBlock({ cylinders, layout, bore, stroke, diesel = false }: EngineBlockProps) {
  const [speed, setSpeed] = useState(0.35);
  const theta = useRef(0);
  const cfg = useMemo(() => engineConfig(cylinders, layout), [cylinders, layout]);
  const trace = useMemo(() => torqueTrace(cfg, diesel), [cfg, diesel]);
  const balance = useMemo(() => balanceOf(cylinders, layout), [cylinders, layout]);
  const g = useMemo(() => geometry(stroke / bore, diesel), [stroke, bore, diesel]);
  const opt = CYLINDER_OPTIONS.find((o) => o.cylinders === cylinders && o.layout === layout);
  const cc = (Math.PI / 4) * bore * bore * stroke / 1000;
  const title = `${opt?.label ?? `${cylinders} silindir`} · ${fmt((cc * cylinders) / 1000, 1)} L${diesel ? ' dizel' : ''}`;

  const ref = useCanvasAnimation(
    (ctx, _t, w, h, c, dt) => {
      theta.current = mod(theta.current + dt * speed * 360, 720);
      drawEngine(ctx, w, h, c, { th: theta.current, cfg, trace, g, diesel, title, balance });
    },
    [cfg, trace, g, title],
    { aspect: (w) => (w >= 560 ? 2.05 : w / 400), minHeight: 320, maxHeight: 440 },
  );

  return (
    <AnimFrame
      name="engineBlock"
      canvasRef={ref}
      label={`${title}: ateşleme sırası ${cfg.order.join('-')}. ${balance.label}.`}
      readouts={
        <>
          <Readout label="Silindir başına" value={`${fmt(cc)} cc`} />
          <Readout label="Ateşleme aralığı" value={`${fmt(cfg.step)}°`} />
          <Readout label="Tork tepesi" value={`ortalamanın ${fmt(trace.max / trace.mean, 1)} katı`} />
          <Readout label="Denge" value={balance.label} />
        </>
      }
      controls={<Slider label="Hız" value={speed} min={0.05} max={1.5} step={0.05} onChange={setSpeed} format={(v) => `${fmt(v, 2)} tur/sn`} />}
    />
  );
}
