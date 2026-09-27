import { useState } from 'react';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Slider } from './controls';
import { TAU, alpha, arrow, clamp, fmt, fs, mix, mod, roundRect, spring, sstep, text, type Ctx } from './draw';

const FOOT = 100; // N – a firm push with the foot
const PEDAL_RATIO = 4; // pedal lever multiplies the foot force
const F1_MAX = FOOT * PEDAL_RATIO; // N on the master-cylinder piston
const D1 = 19; // mm master-cylinder bore (3/4")
const A1 = (Math.PI / 4) * (D1 / 10) ** 2; // cm²
const PERIOD = 4.2;

/** Pedal application 0..1 over a loop: press, hold, release, rest. */
function pedal(t: number) {
  const x = mod(t, PERIOD);
  return sstep(0.3, 1.2, x) * (1 - sstep(2.7, 3.4, x));
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawMain(ctx: Ctx, b: Box, c: ThemeColors, u: number, ratio: number, t: number, f: number, narrow: boolean) {
  const F1 = F1_MAX * u;
  const p = F1 / A1; // N/cm²  (1 N/cm² = 0.1 bar)
  const A2 = A1 * ratio;
  const F2 = p * A2;
  const fluid = c.accent2;
  const fluidA = 0.25 + 0.55 * u; // darker = higher pressure

  // ----- formulas (top-left on narrow screens, top-centre otherwise) -----
  const lh = f * 1.45;
  const fx0 = narrow ? b.x + 12 : b.x + b.w * 0.24;
  let fy0 = b.y + 12;
  const line = (label: string, value: string, color: string) => {
    const lw = text(ctx, label, fx0, fy0, { size: f, weight: 600, color: c.ink, baseline: 'top', mono: true });
    text(ctx, value, fx0 + lw + 6, fy0, { size: f, weight: 700, color, baseline: 'top', mono: true });
    fy0 += lh;
  };
  line('F₁ =', `${fmt(F1)} N`, c.accent);
  line('p = F₁/A₁ =', `${fmt(p / 10, 1)} bar`, c.accent2);
  line('F₂ = p·A₂ =', `${fmt(F2)} N`, c.good);
  if (!narrow) {
    text(ctx, `A₁ = ${fmt(A1, 1)} cm²   A₂ = ${fmt(A2, 1)} cm²  (×${fmt(ratio, 1)})`, fx0, fy0 + 2, { size: 11, color: c.muted, baseline: 'top', mono: true });
  }

  // ----- geometry -----
  const d = clamp(b.h * 0.08, 14, 24); // pedal: pushrod attaches d above the floor pivot, pad at 4·d
  const yAx = narrow ? b.y + 12 + lh * 3 + 3 * d + 12 : Math.max(b.y + 12 + lh * 4 + 52, b.y + b.h * 0.45);
  const Rd = Math.min((b.y + b.h - 8 - yAx) / 1.6, b.w * (narrow ? 0.17 : 0.2), 90); // drum radius
  const xd = b.x + b.w - Rd - 14;
  const yd = yAx + Rd * 0.6;
  const r1 = Math.max(5, Rd * 0.085); // master bore radius (px)
  const r2 = r1 * Math.sqrt(ratio); // wheel-cylinder bore radius scales with √(area ratio)

  const pivot = { x: b.x + 46, y: yAx + d };
  const lean = -0.15 + 0.6 * u; // lever angle from vertical (rad); top moves right when pressed
  const at = (k: number) => ({ x: pivot.x + Math.sin(lean) * k, y: pivot.y - Math.cos(lean) * k });
  const pad = at(d * PEDAL_RATIO);
  const rodPt = at(d / Math.cos(lean)); // where the lever crosses the pushrod line
  const rodRest = pivot.x + Math.tan(-0.15) * d;
  // master cylinder
  const mc0 = pivot.x + d * (narrow ? 1.6 : 2.4) + (narrow ? 24 : 40);
  const mcLen = narrow ? 56 : Math.max(70, b.w * 0.16);
  const pistonX = mc0 + 12 + (rodPt.x - rodRest); // piston travels with the pushrod
  // lever + pad
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pivot.x, pivot.y);
  ctx.lineTo(pad.x, pad.y);
  ctx.stroke();
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(pad.x - 3, pad.y - 10);
  ctx.lineTo(pad.x + 3, pad.y + 10);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(pivot.x, pivot.y, 4, 0, TAU);
  ctx.fillStyle = c.panel;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // pushrod
  ctx.strokeStyle = mix(c.metal, c.ink, 0.4);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(rodPt.x, rodPt.y);
  ctx.lineTo(pistonX, yAx);
  ctx.stroke();
  // foot force
  const footLen = 16 + 22 * u;
  arrow(ctx, pad.x - footLen - 12, pad.y, pad.x - 8, pad.y, { color: c.ink, width: 2 });
  text(ctx, 'ayak', pad.x - footLen - 12, pad.y + 7, { size: 11, color: c.muted, baseline: 'top' });
  text(ctx, `pedal ×${PEDAL_RATIO}`, pivot.x + 8, pivot.y + 4, { size: 11, color: c.muted, baseline: 'top' });

  // master cylinder body
  ctx.fillStyle = alpha(fluid, fluidA);
  ctx.fillRect(pistonX, yAx - r1, mc0 + mcLen - pistonX, r1 * 2);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mc0, yAx - r1 - 1);
  ctx.lineTo(mc0 + mcLen, yAx - r1 - 1);
  ctx.lineTo(mc0 + mcLen, yAx - 3);
  ctx.moveTo(mc0 + mcLen, yAx + 3);
  ctx.lineTo(mc0 + mcLen, yAx + r1 + 1);
  ctx.lineTo(mc0, yAx + r1 + 1);
  ctx.stroke();
  // reservoir
  ctx.lineWidth = 1.2;
  ctx.strokeRect(mc0 + mcLen * 0.55, yAx - r1 - 14, mcLen * 0.3, 13);
  ctx.fillStyle = alpha(fluid, 0.25);
  ctx.fillRect(mc0 + mcLen * 0.55 + 1, yAx - r1 - 8, mcLen * 0.3 - 2, 6);
  // piston
  ctx.fillStyle = c.metal;
  ctx.fillRect(pistonX - 10, yAx - r1 + 1, 10, r1 * 2 - 2);
  ctx.strokeStyle = c.ink;
  ctx.strokeRect(pistonX - 10, yAx - r1 + 1, 10, r1 * 2 - 2);
  text(ctx, narrow ? 'A₁' : 'ana silindir (A₁)', mc0 + mcLen / 2, yAx + r1 + 6, { size: 11, color: c.muted, align: 'center', baseline: 'top' });
  // F1 arrow on the piston
  const kN = (Rd * 0.55) / (F1_MAX * 4); // px per N, shared by F1 and F2 arrows
  if (F1 > 5) arrow(ctx, pistonX - 10 - F1 * kN - 4, yAx - r1 - 24, pistonX - 6, yAx - r1 - 24, { color: c.accent, width: 2.5 });
  text(ctx, 'F₁', pistonX - 10 - F1 * kN - 8, yAx - r1 - 24, { size: 12, weight: 700, color: c.accent, align: 'right', baseline: 'middle' });

  // brake line
  const pipeR = 3;
  const pipeX0 = mc0 + mcLen;
  const pipeX1 = xd - Rd * 0.36;
  ctx.fillStyle = alpha(fluid, fluidA);
  ctx.fillRect(pipeX0, yAx - pipeR, pipeX1 - pipeX0, pipeR * 2);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(pipeX0, yAx - pipeR);
  ctx.lineTo(pipeX1, yAx - pipeR);
  ctx.moveTo(pipeX0, yAx + pipeR);
  ctx.lineTo(pipeX1, yAx + pipeR);
  ctx.stroke();
  // Pascal: the same pressure pushes on every wall, in every direction
  const pa = 3 + 9 * u;
  if (u > 0.05) {
    for (let x = pipeX0 + 14; x < pipeX1 - 10; x += 22) {
      arrow(ctx, x, yAx - pipeR - 1, x, yAx - pipeR - 1 - pa, { color: alpha(fluid, 0.9), width: 1.2, head: 4 });
      arrow(ctx, x, yAx + pipeR + 1, x, yAx + pipeR + 1 + pa, { color: alpha(fluid, 0.9), width: 1.2, head: 4 });
    }
  }
  // pressure gauge on the line
  const gx = (pipeX0 + pipeX1) / 2;
  const gr = 13;
  const gy = yAx - pipeR - 18 - gr;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(gx, yAx - pipeR);
  ctx.lineTo(gx, gy + gr);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(gx, gy, gr, 0, TAU);
  ctx.fillStyle = c.panel;
  ctx.fill();
  ctx.stroke();
  const ga = Math.PI * 0.75 + u * Math.PI * 1.5;
  ctx.strokeStyle = c.accent2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx + Math.cos(ga) * gr * 0.8, gy + Math.sin(ga) * gr * 0.8);
  ctx.stroke();
  if (!narrow) text(ctx, `p = ${fmt(p / 10, 1)} bar`, gx + gr + 5, gy, { size: 11, weight: 700, mono: true, color: c.accent2, baseline: 'middle' });

  // ----- drum brake -----
  const spin = t * (2.4 * (1 - 0.85 * u)); // drum slows while braking (visual only)
  ctx.beginPath();
  ctx.arc(xd, yd, Rd, 0, TAU);
  ctx.fillStyle = mix(c.panel, c.metal, 0.12);
  ctx.fill();
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = Math.max(4, Rd * 0.07);
  ctx.stroke();
  // rotation marks on the drum rim
  ctx.strokeStyle = alpha(c.panel, 0.9);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const an = spin + (i / 12) * TAU;
    ctx.moveTo(xd + Math.cos(an) * (Rd - 2), yd + Math.sin(an) * (Rd - 2));
    ctx.lineTo(xd + Math.cos(an) * (Rd + 2), yd + Math.sin(an) * (Rd + 2));
  }
  ctx.stroke();
  // shoes: each pivots on the bottom anchor; the wheel cylinder pushes their top ends apart
  const anchor = { x: xd, y: yd + Rd * 0.78 };
  const gap = Rd * 0.06;
  const contact = sstep(0.05, 0.3, u);
  const tilt = (gap / (Rd * 1.4)) * contact; // rad
  const shoeR = Rd * 0.94 - gap;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    ctx.rotate(side * -tilt);
    ctx.translate(-anchor.x, -anchor.y);
    const a0 = side < 0 ? Math.PI * 0.6 : -Math.PI * 0.4;
    const a1 = side < 0 ? Math.PI * 1.4 : Math.PI * 0.4;
    // lining (friction material) + web
    ctx.strokeStyle = contact > 0.9 ? mix(c.warn, c.fire, u) : c.warn;
    ctx.lineWidth = Math.max(4, Rd * 0.08);
    ctx.beginPath();
    ctx.arc(xd, yd, shoeR, a0, a1);
    ctx.stroke();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(xd, yd, shoeR - Rd * 0.06, a0, a1);
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, 3.5, 0, TAU);
  ctx.fillStyle = c.ink;
  ctx.fill();
  // return spring between the shoes
  ctx.strokeStyle = c.muted;
  ctx.lineWidth = 1.2;
  spring(ctx, xd - Rd * 0.55, yd + Rd * 0.25, xd + Rd * 0.55, yd + Rd * 0.25, 7, 7);
  ctx.stroke();
  // wheel cylinder (bore ∝ √ratio) with two opposed pistons, fed from the line
  const wcHalf = Rd * 0.42;
  const push = contact * gap * 0.9;
  ctx.fillStyle = alpha(fluid, fluidA);
  ctx.fillRect(xd - wcHalf * 0.55 - push, yAx - r2, (wcHalf * 0.55 + push) * 2, r2 * 2);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(xd - wcHalf, yAx - r2 - 1, wcHalf * 2, r2 * 2 + 2);
  ctx.fillStyle = c.metal;
  for (const side of [-1, 1]) {
    const px0 = side < 0 ? xd - wcHalf * 0.55 - push - 9 : xd + wcHalf * 0.55 + push;
    ctx.fillRect(px0, yAx - r2 + 1, 9, r2 * 2 - 2);
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(px0, yAx - r2 + 1, 9, r2 * 2 - 2);
  }
  // line enters the wheel cylinder
  ctx.fillStyle = alpha(fluid, fluidA);
  ctx.fillRect(pipeX1, yAx - pipeR, xd - wcHalf * 0.5 - pipeX1, pipeR * 2);
  // F2 arrows pushing the shoes outwards
  if (F2 > 5) {
    const l2 = F2 * kN;
    arrow(ctx, xd - wcHalf - 2, yAx - r2 - 10, xd - wcHalf - 2 - l2, yAx - r2 - 10, { color: c.good, width: 2.5 });
    arrow(ctx, xd + wcHalf + 2, yAx - r2 - 10, xd + wcHalf + 2 + l2, yAx - r2 - 10, { color: c.good, width: 2.5 });
  }
  text(ctx, 'F₂', xd + wcHalf + 2, yAx - r2 - 16, { size: 12, weight: 700, color: c.good, baseline: 'bottom' });
  text(ctx, narrow ? 'A₂' : 'tekerlek silindiri (A₂)', xd, yAx + r2 + 12, { size: 11, color: c.muted, align: 'center', baseline: 'top' });
}

