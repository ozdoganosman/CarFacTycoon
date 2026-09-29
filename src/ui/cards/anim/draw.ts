/* Small canvas helpers shared by the explainer animations. Everything takes theme colors as
   arguments so drawings follow light / dark mode. */
import type { ThemeColors } from '../../theme';
import { fmtNumber } from '../../../i18n/format';

export type Ctx = CanvasRenderingContext2D;

/* ---------- math ---------- */

export const TAU = Math.PI * 2;
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0..1 → 0..1 with zero slope at the ends. */
export const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
/** Smoothstep between edges e0 and e1. */
export const sstep = (e0: number, e1: number, v: number) => smooth((v - e0) / (e1 - e0));
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;
/** Positive modulo. */
export const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Deterministic pseudo-random in [0,1) for stable particle layouts. */
export function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Turkish number formatting (decimal comma). */
export function fmt(n: number, digits = 0): string {
  return fmtNumber(n, digits);
}

/* ---------- colour ---------- */

function parse(c: string): [number, number, number] | null {
  const s = c.trim();
  if (s[0] === '#') {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    }
    if (h.length === 6 || h.length === 8) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    return null;
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.slice(0, 3).every((v) => Number.isFinite(v))) return [p[0], p[1], p[2]];
  }
  return null;
}

const cache = new Map<string, [number, number, number] | null>();
function rgb(c: string) {
  let v = cache.get(c);
  if (v === undefined) {
    v = parse(c);
    cache.set(c, v);
  }
  return v;
}

/** Colour with alpha. Falls back to the colour itself if it cannot be parsed. */
export function alpha(c: string, a: number): string {
  const v = rgb(c);
  if (!v) return c;
  return `rgba(${v[0]},${v[1]},${v[2]},${clamp(a, 0, 1).toFixed(3)})`;
}

/** Linear blend of two colours (t=0 → a, t=1 → b). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return t < 0.5 ? a : b;
  const k = clamp(t, 0, 1);
  const r = Math.round(lerp(x[0], y[0], k));
  const g = Math.round(lerp(x[1], y[1], k));
  const bl = Math.round(lerp(x[2], y[2], k));
  return `rgb(${r},${g},${bl})`;
}

/* ---------- fonts (from CSS custom properties) ---------- */

let fontCache: { ui: string; mono: string } | null = null;
function families() {
  if (!fontCache) {
    const cs = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
    // Canvas fonts cannot hold var(): put the Hindi and Arabic fallbacks in by hand.
    const scripts = cs?.getPropertyValue('--font-scripts').trim() || "'Noto Sans Devanagari', 'Noto Sans Arabic'";
    const resolve = (v: string | undefined) => v?.trim().replace(/var\(--font-scripts\)/g, scripts);
    fontCache = {
      ui: resolve(cs?.getPropertyValue('--font-ui')) || 'system-ui, sans-serif',
      mono: resolve(cs?.getPropertyValue('--font-mono')) || 'ui-monospace, monospace',
    };
  }
  return fontCache;
}

export function font(px: number, weight = 500, mono = false): string {
  const f = families();
  return `${weight} ${Math.max(11, px)}px ${mono ? f.mono : f.ui}`;
}

/** Font size that grows gently with canvas width, never below 11px. */
export function fs(w: number, base = 12): number {
  return Math.max(11, Math.round(base * clamp(w / 600, 0.92, 1.18)));
}

/* ---------- primitives ---------- */

export interface TextOpts {
  size?: number;
  weight?: number;
  mono?: boolean;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  /** Draw a rounded background plate behind the text. */
  bg?: string;
  pad?: number;
  maxWidth?: number;
}

