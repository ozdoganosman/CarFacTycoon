import { useRef, useState } from 'react';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Readout, Slider } from './controls';
import {
  TAU,
  alpha,
  clamp,
  fmt,
  fs,
  hash01,
  hatchRect,
  mix,
  mod,
  paperGrid,
  rad,
  spring,
  text,
  type Ctx,
} from './draw';
import { paragraph } from './text';

export interface FourStrokeProps {
  /** Cylinder bore in mm (default 95). */
  bore?: number;
  /** Piston stroke in mm (default 100). */
  stroke?: number;
  /** Engine speed used for the piston-speed readout (default 2000 d/dk). */
  rpm?: number;
  /** Show the speed / bore / stroke controls (default true). */
  controls?: boolean;
}

const CR = 5; // compression ratio typical of 1910s–30s petrol engines
const ROD_RATIO = 1.75; // connecting-rod length / stroke
// Valve timing in crank degrees (0 = TDC at the start of intake). Real engines open early and
// close late to use the gas's momentum, so there is a small overlap around exhaust→intake TDC.
const IN_OPEN = -10;
const IN_CLOSE = 215;
const EX_OPEN = 505;
const EX_CLOSE = 730;
const SPARK = 352; // ignition slightly before TDC
const N_PARTICLES = 42;

const STAGES = [
  { name: 'Emme', title: '1. zaman · Emme', desc: 'Piston iner, emme supabı açık: benzin-hava karışımı silindire dolar.' },
  { name: 'Sıkıştırma', title: '2. zaman · Sıkıştırma', desc: `Supaplar kapalı; piston çıkar ve karışımı ~1/${CR} hacme sıkıştırır.` },
  { name: 'İş', title: '3. zaman · İş (Ateşleme)', desc: 'Buji ateşler; yanan gaz genleşip pistonu iter. Güç veren tek zaman budur.' },
  { name: 'Egzoz', title: '4. zaman · Egzoz', desc: 'Egzoz supabı açık: piston çıkarken yanmış gazı dışarı süpürür.' },
];

/** Valve lift 0..1: a smooth cos² bump between open and close crank angles (degrees). */
function valveLift(th: number, open: number, close: number): number {
  const half = (close - open) / 2;
  const peak = (open + close) / 2;
  const d = mod(th - peak + 360, 720) - 360;
  if (Math.abs(d) >= half) return 0;
  const c = Math.cos((Math.PI / 2) * (d / half));
  return c * c;
}

/** Signed crank-angle distance from the lift peak, wrapped to [-360, 360). */
function fromPeak(th: number, open: number, close: number) {
  return mod(th - (open + close) / 2 + 360, 720) - 360;
}

function stageColors(c: ThemeColors) {
  return [c.accent2, mix(c.accent2, c.ink, 0.35), c.fire, c.muted];
}

/** Colour and opacity of the gas in the chamber at crank angle th (degrees 0..720). */
function gas(th: number, c: ThemeColors): { color: string; a: number; heat: number } {
  if (th < 180) return { color: c.accent2, a: 0.2, heat: 0 };
  if (th < SPARK) return { color: mix(c.accent2, c.ink, 0.25), a: 0.2 + 0.25 * ((th - 180) / (SPARK - 180)), heat: 0.1 };
  if (th < 540) {
    // flame front: bright right after ignition, cooling while the gas expands
    const k = clamp((th - SPARK) / (540 - SPARK), 0, 1);
    const flash = Math.exp(-k * 5);
    return { color: mix(c.fire, c.muted, clamp(k * 1.3, 0, 1)), a: 0.28 + 0.45 * flash, heat: 1 - k * 0.7 };
  }
  return { color: c.muted, a: 0.22, heat: 0.3 };
}

interface Geo {
  B: number;
  S: number;
  r: number;
  L: number;
  ph: number;
  p2c: number;
  clr: number;
  wt: number;
  hh: number;
  hf: number;
  springLen: number;
  rb: number;
  lh: number;
  xv: number;
  dv: number;
  portExt: number;
  Rw: number;
  linerBottom: number;
  top: number;
  bottom: number;
  halfW: number;
}

