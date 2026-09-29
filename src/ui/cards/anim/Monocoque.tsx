import { useState } from 'react';
import { t } from '../../../i18n';
import { tx } from '../../i18n';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Toggle } from './controls';
import { TAU, alpha, arrow, fmt, fs, mix, rad, text, type Ctx } from './draw';

type Load = 'torsion' | 'bending';

const LX = 4; // m, car length (rear x=0 → front x=LX)
const W = 1.4; // m, body width
// side profiles (x, y) in metres; the ladder car's body sits on top of the frame, the monocoque is lower
const BODY_LADDER: [number, number][] = [
  [0.2, 0.18], [0.2, 0.72], [1.2, 0.78], [1.5, 1.28], [2.6, 1.28], [2.9, 0.78], [3.85, 0.72], [3.85, 0.18],
];
const BODY_MONO: [number, number][] = [
  [0.2, 0.02], [0.2, 0.62], [1.2, 0.68], [1.5, 1.14], [2.6, 1.14], [2.9, 0.68], [3.85, 0.6], [3.85, 0.02],
];
const AXLES = [0.62, 3.38];

// Exaggerated so the difference is visible; the ratio (~3×) is the point.
const TWIST = { ladder: rad(13), mono: rad(13 / 3) };
const SAG = { ladder: 0.2, mono: 0.2 / 3 };

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type P3 = [number, number, number];

function makeProjector(b: Box, load: Load, amt: number, kind: 'ladder' | 'mono') {
  // oblique projection: depth (z) goes up and to the right
  const zx = 0.42;
  const zy = 0.3;
  const spanX = LX + W * zx;
  // vertical extent: roof far edge (1.28 + W/2·zy) down to the wheel supports (−0.35 − W/2·zy)
  const yTop = 1.3 + (W / 2) * zy;
  const yBot = -0.38 - (W / 2) * zy;
  const k = Math.min((b.w - 24) / spanX, (b.h - 36) / (yTop - yBot));
  const ox = b.x + (b.w - spanX * k) / 2 + (W / 2) * zx * k;
  const oy = b.y + 18 + (b.h - 36) / 2 + ((yTop + yBot) / 2) * k;
  const twist = TWIST[kind] * amt;
  const sag = SAG[kind] * amt;
  return {
    k,
    p(x: number, y: number, z: number): [number, number] {
      let yy = y;
      let zz = z;
      if (load === 'torsion') {
        // twist grows linearly from rear (−θ) to front (+θ) about a longitudinal axis at y = 0.3 m
        const phi = twist * ((2 * x) / LX - 1);
        const cy = 0.3;
        const dy = yy - cy;
        yy = cy + dy * Math.cos(phi) - zz * Math.sin(phi);
        zz = dy * Math.sin(phi) + zz * Math.cos(phi);
      } else {
        // simply-supported beam under a central load: deflection ~ sin(πx/L)
        yy -= sag * Math.sin((Math.PI * x) / LX);
      }
      return [ox + (x + zz * zx) * k, oy - (yy + zz * zy) * k];
    },
  };
}

function poly(ctx: Ctx, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
}