/** Top view of a chassis with four brakes; `share` = braking force fraction per wheel (FL, FR, RL, RR). */
function drawMini(ctx: Ctx, b: Box, c: ThemeColors, u: number, hydraulic: boolean, f: number) {
  const title = hydraulic ? 'Hidrolik: 4 tekerde eşit' : 'Mekanik halat: eşitsiz';
  text(ctx, title, b.x + b.w / 2, b.y + 4, { size: f - 1, weight: 700, color: hydraulic ? c.good : c.bad, align: 'center', baseline: 'top' });
  const share = hydraulic ? [1, 1, 1, 1] : [0.95, 0.55, 0.8, 0.4]; // stretched / badly adjusted cables
  const ch = Math.max(40, b.h - 44);
  const cw = Math.min(b.w * 0.3, ch * 0.5);
  const cx = b.x + b.w / 2;
  const cy = b.y + 22 + ch / 2 + 2;
  roundRect(ctx, cx - cw / 2, cy - ch / 2, cw, ch, cw * 0.3);
  ctx.strokeStyle = c.muted;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const wheels = [
    [cx - cw / 2 - 4, cy - ch * 0.3],
    [cx + cw / 2 + 4, cy - ch * 0.3],
    [cx - cw / 2 - 4, cy + ch * 0.3],
    [cx + cw / 2 + 4, cy + ch * 0.3],
  ];
  const src = { x: cx, y: cy - ch * 0.12 };
  wheels.forEach(([wx, wy], i) => {
    // line from pedal / master cylinder to the wheel
    ctx.strokeStyle = hydraulic ? alpha(c.accent2, 0.35 + 0.6 * u) : c.muted;
    ctx.lineWidth = hydraulic ? 2.5 : 1.2;
    if (!hydraulic) ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(src.x, wy);
    ctx.lineTo(wx, wy);
    ctx.stroke();
    ctx.setLineDash([]);
    // wheel
    ctx.fillStyle = mix(c.ink, c.panel, 0.25);
    roundRect(ctx, wx - 4, wy - 10, 8, 20, 2);
    ctx.fill();
    // braking-force bar next to the wheel
    const side = i % 2 === 0 ? -1 : 1;
    const bl = 26 * share[i] * u;
    const bx = wx + side * 8;
    ctx.fillStyle = share[i] > 0.9 ? c.good : c.bad;
    ctx.fillRect(side < 0 ? bx - bl : bx, wy - 3, bl, 6);
    ctx.strokeStyle = alpha(c.muted, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(side < 0 ? bx - 26 : bx, wy - 3, 26, 6);
  });
  ctx.beginPath();
  ctx.arc(src.x, src.y, 4, 0, TAU);
  ctx.fillStyle = hydraulic ? c.accent2 : c.muted;
  ctx.fill();
  if (!hydraulic && u > 0.3) {
    // uneven force → the car pulls towards the stronger side
    text(ctx, 'sola çeker!', cx, cy + ch / 2 + 6, { size: 11, weight: 700, color: c.bad, align: 'center', baseline: 'top' });
  }
  if (hydraulic && u > 0.3) {
    text(ctx, 'düz durur', cx, cy + ch / 2 + 6, { size: 11, weight: 700, color: c.good, align: 'center', baseline: 'top' });
  }
}

export function HydraulicBrake() {
  const [ratio, setRatio] = useState(2);

  const ref = useCanvasAnimation(
    (ctx, t, w, h, c) => {
      const f = fs(w);
      const narrow = w < 520;
      const u = pedal(t);
      const splitY = h * (narrow ? 0.6 : 0.64);
      drawMain(ctx, { x: 0, y: 0, w, h: splitY }, c, u, ratio, t, f, narrow);
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(12, splitY + 4);
      ctx.lineTo(w - 12, splitY + 4);
      ctx.stroke();
      ctx.setLineDash([]);
      const mh = h - splitY - 10;
      drawMini(ctx, { x: 0, y: splitY + 10, w: w / 2, h: mh }, c, u, true, f);
      drawMini(ctx, { x: w / 2, y: splitY + 10, w: w / 2, h: mh }, c, u, false, f);
    },
    [ratio],
    { aspect: (w) => (w < 520 ? 0.8 : w < 700 ? 1.35 : 1.75), maxHeight: 620 },
  );

  return (
    <AnimFrame
      name="hydraulicBrake"
      canvasRef={ref}
      label="Hidrolik fren: pedal küçük ana silindir pistonunu iter, basınç tüm hatta aynıdır, büyük tekerlek silindiri pistonları pabuçları daha büyük kuvvetle iter. Altta hidrolik ve halatlı frenlerde dört tekerleğin fren kuvveti karşılaştırılıyor."
      controls={
        <Slider
          label="A₂ / A₁"
          value={ratio}
          min={1}
          max={4}
          step={0.1}
          onChange={setRatio}
          format={(v) => `×${fmt(v, 1)}`}
        />
      }
      note={
        <>
          <strong>Pascal ilkesi:</strong> kapalı sıvıya uygulanan basınç her yöne ve her noktaya aynen iletilir (p = F/A).
          Tekerlek pistonu ana pistondan kaç kat büyükse kuvvet o kadar katlanır; bedeli, küçük pistonun daha uzun yol
          almasıdır. Aynı basınç dört tekere eşit dağıldığından araç düz durur (Duesenberg 1921, Lockheed sistemi;
          Chrysler 1924).
        </>
      }
    />
  );
}