function geometry(B: number, S: number): Geo {
  const r = S / 2;
  const L = ROD_RATIO * S;
  const ph = 0.72 * B; // piston height
  const p2c = 0.36 * ph; // wrist pin → crown
  const clr = S / (CR - 1); // clearance height: V_total / V_clearance = CR
  const wt = 0.13 * B;
  const hh = 0.46 * B;
  const hf = r + L + p2c + clr; // head face above crank centre
  const springLen = 0.3 * B;
  const rb = 0.085 * B; // cam base circle
  const lh = 0.11 * B; // max valve lift (slightly exaggerated for visibility)
  const Rw = r + 0.06 * B;
  const crownBDC = -r + L + p2c;
  const top = hf + hh + springLen + 2 * rb + lh + 0.02 * B;
  const bottom = -Math.max(Rw, r + 0.16 * B) - 0.03 * B;
  const portExt = 0.26 * B;
  const halfW = Math.max(B / 2 + wt + portExt, Rw + 0.02 * B);
  return {
    B, S, r, L, ph, p2c, clr, wt, hh, hf, springLen, rb, lh,
    xv: 0.26 * B, dv: 0.3 * B, portExt, Rw,
    linerBottom: crownBDC - ph * 0.85,
    top, bottom, halfW,
  };
}

/** Slider-crank: height of the wrist pin above the crank centre for crank angle a (rad from TDC). */
function pinHeight(g: Geo, a: number) {
  const s = g.r * Math.sin(a);
  return g.r * Math.cos(a) + Math.sqrt(g.L * g.L - s * s);
}

// Reference engine: engines up to this size are drawn at one common scale, so a bigger engine
// looks bigger; larger engines shrink to fit.
const REF = geometry(100, 110);