/** Polyline between two 3D points, sampled so deformation shows as a curve. */
function seg(ctx: Ctx, pr: (x: number, y: number, z: number) => [number, number], a: P3, b: P3, n = 12) {
  for (let i = 0; i <= n; i++) {
    const q = i / n;
    const [x, y] = pr(a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
}

/** Like seg() but continues the current path instead of starting a new sub-path. */
function lineSeg(ctx: Ctx, pr: (x: number, y: number, z: number) => [number, number], a: P3, b: P3, n = 12) {
  for (let i = 0; i <= n; i++) {
    const q = i / n;
    const [x, y] = pr(a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, a[2] + (b[2] - a[2]) * q);
    ctx.lineTo(x, y);
  }
}

function drawBody(ctx: Ctx, pr: (x: number, y: number, z: number) => [number, number], prof: [number, number][], fill: string, stroke: string, c: ThemeColors) {
  const zf = W / 2;
  const zn = -W / 2;
  // far side outline
  ctx.strokeStyle = alpha(stroke, 0.45);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < prof.length; i++) {
    const a = prof[i];
    const b = prof[(i + 1) % prof.length];
    seg(ctx, pr, [a[0], a[1], zf], [b[0], b[1], zf]);
  }
  ctx.stroke();
  // roof and bonnet surfaces (top faces)
  for (let i = 0; i < prof.length - 1; i++) {
    const a = prof[i];
    const b = prof[i + 1];
    if (b[0] <= a[0] + 0.01) continue; // only faces that run front-wards on top
    ctx.beginPath();
    seg(ctx, pr, [a[0], a[1], zn], [b[0], b[1], zn]);
    lineSeg(ctx, pr, [b[0], b[1], zf], [a[0], a[1], zf]);
    ctx.closePath();
    ctx.fillStyle = alpha(fill, 0.22);
    ctx.fill();
  }
  // edges across the width
  ctx.strokeStyle = alpha(stroke, 0.7);
  ctx.beginPath();
  for (const [x, y] of prof) seg(ctx, pr, [x, y, zn], [x, y, zf], 4);
  ctx.stroke();
  // near side face
  ctx.beginPath();
  for (let i = 0; i < prof.length; i++) {
    const a = prof[i];
    const b = prof[(i + 1) % prof.length];
    const n = 12;
    for (let j = i === 0 ? 0 : 1; j <= n; j++) {
      const q = j / n;
      const [px, py] = pr(a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, zn);
      if (i === 0 && j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fillStyle = alpha(fill, 0.5);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // window on the near side
  const win: [number, number][] = [
    [1.62, 0.84], [1.62, 1.18], [2.5, 1.18], [2.72, 0.84],
  ];
  const wy = prof === BODY_MONO ? -0.1 : 0;
  poly(ctx, win.map(([x, y]) => pr(x, y + wy, zn)));
  ctx.closePath();
  ctx.fillStyle = alpha(c.panel, 0.85);
  ctx.fill();
  ctx.strokeStyle = alpha(stroke, 0.8);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function wheel(ctx: Ctx, pr: (x: number, y: number, z: number) => [number, number], x: number, z: number, r: number, c: ThemeColors, k: number, back: boolean) {
  const [cx, cy] = pr(x, 0.05, z);
  ctx.beginPath();
  ctx.arc(cx, cy, r * k, 0, TAU);
  ctx.fillStyle = back ? mix(c.ink, c.panel, 0.6) : mix(c.ink, c.panel, 0.15);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r * k * 0.45, 0, TAU);
  ctx.fillStyle = c.metal;
  ctx.fill();
}

function drawPanel(ctx: Ctx, b: Box, c: ThemeColors, load: Load, amt: number, kind: 'ladder' | 'mono', f: number) {
  const title = kind === 'ladder' ? t('Şasi + gövde (merdiven şasi)') : t('Monokok (yekpare gövde)');
  const sub = kind === 'ladder' ? t('Gövde, cıvatalarla şasinin üstüne oturur') : t('Taban, yan ve tavan tek kutu: yükü birlikte taşır');
  text(ctx, title, b.x + 12, b.y + 8, { size: f, weight: 700, color: c.ink, baseline: 'top', maxWidth: b.w - 20 });
  text(ctx, sub, b.x + 12, b.y + 8 + f * 1.35, { size: 11, color: c.muted, baseline: 'top', maxWidth: b.w - 20 });

  const barsH = 58;
  const draw: Box = { x: b.x, y: b.y + 8 + f * 1.35 + 22, w: b.w, h: b.h - (8 + f * 1.35 + 22) - barsH };
  const pj = makeProjector(draw, load, amt, kind);
  const pr = pj.p;
  const k = pj.k;
  const bodyColor = kind === 'ladder' ? c.accent2 : c.accent;

  // far wheels first
  for (const x of AXLES) wheel(ctx, pr, x, W / 2 + 0.05, 0.3, c, k, true);

  if (kind === 'ladder') {
    // body first (it sits above), then the frame rails & cross-members drawn over its lower edge
    drawBody(ctx, pr, BODY_LADDER, bodyColor, mix(bodyColor, c.ink, 0.3), c);
    const zr = 0.45;
    ctx.strokeStyle = mix(c.metal, c.ink, 0.45);
    ctx.lineCap = 'round';
    // cross-members
    ctx.lineWidth = Math.max(2, k * 0.05);
    ctx.beginPath();
    for (const x of [0.05, 0.9, 2.0, 3.0, 3.95]) seg(ctx, pr, [x, 0.08, -zr], [x, 0.08, zr], 4);
    ctx.stroke();
    // side rails (C-channel seen as a thick band)
    for (const z of [zr, -zr]) {
      ctx.lineWidth = Math.max(3, k * 0.09);
      ctx.strokeStyle = z > 0 ? mix(c.metal, c.panel, 0.2) : mix(c.metal, c.ink, 0.35);
      ctx.beginPath();
      seg(ctx, pr, [0, 0.08, z], [LX, 0.08, z], 24);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // body mounting bolts
    ctx.fillStyle = c.ink;
    for (const x of [0.5, 1.6, 2.6, 3.5]) {
      const [bx, by] = pr(x, 0.16, -zr);
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, TAU);
      ctx.fill();
    }
  } else {
    drawBody(ctx, pr, BODY_MONO, bodyColor, mix(bodyColor, c.ink, 0.3), c);
    // floor pan + box-section sills (part of the shell)
    ctx.strokeStyle = mix(bodyColor, c.ink, 0.45);
    ctx.lineWidth = Math.max(3, k * 0.07);
    ctx.beginPath();
    seg(ctx, pr, [0.2, 0.05, -W / 2], [3.85, 0.05, -W / 2], 24);
    ctx.stroke();
  }
  // near wheels
  for (const x of AXLES) wheel(ctx, pr, x, -W / 2 - 0.05, 0.3, c, k, false);

  // loads
  const L = Math.abs(amt);
  if (load === 'torsion') {
    // front wheels pushed opposite ways (one on a bump, one in a hole); rear held
    const fx = AXLES[1];
    const s = Math.sign(amt) || 1;
    const len = 12 + 22 * L;
    const wr = 0.3 * k; // wheel radius in px
    // near wheel pushed one way, far wheel the other; arrows always end on the tyre
    for (const [z, dir] of [
      [-W / 2 - 0.05, s],
      [W / 2 + 0.05, -s],
    ] as const) {
      const [wx, wy] = pr(fx, 0.05, z);
      const col = z < 0 ? c.bad : alpha(c.bad, 0.6);
      if (dir > 0) arrow(ctx, wx, wy + wr + 2 + len, wx, wy + wr + 2, { color: col, width: 2.5 });
      else arrow(ctx, wx, wy - wr - 2 - len, wx, wy - wr - 2, { color: col, width: 2.5 });
    }
    for (const z of [-W / 2 - 0.05, W / 2 + 0.05]) {
      const [rx, ry] = pr(AXLES[0], -0.25, z);
      ctx.fillStyle = z < 0 ? c.muted : alpha(c.muted, 0.5);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 7, ry + 10);
      ctx.lineTo(rx + 7, ry + 10);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    const [mx, my] = pr(LX / 2, kind === 'ladder' ? 1.28 : 1.14, 0);
    arrow(ctx, mx, my - 44, mx, my - 44 + 16 + 22 * L, { color: c.bad, width: 3 });
    text(ctx, t('yük'), mx + 8, my - 42, { size: 11, weight: 700, color: c.bad, baseline: 'top' });
    for (const x of AXLES) {
      const [rx, ry] = pr(x, -0.25, -W / 2 - 0.05);
      ctx.fillStyle = c.muted;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 7, ry + 10);
      ctx.lineTo(rx + 7, ry + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  // live deformation readout
  if (load === 'torsion') {
    const def = t('burulma {v}°', { v: fmt((TWIST[kind] * 180 * amt) / Math.PI, 1) });
    text(ctx, def, b.x + b.w - 12, draw.y + 2, { size: 11, weight: 700, mono: true, color: c.bad, align: 'right', baseline: 'top' });
  }

  // bars: weight & stiffness (relative, era-typical)
  const weight = kind === 'ladder' ? 1 : 0.8;
  const stiff = kind === 'ladder' ? 1 : 3;
  const bx = b.x + 12;
  const bw = b.w - 24;
  const labW = 94;
  const by = b.y + b.h - barsH + 8;
  const bar = (y: number, label: string, v: number, max: number, color: string, txt: string) => {
    text(ctx, label, bx, y + 5, { size: 11, color: c.ink, baseline: 'middle' });
    ctx.fillStyle = alpha(c.line, 0.7);
    ctx.fillRect(bx + labW, y, bw - labW - 44, 10);
    ctx.fillStyle = color;
    ctx.fillRect(bx + labW, y, (bw - labW - 44) * (v / max), 10);
    text(ctx, txt, bx + bw, y + 5, { size: 11, weight: 700, mono: true, color: c.ink, align: 'right', baseline: 'middle' });
  };
  bar(by, t('Ağırlık'), weight, 1, c.muted, `${Math.round(weight * 100)}`);
  bar(by + 22, t('Rijitlik'), stiff, 3, c.good, `${stiff}×`);
}

export function Monocoque() {
  const [load, setLoad] = useState<Load>('torsion');

  const ref = useCanvasAnimation(
    (ctx, t, w, h, c) => {
      const f = fs(w);
      // torsion swings both ways; bending only pushes down
      const amt = load === 'torsion' ? Math.sin(t * 1.5) : (1 - Math.cos(t * 1.5)) / 2;
      const wide = w >= 600;
      const A: Box = wide ? { x: 0, y: 0, w: w / 2, h } : { x: 0, y: 0, w, h: h / 2 };
      const B: Box = wide ? { x: w / 2, y: 0, w: w / 2, h } : { x: 0, y: h / 2, w, h: h / 2 };
      drawPanel(ctx, A, c, load, amt, 'ladder', f);
      ctx.strokeStyle = c.line;
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (wide) {
        ctx.moveTo(w / 2, 10);
        ctx.lineTo(w / 2, h - 10);
      } else {
        ctx.moveTo(12, h / 2);
        ctx.lineTo(w - 12, h / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      drawPanel(ctx, B, c, load, amt, 'mono', f);
    },
    [load],
    { aspect: (w) => (w >= 600 ? 1.95 : 0.62) },
  );

  return (
    <AnimFrame
      name="monocoque"
      canvasRef={ref}
      label={t('Merdiven şasili araç ile monokok gövdeli araç aynı burulma ya da eğilme yükü altında: merdiven şasi belirgin şekilde daha çok esniyor.')}
      controls={
        <Toggle
          label={t('Yük')}
          value={load}
          options={[
            { value: 'torsion', label: t('Burulma') },
            { value: 'bending', label: t('Eğilme') },
          ]}
          onChange={setLoad}
        />
      }
      note={tx(
        'Açık profilli iki kiriş (merdiven) burulmaya zayıftır; kapalı bir kutu ise aynı malzemeyle kat kat rijittir. Monokokta gövde sacı da yük taşır: araç <strong>daha hafif, daha alçak ve daha rijit</strong> olur (Lancia Lambda 1922; Citroën Traction Avant 1934 yaygınlaştırdı). Bedeli: pahalı pres kalıpları, zor onarım ve model değişikliği. Esnemeler görünür olsun diye abartılmıştır.',
      )}
    />
  );
}