/** Draw text; returns its measured width. */
export function text(ctx: Ctx, s: string, x: number, y: number, o: TextOpts = {}): number {
  ctx.font = font(o.size ?? 12, o.weight ?? 500, o.mono ?? false);
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  const w = Math.min(ctx.measureText(s).width, o.maxWidth ?? Infinity);
  if (o.bg) {
    const pad = o.pad ?? 3;
    const size = o.size ?? 12;
    let x0 = x;
    if (ctx.textAlign === 'center') x0 = x - w / 2;
    else if (ctx.textAlign === 'right' || ctx.textAlign === 'end') x0 = x - w;
    let y0 = y - size * 0.8;
    if (ctx.textBaseline === 'middle') y0 = y - size * 0.55;
    else if (ctx.textBaseline === 'top') y0 = y - size * 0.1;
    else if (ctx.textBaseline === 'bottom') y0 = y - size * 1.05;
    ctx.fillStyle = o.bg;
    roundRect(ctx, x0 - pad, y0 - pad * 0.6, w + pad * 2, size * 1.1 + pad * 1.2, 4);
    ctx.fill();
  }
  ctx.fillStyle = o.color ?? '#000';
  ctx.fillText(s, x, y, o.maxWidth);
  return w;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export interface ArrowOpts {
  color: string;
  width?: number;
  head?: number;
  dash?: number[];
}

/** Straight arrow from (x1,y1) to (x2,y2) with a filled head at the end. */
export function arrow(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, o: ArrowOpts) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.5) return;
  const lw = o.width ?? 2;
  const head = Math.min(o.head ?? 4 + lw * 2.5, len * 0.6);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const bx = x2 - Math.cos(a) * head * 0.8;
  const by = y2 - Math.sin(a) * head * 0.8;
  ctx.save();
  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  if (o.dash) ctx.setLineDash(o.dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a - 0.45) * head, y2 - Math.sin(a - 0.45) * head);
  ctx.lineTo(x2 - Math.cos(a + 0.45) * head, y2 - Math.sin(a + 0.45) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Circular-arc arrow (angles in radians, canvas convention: clockwise positive). */
export function arcArrow(ctx: Ctx, cx: number, cy: number, r: number, a0: number, a1: number, o: ArrowOpts) {
  const lw = o.width ?? 2;
  const head = o.head ?? 4 + lw * 2.5;
  const ccw = a1 < a0;
  ctx.save();
  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  const trim = (head * 0.7) / r;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, ccw ? a1 + trim : a1 - trim, ccw);
  ctx.stroke();
  // head tangent to the arc at a1
  const ex = cx + Math.cos(a1) * r;
  const ey = cy + Math.sin(a1) * r;
  const tang = a1 + (ccw ? -Math.PI / 2 : Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(tang - 0.45) * head, ey - Math.sin(tang - 0.45) * head);
  ctx.lineTo(ex - Math.cos(tang + 0.45) * head, ey - Math.sin(tang + 0.45) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Spur-gear outline path (trapezoid teeth). */
export function gearPath(ctx: Ctx, cx: number, cy: number, rRoot: number, rTip: number, teeth: number, angle: number) {
  const step = TAU / teeth;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = angle + i * step;
    const pts: [number, number][] = [
      [a - step * 0.5, rRoot],
      [a - step * 0.22, rRoot],
      [a - step * 0.13, rTip],
      [a + step * 0.13, rTip],
      [a + step * 0.22, rRoot],
    ];
    for (let k = 0; k < pts.length; k++) {
      const [pa, pr] = pts[k];
      const x = cx + Math.cos(pa) * pr;
      const y = cy + Math.sin(pa) * pr;
      if (i === 0 && k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

/** Coil spring drawn as a zig-zag between two points. */
export function spring(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, coils: number, width: number) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const nx = -uy;
  const ny = ux;
  const n = coils * 2;
  const lead = Math.min(4, len * 0.1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 + ux * lead, y1 + uy * lead);
  for (let i = 0; i < n; i++) {
    const s = lead + ((len - 2 * lead) * (i + 0.5)) / n;
    const side = i % 2 === 0 ? 1 : -1;
    ctx.lineTo(x1 + ux * s + nx * side * width * 0.5, y1 + uy * s + ny * side * width * 0.5);
  }
  ctx.lineTo(x2 - ux * lead, y2 - uy * lead);
  ctx.lineTo(x2, y2);
}

/** Section-cut hatching inside a rectangle (engineering drawing convention for cut solids). */
export function hatchRect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, gap = 6) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let d = -h; d < w + h; d += gap) {
    ctx.moveTo(x + d, y + h);
    ctx.lineTo(x + d + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Faint blueprint-paper grid. */
export function paperGrid(ctx: Ctx, w: number, h: number, c: ThemeColors, step = 24) {
  ctx.save();
  ctx.strokeStyle = alpha(c.line, 0.55);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = (w % step) / 2; x < w; x += step) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, h);
  }
  for (let y = (h % step) / 2; y < h; y += step) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(w, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

/** Stick-figure worker. `swing` animates the arm (radians). */
export function worker(ctx: Ctx, x: number, yFeet: number, size: number, body: string, skin: string, swing = 0, facing = 1) {
  const head = size * 0.12;
  const hip = yFeet - size * 0.42;
  const neck = yFeet - size * 0.78;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = body;
  ctx.lineWidth = Math.max(1.5, size * 0.075);
  // legs
  ctx.beginPath();
  ctx.moveTo(x - size * 0.12, yFeet);
  ctx.lineTo(x, hip);
  ctx.lineTo(x + size * 0.12, yFeet);
  // torso
  ctx.moveTo(x, hip);
  ctx.lineTo(x, neck);
  // arm
  const ax = x + facing * Math.cos(-0.3 + swing) * size * 0.34;
  const ay = neck + size * 0.08 + Math.sin(0.6 + swing) * size * 0.3;
  ctx.moveTo(x, neck + size * 0.06);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x, neck - head, head, 0, TAU);
  ctx.fill();
  ctx.restore();
}