function drawFourStroke(ctx: Ctx, w: number, h: number, c: ThemeColors, thetaDeg: number, t: number, B: number, S: number) {
  const th = mod(thetaDeg, 720);
  const a = rad(th);
  const stage = Math.min(3, Math.floor(th / 180));
  const g = geometry(B, S);
  const f = fs(w);
  const sc = stageColors(c);

  paperGrid(ctx, w, h, c);

  // ----- layout -----
  const wide = w >= 520;
  const info = wide
    ? { x: w * 0.58, y: 0, w: w * 0.42, h }
    : { x: 0, y: 0, w, h: Math.round(fs(w) * 6.4 + 22) };
  const eng = wide ? { x: 0, y: 0, w: w * 0.58, h } : { x: 0, y: info.h, w, h: h - info.h };
  const padL = wide ? 64 : 42;
  const padR = wide ? 84 : 74;
  const padT = f * 2.2; // room for the bore dimension
  const padB = 12;
  const fit = (geo: Geo) =>
    Math.min((eng.w - padL - padR) / (2 * geo.halfW), (eng.h - padT - padB) / (geo.top - geo.bottom));
  const k = Math.min(fit(g), fit(REF));
  const cx = eng.x + padL + (eng.w - padL - padR) / 2;
  const drawH = (g.top - g.bottom) * k;
  const cy = eng.y + padT + (eng.h - padT - padB - drawH) / 2 + g.top * k; // crank centre
  const X = (x: number) => cx + x * k;
  const Y = (y: number) => cy - y * k;
  const lw = clamp(k * 1.2, 1, 2);

  // ----- kinematics -----
  const yPin = pinHeight(g, a);
  const crown = yPin + g.p2c;
  const pinX = g.r * Math.sin(a);
  const pinY = g.r * Math.cos(a);
  const liftI = valveLift(th, IN_OPEN, IN_CLOSE) * g.lh;
  const liftE = valveLift(th, EX_OPEN, EX_CLOSE) * g.lh;

  const metalLight = mix(c.metal, c.panel, 0.45);
  const metalMid = mix(c.metal, c.panel, 0.15);
  const hatch = alpha(c.muted, 0.45);

  // ----- cylinder block walls (section cut → hatched) -----
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -g.B / 2 - g.wt : g.B / 2;
    ctx.fillStyle = alpha(c.line, 0.35);
    ctx.fillRect(X(x0), Y(g.hf), g.wt * k, (g.hf - g.linerBottom) * k);
    hatchRect(ctx, X(x0), Y(g.hf), g.wt * k, (g.hf - g.linerBottom) * k, hatch, 6);
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = lw;
    ctx.strokeRect(X(x0), Y(g.hf), g.wt * k, (g.hf - g.linerBottom) * k);
  }

  // ----- gas in the chamber -----
  const gs = gas(th, c);
  const chamberTop = Y(g.hf);
  const chamberBot = Y(crown);
  ctx.fillStyle = alpha(gs.color, gs.a);
  ctx.fillRect(X(-g.B / 2), chamberTop, g.B * k, chamberBot - chamberTop);

  // particles: constant count while valves are shut (so density rises on compression);
  // proportional to volume while a valve is open (gas flows in / out at ~1 atm)
  const hc = g.hf - crown;
  const hcMax = g.S + g.clr;
  const visible = stage === 0 || stage === 3 ? Math.round(N_PARTICLES * (hc / hcMax)) : N_PARTICLES;
  const dotR = clamp(g.B * k * 0.022, 1.6, 3.2);
  ctx.fillStyle = mix(gs.color, c.ink, 0.15);
  for (let i = 0; i < visible; i++) {
    const u = hash01(i * 3 + 1);
    const v = hash01(i * 7 + 2);
    const jig = (0.6 + gs.heat * 2.2) * dotR;
    const px = X(-g.B / 2 + g.B * (0.05 + 0.9 * u)) + Math.sin(t * (3 + gs.heat * 9) + i * 1.7) * jig;
    const py = chamberTop + (chamberBot - chamberTop) * (0.08 + 0.84 * v) + Math.cos(t * (2.6 + gs.heat * 8) + i) * jig * 0.7;
    ctx.beginPath();
    ctx.arc(px, py, dotR, 0, TAU);
    ctx.fill();
  }

  // ----- piston -----
  const pgap = 0.012 * g.B;
  const pTop = Y(crown);
  const pH = g.ph * k;
  ctx.fillStyle = metalLight;
  ctx.fillRect(X(-g.B / 2 + pgap), pTop, (g.B - 2 * pgap) * k, pH);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = lw;
  ctx.strokeRect(X(-g.B / 2 + pgap), pTop, (g.B - 2 * pgap) * k, pH);
  ctx.beginPath();
  for (const d of [0.07, 0.12, 0.17]) {
    ctx.moveTo(X(-g.B / 2 + pgap), Y(crown - d * g.B));
    ctx.lineTo(X(g.B / 2 - pgap), Y(crown - d * g.B));
  }
  ctx.lineWidth = 1;
  ctx.stroke();

  // ----- crankshaft: counterweight, web, pin -----
  const pinDir = Math.atan2(-pinY, pinX); // screen angle of crank pin
  ctx.beginPath();
  ctx.arc(X(0), Y(0), g.Rw * k, pinDir + Math.PI / 2 + 0.25, pinDir + (3 * Math.PI) / 2 - 0.25);
  ctx.closePath();
  ctx.fillStyle = c.metal;
  ctx.fill();
  ctx.strokeStyle = c.ink;
  ctx.stroke();
  // web (capsule from main journal to crank pin)
  const webW = 0.15 * g.B * k;
  ctx.save();
  ctx.translate(X(0), Y(0));
  ctx.rotate(pinDir);
  ctx.beginPath();
  ctx.arc(0, 0, webW, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.arc(g.r * k, 0, webW, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = c.metal;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // ----- connecting rod (tapered) -----
  const rodA = Math.atan2(yPin - pinY, 0 - pinX);
  const nx = -Math.sin(rodA);
  const ny = Math.cos(rodA);
  const wBig = 0.09 * g.B;
  const wSmall = 0.055 * g.B;
  ctx.beginPath();
  ctx.moveTo(X(pinX + nx * wBig), Y(pinY + ny * wBig));
  ctx.lineTo(X(0 + nx * wSmall), Y(yPin + ny * wSmall));
  ctx.lineTo(X(0 - nx * wSmall), Y(yPin - ny * wSmall));
  ctx.lineTo(X(pinX - nx * wBig), Y(pinY - ny * wBig));
  ctx.closePath();
  ctx.fillStyle = metalMid;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.stroke();
  // small end + wrist pin
  ctx.beginPath();
  ctx.arc(X(0), Y(yPin), 0.085 * g.B * k, 0, TAU);
  ctx.fillStyle = metalMid;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(0), Y(yPin), 0.04 * g.B * k, 0, TAU);
  ctx.fillStyle = c.panel;
  ctx.fill();
  ctx.stroke();

  // big end around the crank pin
  ctx.beginPath();
  ctx.arc(X(pinX), Y(pinY), 0.12 * g.B * k, 0, TAU);
  ctx.fillStyle = metalMid;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(pinX), Y(pinY), 0.055 * g.B * k, 0, TAU);
  ctx.fillStyle = c.panel;
  ctx.fill();
  ctx.stroke();
  // main journal
  ctx.beginPath();
  ctx.arc(X(0), Y(0), 0.075 * g.B * k, 0, TAU);
  ctx.fillStyle = c.panel;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(0), Y(0), 1.6, 0, TAU);
  ctx.fillStyle = c.ink;
  ctx.fill();

  // ----- cylinder head with ports -----
  const headX0 = -g.B / 2 - g.wt;
  ctx.fillStyle = alpha(c.line, 0.35);
  ctx.fillRect(X(headX0), Y(g.hf + g.hh), (g.B + 2 * g.wt) * k, g.hh * k);
  hatchRect(ctx, X(headX0), Y(g.hf + g.hh), (g.B + 2 * g.wt) * k, g.hh * k, hatch, 6);

  const portTop = g.hf + 0.72 * g.hh;
  const portBot = g.hf + 0.42 * g.hh;
  const portOuter = headX0 - g.portExt;
  const ports = [
    { side: -1, lift: liftI, color: c.accent2, open: liftI > 0.02 * g.lh, inflow: true },
    { side: 1, lift: liftE, color: c.muted, open: liftE > 0.02 * g.lh, inflow: false },
  ];
  for (const p of ports) {
    const s = p.side;
    const xa = s * (g.xv - g.dv / 2);
    const xb = s * (g.xv + g.dv / 2);
    const xo = s * -portOuter; // outer end (positive side mirrored)
    // L-shaped channel polygon
    const poly: [number, number][] = [
      [xo, portTop],
      [xb, portTop],
      [xb, g.hf],
      [xa, g.hf],
      [xa, portBot],
      [xo, portBot],
    ];
    ctx.beginPath();
    poly.forEach(([px, py], i) => (i ? ctx.lineTo(X(px), Y(py)) : ctx.moveTo(X(px), Y(py))));
    ctx.closePath();
    ctx.fillStyle = c.panel;
    ctx.fill();
    ctx.fillStyle = alpha(p.color, p.open ? 0.28 : 0.1);
    ctx.fill();
    // walls (skip the seat opening and the outer end)
    ctx.beginPath();
    ctx.moveTo(X(xo), Y(portTop));
    ctx.lineTo(X(xb), Y(portTop));
    ctx.lineTo(X(xb), Y(g.hf));
    ctx.moveTo(X(xa), Y(g.hf));
    ctx.lineTo(X(xa), Y(portBot));
    ctx.lineTo(X(xo), Y(portBot));
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = lw;
    ctx.stroke();
    // flowing particles along the port while the valve is open
    if (p.open) {
      const flow = p.lift / g.lh;
      const n = 6;
      ctx.fillStyle = mix(p.color, c.ink, 0.15);
      for (let i = 0; i < n; i++) {
        let q = mod(t * 0.9 + i / n, 1);
        if (!p.inflow) q = 1 - q; // exhaust flows outward
        // path: outer end → corner → seat
        const xm = s * g.xv;
        const ym = (portTop + portBot) / 2;
        let px: number;
        let py: number;
        if (q < 0.65) {
          px = xo + (xm - xo) * (q / 0.65);
          py = ym;
        } else {
          px = xm;
          py = ym + (g.hf - ym) * ((q - 0.65) / 0.35);
        }
        ctx.globalAlpha = clamp(flow * 1.5, 0, 1);
        ctx.beginPath();
        ctx.arc(X(px), Y(py), dotR, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = lw;
  // head outline (minus the port mouths on the sides)
  ctx.beginPath();
  ctx.moveTo(X(headX0), Y(portTop));
  ctx.lineTo(X(headX0), Y(g.hf + g.hh));
  ctx.lineTo(X(-headX0), Y(g.hf + g.hh));
  ctx.lineTo(X(-headX0), Y(portTop));
  ctx.moveTo(X(headX0), Y(portBot));
  ctx.lineTo(X(headX0), Y(g.hf));
  ctx.lineTo(X(-g.B / 2), Y(g.hf));
  ctx.moveTo(X(g.B / 2), Y(g.hf));
  ctx.lineTo(X(-headX0), Y(g.hf));
  ctx.lineTo(X(-headX0), Y(portBot));
  ctx.stroke();

  // ----- valves, springs, cams -----
  const valves = [
    { x: -g.xv, lift: liftI, open: IN_OPEN, close: IN_CLOSE },
    { x: g.xv, lift: liftE, open: EX_OPEN, close: EX_CLOSE },
  ];
  const th45 = 0.05 * g.B;
  const stemW = 0.045 * g.B;
  for (const v of valves) {
    const yb = g.hf - v.lift; // bottom face of the valve head
    const stemTop = g.hf + g.hh + g.springLen - v.lift;
    // stem
    ctx.fillStyle = metalMid;
    ctx.fillRect(X(v.x - stemW / 2), Y(stemTop), stemW * k, (stemTop - yb) * k);
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(X(v.x - stemW / 2), Y(stemTop), stemW * k, (stemTop - yb) * k);
    // poppet head (flat face + 45° seat)
    ctx.beginPath();
    ctx.moveTo(X(v.x - g.dv / 2), Y(yb));
    ctx.lineTo(X(v.x + g.dv / 2), Y(yb));
    ctx.lineTo(X(v.x + g.dv / 2), Y(yb + th45 * 0.35));
    ctx.lineTo(X(v.x + stemW), Y(yb + th45 * 1.6));
    ctx.lineTo(X(v.x - stemW), Y(yb + th45 * 1.6));
    ctx.lineTo(X(v.x - g.dv / 2), Y(yb + th45 * 0.35));
    ctx.closePath();
    ctx.fillStyle = metalMid;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.stroke();
    // spring between head top and retainer
    ctx.strokeStyle = mix(c.ink, c.metal, 0.3);
    ctx.lineWidth = 1.2;
    spring(ctx, X(v.x), Y(g.hf + g.hh), X(v.x), Y(stemTop - 0.03 * g.B), 5, 0.2 * g.B * k);
    ctx.stroke();
    // retainer / tappet
    ctx.fillStyle = c.ink;
    ctx.fillRect(X(v.x - 0.09 * g.B), Y(stemTop), 0.18 * g.B * k, Math.max(2, 0.03 * g.B * k));
    // cam: turns once per two crank turns; lobe points at the tappet at peak lift
    const camY = g.hf + g.hh + g.springLen + g.rb;
    const dPeak = fromPeak(th, v.open, v.close);
    const lobeDir = Math.PI / 2 + rad(dPeak / 2);
    const halfCam = rad((v.close - v.open) / 4);
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const ang = (i / 72) * TAU;
      const d = Math.atan2(Math.sin(ang - lobeDir), Math.cos(ang - lobeDir));
      let rr = g.rb;
      if (Math.abs(d) < halfCam) {
        const cc = Math.cos((Math.PI / 2) * (d / halfCam));
        rr += g.lh * cc * cc;
      }
      const px = X(v.x) + Math.cos(ang) * rr * k;
      const py = Y(camY) + Math.sin(ang) * rr * k;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = mix(c.metal, c.ink, 0.1);
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(v.x), Y(camY), Math.max(1.5, 0.025 * g.B * k), 0, TAU);
    ctx.fillStyle = c.panel;
    ctx.fill();
  }

  // ----- spark plug -----
  const plugW = 0.075 * g.B;
  ctx.fillStyle = c.panel;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1;
  ctx.fillRect(X(-plugW / 2), Y(g.hf + g.hh + 0.24 * g.B), plugW * k, 0.24 * g.B * k);
  ctx.strokeRect(X(-plugW / 2), Y(g.hf + g.hh + 0.24 * g.B), plugW * k, 0.24 * g.B * k);
  ctx.fillStyle = mix(c.metal, c.ink, 0.2);
  ctx.fillRect(X(-plugW * 0.8), Y(g.hf + g.hh + 0.07 * g.B), plugW * 1.6 * k, 0.07 * g.B * k);
  ctx.beginPath();
  ctx.moveTo(X(0), Y(g.hf + g.hh));
  ctx.lineTo(X(0), Y(g.hf - 0.03 * g.B));
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const sparkOn = th >= SPARK && th < SPARK + 16;
  if (sparkOn) {
    const sx = X(0);
    const sy = Y(g.hf - 0.04 * g.B);
    const rr = 0.16 * g.B * k;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 1.6);
    glow.addColorStop(0, alpha(c.fire, 0.9));
    glow.addColorStop(1, alpha(c.fire, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, rr * 1.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = c.fire;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * TAU + th * 0.3;
      ctx.moveTo(sx + Math.cos(an) * rr * 0.3, sy + Math.sin(an) * rr * 0.3);
      ctx.lineTo(sx + Math.cos(an) * rr, sy + Math.sin(an) * rr);
    }
    ctx.stroke();
  }

  // ----- dimensions & labels -----
  const lab = { size: f - 1, color: c.muted };
  // TDC / BDC reference lines and stroke dimension (right side)
  const crownTDC = g.r + g.L + g.p2c;
  const crownBDC = -g.r + g.L + g.p2c;
  const xr0 = X(g.B / 2 + g.wt) + 4;
  const xDim = X(g.halfW) + 16;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = c.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const yy of [crownTDC, crownBDC]) {
    ctx.moveTo(xr0, Y(yy));
    ctx.lineTo(xDim + 6, Y(yy));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  dimLine(ctx, xDim, Y(crownTDC), xDim, Y(crownBDC), c.ink);
  text(ctx, 'ÜÖN', xDim + 9, Y(crownTDC), { ...lab, baseline: 'middle', weight: 600 });
  text(ctx, 'AÖN', xDim + 9, Y(crownBDC), { ...lab, baseline: 'middle', weight: 600 });
  const yMid = (Y(crownTDC) + Y(crownBDC)) / 2;
  text(ctx, 'Strok', xDim + 8, yMid - 2, { size: f - 1, color: c.ink, weight: 600, baseline: 'bottom' });
  text(ctx, `${fmt(S)} mm`, xDim + 8, yMid + 2, { size: f - 1, color: c.ink, weight: 600, baseline: 'top' });
  // bore dimension across the top
  const yBore = Y(g.top) - 6;
  dimLine(ctx, X(-g.B / 2), yBore, X(g.B / 2), yBore, c.ink);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = c.muted;
  ctx.beginPath();
  ctx.moveTo(X(-g.B / 2), yBore - 4);
  ctx.lineTo(X(-g.B / 2), Y(g.hf));
  ctx.moveTo(X(g.B / 2), yBore - 4);
  ctx.lineTo(X(g.B / 2), Y(g.hf));
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  text(ctx, `Çap ${fmt(B)} mm`, X(0), yBore - 4, { size: f - 1, color: c.ink, align: 'center', weight: 600 });
  // port labels
  const portLabelY = Y((portTop + portBot) / 2);
  text(ctx, 'Emme', X(portOuter) - 4, portLabelY, { ...lab, align: 'right', baseline: 'middle', color: c.accent2, weight: 600 });
  text(ctx, 'Egzoz', X(-portOuter) + 4, portLabelY, { ...lab, align: 'left', baseline: 'middle', weight: 600 });
  // part labels on the left (wide layouts only)
  if (wide) {
    const xl = eng.x + 6;
    const leader = (label: string, tx: number, ty: number) => {
      text(ctx, label, xl, ty, { ...lab, baseline: 'middle' });
      const lwid = ctx.measureText(label).width;
      ctx.strokeStyle = alpha(c.muted, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xl + lwid + 4, ty);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, TAU);
      ctx.fillStyle = c.muted;
      ctx.fill();
    };
    leader('Piston', X(-g.B / 2 + pgap) + 6, Y(crown - g.ph * 0.55));
    const midY = (yPin + pinY) / 2;
    leader('Biyel', X(pinX / 2) - 3, Y(midY));
    leader('Krank', X(-g.Rw * 0.6), Y(-g.Rw * 0.35));
  }

  // ----- info panel -----
  drawInfo(ctx, info, wide, c, sc, th, stage, f, liftI > 0.02 * g.lh, liftE > 0.02 * g.lh, sparkOn);
}

function dimLine(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hd = 6;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  for (const [x, y, d] of [
    [x1, y1, a + Math.PI],
    [x2, y2, a],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(d - 0.4) * hd, y - Math.sin(d - 0.4) * hd);
    ctx.lineTo(x - Math.cos(d + 0.4) * hd, y - Math.sin(d + 0.4) * hd);
    ctx.closePath();
    ctx.fill();
  }
}

function drawInfo(
  ctx: Ctx,
  box: { x: number; y: number; w: number; h: number },
  wide: boolean,
  c: ThemeColors,
  sc: string[],
  th: number,
  stage: number,
  f: number,
  inOpen: boolean,
  exOpen: boolean,
  sparkOn: boolean,
) {
  const st = STAGES[stage];
  const pad = 12;
  const ringR = wide ? clamp(Math.min(box.w, box.h) * 0.24, 36, 76) : clamp((box.h - 22) / 2, 26, 44);
  const ringCx = wide ? box.x + box.w / 2 : box.x + box.w - pad - ringR;
  const textW = wide ? box.w - pad * 2 : box.w - pad * 3 - ringR * 2;
  // title + description
  const x0 = box.x + pad;
  let y = box.y + pad;
  text(ctx, st.title, x0, y, { size: f + 3, weight: 700, color: stage === 1 ? c.ink : sc[stage], baseline: 'top', maxWidth: textW });
  y += (f + 3) * 1.45;
  y = paragraph(ctx, st.desc, x0, y, textW, { size: wide ? f : f - 1, color: c.ink, maxLines: wide ? 4 : 3 });

  // cycle ring: 720° = two crank turns = one working cycle
  const ringCy = wide ? clamp(y + 18 + ringR, box.y + box.h * 0.42, box.y + box.h - ringR - f * 5.2) : box.y + box.h / 2;
  const thick = ringR * 0.3;
  for (let i = 0; i < 4; i++) {
    const a0 = -Math.PI / 2 + (i * Math.PI) / 2 + 0.03;
    const a1 = a0 + Math.PI / 2 - 0.06;
    ctx.beginPath();
    ctx.arc(ringCx, ringCy, ringR, a0, a1);
    ctx.strokeStyle = i === stage ? sc[i] : alpha(sc[i], 0.3);
    ctx.lineWidth = thick;
    ctx.stroke();
    const am = (a0 + a1) / 2;
    text(ctx, String(i + 1), ringCx + Math.cos(am) * ringR, ringCy + Math.sin(am) * ringR, {
      size: Math.max(11, thick * 0.62),
      weight: 700,
      color: i === stage ? c.panel : c.ink,
      align: 'center',
      baseline: 'middle',
    });
  }
  // pointer: a tick across the ring at the current crank angle
  const pa = -Math.PI / 2 + (th / 720) * TAU;
  const r0 = ringR - thick * 0.75;
  const r1 = ringR + thick * 0.8;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ringCx + Math.cos(pa) * r0, ringCy + Math.sin(pa) * r0);
  ctx.lineTo(ringCx + Math.cos(pa) * r1, ringCy + Math.sin(pa) * r1);
  ctx.stroke();
  ctx.lineCap = 'butt';
  text(ctx, `${Math.floor(th)}°`, ringCx, ringCy, { size: ringR >= 40 ? f : 11, mono: true, weight: 600, color: c.ink, align: 'center', baseline: 'middle' });
  if (!wide) return;
  text(ctx, '2 krank turu = 1 çevrim', ringCx, ringCy + ringR + thick * 0.5 + f * 1.2, { size: f - 1, color: c.muted, align: 'center', baseline: 'middle' });

  // valve status + spark
  let yy = box.y + box.h - pad - f * 2.7;
  const row = (label: string, on: boolean, color: string, onText: string, offText: string) => {
    ctx.beginPath();
    ctx.arc(x0 + 5, yy, 5, 0, TAU);
    if (on) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = c.muted;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    text(ctx, `${label}: ${on ? onText : offText}`, x0 + 16, yy, { size: f - 1, color: on ? c.ink : c.muted, baseline: 'middle', weight: on ? 600 : 500 });
    yy += f * 1.35;
  };
  row('Emme supabı', inOpen, c.accent2, 'açık', 'kapalı');
  row('Egzoz supabı', exOpen, c.muted, 'açık', 'kapalı');
  row('Buji', sparkOn, c.fire, 'kıvılcım!', 'bekliyor');
}

