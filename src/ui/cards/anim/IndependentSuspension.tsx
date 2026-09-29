import { useState } from 'react';
import { t } from '../../../i18n';
import { tx } from '../../i18n';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Slider } from './controls';
import { TAU, alpha, deg, fmt, fs, mix, mod, roundRect, spring, text, type Ctx } from './draw';

// front view, metres; x to the right (car's left wheel is on the screen's left), y up, ground y = 0
const TRACK = 1.4;
const R = 0.34; // wheel radius
const TIRE_W = 0.16;
const BODY_CY = 0.95; // body reference point (centre of roll) at rest
const PERIOD = 2.8;

/** Bump height under the left wheel over one loop: a smooth hump, then flat road. */
function bump(t: number, H: number) {
  const x = mod(t, PERIOD) / 1.6;
  return x < 1 ? H * Math.sin(Math.PI * x) ** 2 : 0;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type V = [number, number];

function rot([x, y]: V, a: number): V {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

interface Pose {
  bodyRoll: number; // rad, + = left side up
  bodyHeave: number; // m
  wheels: { c: V; camber: number }[]; // left, right
  axle?: [V, V];
  arms?: { inner: V[]; outer: V[] }[]; // per side: [lower, upper]
  springs: [V, V][];
}

/** Rigid beam axle: both wheels are bolted to one beam, so lifting one tilts both. */
function solidPose(h: number): Pose {
  const cl: V = [-TRACK / 2, R + h];
  const cr: V = [TRACK / 2, R];
  // world-space angle of the beam (y up): negative = clockwise on screen when the left wheel rises
  const tilt = Math.atan2(cr[1] - cl[1], TRACK);
  // the body sits on springs on the beam: it follows most of the beam's tilt and half its rise
  const bodyRoll = tilt * 0.85;
  const bodyHeave = h * 0.45;
  const bodyPt = (p: V): V => {
    const q = rot([p[0], p[1] - BODY_CY], bodyRoll);
    return [q[0], q[1] + BODY_CY + bodyHeave];
  };
  const beam = (x: number): V => [x, R + h * (0.5 - x / TRACK)];
  const seats: V[] = [beam(-0.45), beam(0.45)];
  return {
    bodyRoll,
    bodyHeave,
    wheels: [
      { c: cl, camber: tilt },
      { c: cr, camber: tilt },
    ],
    axle: [cl, cr],
    springs: [
      [seats[0], bodyPt([-0.45, 0.62])],
      [seats[1], bodyPt([0.45, 0.62])],
    ],
  };
}

/** Double wishbone with equal parallel arms: each wheel moves on its own and stays parallel to the body. */
function independentPose(h: number): Pose {
  // body barely moves: only the extra spring force of one compressed spring reaches it
  const bodyRoll = -Math.atan2(h, TRACK) * 0.12;
  const bodyHeave = h * 0.1;
  const bodyPt = (p: V): V => {
    const q = rot([p[0], p[1] - BODY_CY], bodyRoll);
    return [q[0], q[1] + BODY_CY + bodyHeave];
  };
  const LA = 0.36; // arm length
  const wheels: Pose['wheels'] = [];
  const arms: NonNullable<Pose['arms']> = [];
  const springs: [V, V][] = [];
  for (const side of [-1, 1]) {
    const hw = side < 0 ? h : 0;
    const pl = bodyPt([side * 0.3, 0.3]); // lower inner pivot
    const pu = bodyPt([side * 0.3, 0.62]); // upper inner pivot
    // knuckle translates (parallelogram): wheel centre = lower ball joint + fixed offset
    const off = rot([side * 0.1, 0.16], bodyRoll);
    const s = Math.max(-1, Math.min(1, (R + hw - pl[1] - off[1]) / LA));
    const gam = Math.asin(s);
    const kl: V = [pl[0] + side * LA * Math.cos(gam), pl[1] + LA * s];
    const ku: V = [kl[0] + (pu[0] - pl[0]), kl[1] + (pu[1] - pl[1])];
    const wc: V = [kl[0] + off[0], kl[1] + off[1]];
    wheels.push({ c: wc, camber: bodyRoll });
    arms.push({ inner: [pl, pu], outer: [kl, ku] });
    const mid: V = [(pl[0] + kl[0]) / 2 + side * 0.04, (pl[1] + kl[1]) / 2];
    springs.push([mid, bodyPt([side * 0.42, 0.78])]);
  }
  return { bodyRoll, bodyHeave, wheels, arms, springs };
}

function drawScene(ctx: Ctx, b: Box, c: ThemeColors, pose: Pose, h: number, title: string, sub: string, good: boolean, f: number) {
  text(ctx, title, b.x + 12, b.y + 8, { size: f, weight: 700, color: c.ink, baseline: 'top' });
  text(ctx, sub, b.x + 12, b.y + 8 + f * 1.35, { size: 11, color: c.muted, baseline: 'top', maxWidth: b.w - 24 });
  const headH = 8 + f * 1.35 + 20;
  const footH = f * 2.9 + 6;
  const k = Math.min((b.w - 24) / 2.1, (b.h - headH - footH) / 1.75);
  const ox = b.x + b.w / 2;
  const gy = b.y + b.h - footH - 0.1 * k; // ground line
  const P = (p: V): [number, number] => [ox + p[0] * k, gy - p[1] * k];
  const bodyPt = (p: V): V => {
    const q = rot([p[0], p[1] - BODY_CY], pose.bodyRoll);
    return [q[0], q[1] + BODY_CY + pose.bodyHeave];
  };

  // road + bump under the left wheel
  ctx.fillStyle = alpha(c.muted, 0.15);
  ctx.fillRect(b.x + 8, gy, b.w - 16, 6);
  ctx.strokeStyle = c.muted;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(b.x + 8, gy);
  const bx = -TRACK / 2;
  for (let x = -1.05; x <= 1.05; x += 0.02) {
    const d = (x - bx) / 0.28;
    const y = Math.abs(d) < 1 ? h * Math.cos((d * Math.PI) / 2) ** 2 : 0;
    const [sx, sy] = P([x, y]);
    ctx.lineTo(sx, sy);
  }
  ctx.lineTo(b.x + b.w - 8, gy);
  ctx.stroke();
  if (h > 0.01) {
    ctx.fillStyle = alpha(c.warn, 0.35);
    ctx.beginPath();
    for (let x = bx - 0.28; x <= bx + 0.28; x += 0.02) {
      const d = (x - bx) / 0.28;
      const [sx, sy] = P([x, h * Math.cos((d * Math.PI) / 2) ** 2]);
      if (x === bx - 0.28) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.lineTo(...P([bx + 0.28, 0]));
    ctx.closePath();
    ctx.fill();
  }

  // level reference for the body
  const [rx0, ry] = P([-1.0, BODY_CY + 0.5]);
  const [rx1] = P([1.0, 0]);
  ctx.strokeStyle = alpha(c.muted, 0.7);
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rx0, ry);
  ctx.lineTo(rx1, ry);
  ctx.stroke();
  ctx.setLineDash([]);

  // ----- body (front view) -----
  const bodyC = good ? c.accent2 : c.accent;
  const shape: V[] = [
    [-0.8, 0.5], [0.8, 0.5], [0.8, 0.98], [0.55, 1.02], [0.45, 1.45], [-0.45, 1.45], [-0.55, 1.02], [-0.8, 0.98],
  ];
  ctx.beginPath();
  shape.forEach((p, i) => {
    const [sx, sy] = P(bodyPt(p));
    if (i) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  });
  ctx.closePath();
  ctx.fillStyle = alpha(bodyC, 0.28);
  ctx.fill();
  ctx.strokeStyle = mix(bodyC, c.ink, 0.25);
  ctx.lineWidth = 2;
  ctx.stroke();
  // windscreen + a passenger's head (it feels every tilt)
  const win: V[] = [[-0.42, 1.06], [0.42, 1.06], [0.38, 1.38], [-0.38, 1.38]];
  ctx.beginPath();
  win.forEach((p, i) => {
    const [sx, sy] = P(bodyPt(p));
    if (i) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  });
  ctx.closePath();
  ctx.fillStyle = alpha(c.panel, 0.9);
  ctx.fill();
  ctx.stroke();
  const [hx, hy] = P(bodyPt([-0.2, 1.2]));
  ctx.beginPath();
  ctx.arc(hx, hy, 0.08 * k, 0, TAU);
  ctx.fillStyle = mix(c.ink, c.panel, 0.3);
  ctx.fill();
  // headlamps + grille
  for (const s of [-1, 1]) {
    const [lx, ly] = P(bodyPt([s * 0.6, 0.8]));
    ctx.beginPath();
    ctx.arc(lx, ly, 0.08 * k, 0, TAU);
    ctx.fillStyle = alpha(c.warn, 0.4);
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.beginPath();
  [[-0.15, 0.58], [0.15, 0.58], [0.15, 0.92], [-0.15, 0.92]].forEach((p, i) => {
    const [sx, sy] = P(bodyPt(p as V));
    if (i) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  });
  ctx.closePath();
  ctx.fillStyle = c.metal;
  ctx.fill();

  // ----- suspension links -----
  ctx.lineCap = 'round';
  if (pose.axle) {
    const [a, bb] = pose.axle;
    ctx.strokeStyle = mix(c.metal, c.ink, 0.45);
    ctx.lineWidth = Math.max(5, 0.07 * k);
    ctx.beginPath();
    ctx.moveTo(...P(a));
    ctx.lineTo(...P(bb));
    ctx.stroke();
  }
  if (pose.arms) {
    ctx.strokeStyle = mix(c.metal, c.ink, 0.45);
    ctx.lineWidth = Math.max(3, 0.045 * k);
    for (const arm of pose.arms) {
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(...P(arm.inner[i]));
        ctx.lineTo(...P(arm.outer[i]));
        ctx.stroke();
      }
      // upright (knuckle)
      ctx.beginPath();
      ctx.moveTo(...P(arm.outer[0]));
      ctx.lineTo(...P(arm.outer[1]));
      ctx.stroke();
      ctx.fillStyle = c.ink;
      for (const p of [...arm.inner, ...arm.outer]) {
        const [px, py] = P(p);
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.lineCap = 'butt';
  // springs
  ctx.strokeStyle = good ? c.good : c.warn;
  ctx.lineWidth = 1.8;
  for (const [a, bb] of pose.springs) {
    const [x1, y1] = P(a);
    const [x2, y2] = P(bb);
    spring(ctx, x1, y1, x2, y2, 6, 0.1 * k);
    ctx.stroke();
  }

  // ----- wheels -----
  for (const wh of pose.wheels) {
    const [cx, cy] = P(wh.c);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-wh.camber);
    roundRect(ctx, (-TIRE_W / 2) * k, -R * k, TIRE_W * k, 2 * R * k, 0.05 * k);
    ctx.fillStyle = mix(c.ink, c.panel, 0.12);
    ctx.fill();
    // wheel plane line
    ctx.strokeStyle = alpha(c.panel, 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -R * k * 0.9);
    ctx.lineTo(0, R * k * 0.9);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, 0.07 * k, 0, TAU);
    ctx.fillStyle = c.metal;
    ctx.fill();
    // vertical reference to make camber visible
    ctx.strokeStyle = alpha(c.bad, 0.8);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * k * 1.15);
    ctx.lineTo(cx, cy - R * k * 0.55);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ----- readouts -----
  const tilt = Math.abs(deg(pose.bodyRoll));
  const camL = Math.abs(deg(pose.wheels[0].camber));
  const camR = Math.abs(deg(pose.wheels[1].camber));
  const y0 = b.y + b.h - footH + 6;
  const col = (v: number, lim: number) => (v > lim ? c.bad : c.good);
  let x = b.x + 12;
  const kv = (label: string, v: string, color: string) => {
    const lw = text(ctx, label, x, y0, { size: 11, color: c.muted, baseline: 'top' });
    const vw = text(ctx, v, x + lw + 5, y0, { size: 11, weight: 700, mono: true, color, baseline: 'top' });
    x += lw + vw + 16;
  };
  kv(t('Gövde eğimi'), `${fmt(tilt, 1)}°`, col(tilt, 1.5));
  kv(t('Kamber'), t('sol {l}° · sağ {r}°', { l: fmt(camL, 1), r: fmt(camR, 1) }), col(Math.max(camL, camR), 1.5));
  if (!good && h > 0.02) {
    text(ctx, t('Tümsek diğer tekerleği de eğdi'), b.x + 12, y0 + f * 1.35, { size: 11, weight: 700, color: c.bad, baseline: 'top' });
  } else if (good && h > 0.02) {
    text(ctx, t('Yalnız tümseğe çıkan teker hareket etti'), b.x + 12, y0 + f * 1.35, { size: 11, weight: 700, color: c.good, baseline: 'top' });
  }
}

export function IndependentSuspension() {
  const [H, setH] = useState(10); // cm

  const ref = useCanvasAnimation(
    (ctx, time, w, h, c) => {
      const f = fs(w);
      const bh = bump(time, H / 100);
      const wide = w >= 620;
      const A: Box = wide ? { x: 0, y: 0, w: w / 2, h } : { x: 0, y: 0, w, h: h / 2 };
      const B: Box = wide ? { x: w / 2, y: 0, w: w / 2, h } : { x: 0, y: h / 2, w, h: h / 2 };
      drawScene(ctx, A, c, solidPose(bh), bh, t('Sabit (rijit) aks'), t('İki teker tek kirişe bağlı'), false, f);
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
      drawScene(ctx, B, c, independentPose(bh), bh, t('Bağımsız süspansiyon'), t('Her tekerin kendi salıncak kolları var'), true, f);
    },
    [H],
    { aspect: (w) => (w >= 620 ? 2.0 : 0.62) },
  );

  return (
    <AnimFrame
      name="independentSuspension"
      canvasRef={ref}
      label={t(
        'Önden görünüş: sol teker tümseğe çıkıyor. Sabit aksta tüm aks ve gövde yatıyor, iki teker de eğiliyor; bağımsız süspansiyonda yalnız o teker hareket ediyor, gövde düz kalıyor.',
      )}
      controls={
        <Slider label={t('Tümsek')} value={H} min={3} max={16} step={1} onChange={setH} format={(v) => t('{v} cm', { v })} />
      }
      note={tx(
        'Sabit aksta iki teker aynı kirişe bağlıdır: biri tümseğe çıkınca kiriş yatar, <strong>öteki teker de eğilir</strong>, gövde sallanır, direksiyon titrer (“shimmy”). Bağımsız süspansiyonda her teker kendi kollarıyla yaylanır; yolla temas ve konfor artar (GM “Knee-Action”, Mercedes, Citroën: 1930’lar).',
      )}
    />
  );
}