export function FourStroke({ bore, stroke, rpm, controls = true }: FourStrokeProps) {
  const [speed, setSpeed] = useState(0.4); // crank turns per second on screen
  const [boreS, setBoreS] = useState(95);
  const [strokeS, setStrokeS] = useState(100);
  const B = clamp(bore ?? boreS, 30, 250);
  const S = clamp(stroke ?? strokeS, 30, 300);
  const n = rpm ?? 2000;
  const theta = useRef(0);

  const ref = useCanvasAnimation(
    (ctx, t, w, h, c, dt) => {
      theta.current = mod(theta.current + dt * speed * 360, 720);
      drawFourStroke(ctx, w, h, c, theta.current, t, B, S);
    },
    [B, S],
    { aspect: (w) => (w >= 520 ? 1.45 : w / Math.min(560, 360 + w * 0.4)), maxHeight: 600 },
  );

  // Displacement of one cylinder: π/4 · D² · s  (mm³ → cm³)
  const cc = (Math.PI / 4) * B * B * S / 1000;
  // Mean piston speed: the piston covers 2 strokes per crank turn
  const vp = (2 * (S / 1000) * n) / 60;
  const ratio = S / B;
  const kind = ratio > 1.1 ? 'uzun stroklu' : ratio < 0.9 ? 'kısa stroklu' : 'kareye yakın';

  return (
    <AnimFrame
      name="fourStroke"
      canvasRef={ref}
      label={`Dört zamanlı motor: ${fmt(B)} mm çap, ${fmt(S)} mm strok. Emme, sıkıştırma, iş ve egzoz zamanları.`}
      readouts={
        <>
          <Readout label="Silindir hacmi" value={`${fmt(cc)} cc`} />
          <Readout label={`Ort. piston hızı @ ${fmt(n)} d/dk`} value={`${fmt(vp, 1)} m/s`} />
          <Readout label="Strok/çap" value={`${fmt(ratio, 2)} · ${kind}`} />
        </>
      }
      controls={
        controls ? (
          <>
            <Slider label="Hız" value={speed} min={0.05} max={1.5} step={0.05} onChange={setSpeed} format={(v) => `${fmt(v, 2)} tur/sn`} />
            {bore === undefined ? (
              <Slider label="Çap" value={boreS} min={60} max={130} step={1} onChange={setBoreS} format={(v) => `${v} mm`} />
            ) : null}
            {stroke === undefined ? (
              <Slider label="Strok" value={strokeS} min={60} max={150} step={1} onChange={setStrokeS} format={(v) => `${v} mm`} />
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}
