import { useRef, useState } from 'react';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Button, Toggle } from './controls';
import { TAU, alpha, arrow, clamp, fmt, fs, hash01, lerp, mix, mod, sstep, text, type Ctx } from './draw';

const RPM_SHAFT = 900; // output shaft + sleeve: tied to the rolling car (huge inertia) → stays put
const RPM_GEAR = 1500; // free gear: spun by the engine via the countershaft (clutch pressed)
const VIS = 1 / 700; // on-screen revolutions per second per rpm

type Phase = 'neutral' | 'approach' | 'sync' | 'engage' | 'engaged' | 'clash' | 'release';

interface Sim {
  phase: Phase;
  since: number;
  sleeve: number; // 0 = neutral, CONTACT = touching ring/teeth, 1 = fully engaged
  gearRpm: number;
  shaftAng: number;
  gearAng: number;
  heat: number;
  pressed: boolean;
  sparks: { x: number; y: number; vx: number; vy: number; life: number }[];
  synchro: boolean;
}

const CONTACT = 0.18;

function step(s: Sim, t: number, dt: number) {
  const age = t - s.since;
  const go = (p: Phase) => {
    s.phase = p;
    s.since = t;
  };
  switch (s.phase) {
    case 'neutral':
      s.sleeve = 0;
      s.gearRpm += (RPM_GEAR - s.gearRpm) * clamp(dt / 0.5, 0, 1);
      if (s.pressed || age > 2.4) go('approach'); // auto-demo when left alone
      break;
    case 'approach':
      s.sleeve = CONTACT * sstep(0, 0.45, age);
      if (age > 0.5) go(s.synchro ? 'sync' : 'clash');
      break;
    case 'sync':
      // brass cone rubs on the gear cone: friction drags the light gear to the shaft's speed
      s.sleeve = CONTACT;
      s.gearRpm += (RPM_SHAFT - s.gearRpm) * clamp(dt / 0.28, 0, 1);
      s.heat = Math.min(1, s.heat + dt * 2.5);
      if (Math.abs(s.gearRpm - RPM_SHAFT) < 4 && age > 0.6) {
        s.gearRpm = RPM_SHAFT;
        go('engage');
      }
      break;
    case 'engage':
      s.gearRpm = RPM_SHAFT;
      s.sleeve = lerp(CONTACT, 1, sstep(0, 0.45, age));
      if (age > 0.5) go('engaged');
      break;
    case 'engaged':
      s.sleeve = 1;
      s.gearRpm = RPM_SHAFT;
      if (age > 2.2) go('release');
      break;
    case 'clash':
      // teeth hit each other at a speed difference: the sleeve is kicked back again and again
      s.sleeve = CONTACT - Math.abs(Math.sin(age * 38)) * 0.05 - 0.01;
      s.gearRpm = RPM_GEAR + Math.sin(age * 50) * 30;
      if (age > 1.5) go('release');
      break;
    case 'release':
      s.sleeve = s.sleeve * (1 - clamp(dt / 0.12, 0, 1));
      if (age > 0.6) go('neutral');
      break;
  }
  if (s.phase !== 'neutral') s.pressed = false;
  if (s.phase !== 'sync') s.heat = Math.max(0, s.heat - dt * 0.8);
  s.shaftAng += RPM_SHAFT * VIS * TAU * dt;
  s.gearAng += s.gearRpm * VIS * TAU * dt;
  if (s.phase === 'engage' || s.phase === 'engaged') {
    // chamfered teeth index the parts by a fraction of a tooth so teeth meet gaps (8 = comb teeth per turn)
    const d = ((s.shaftAng - s.gearAng) / TAU) * 8;
    const err = d - Math.round(d);
    s.gearAng += ((err * TAU) / 8) * (s.phase === 'engaged' ? 1 : clamp(dt / 0.08, 0, 1));
  }
  // spark particles
  for (const p of s.sparks) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt;
    p.life -= dt;
  }
  s.sparks = s.sparks.filter((p) => p.life > 0);
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function dial(ctx: Ctx, cx: number, cy: number, r: number, ang: number, color: string, c: ThemeColors) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = alpha(color, 0.15);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = ang + (i / 3) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85);
    ctx.strokeStyle = i === 0 ? color : alpha(color, 0.45);
    ctx.lineWidth = i === 0 ? 3 : 1.5;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, TAU);
  ctx.fillStyle = c.ink;
  ctx.fill();
}

function drawDials(ctx: Ctx, b: Box, c: ThemeColors, s: Sim, f: number) {
  const r = Math.min(b.h * 0.34, 26);
  const cyD = b.y + b.h / 2;
  const items = [
    { x: b.x + 12 + r, ang: s.shaftAng, rpm: RPM_SHAFT, color: c.accent2, label: 'Kovan + mil', sub: 'tekerleklere bağlı' },
    { x: b.x + b.w / 2 + 6 + r, ang: s.gearAng, rpm: s.gearRpm, color: c.accent, label: 'Dişli', sub: 'motor tarafı' },
  ];
  for (const it of items) {
    dial(ctx, it.x, cyD, r, it.ang, it.color, c);
    const tx = it.x + r + 8;
    text(ctx, it.label, tx, cyD - f * 0.55, { size: f - 1, weight: 700, color: it.color, baseline: 'bottom' });
    text(ctx, `${fmt(Math.round(it.rpm / 10) * 10)} d/dk`, tx, cyD, { size: f, weight: 700, mono: true, color: c.ink, baseline: 'middle' });
    if (b.w >= 420) text(ctx, it.sub, tx, cyD + f * 0.6, { size: 11, color: c.muted, baseline: 'top' });
  }
}

/** Axial half-section (mirrored): shaft, hub + sliding sleeve, brass synchro ring, gear with cone & dog teeth. */
function drawSection(ctx: Ctx, b: Box, c: ThemeColors, s: Sim) {
  const U = Math.min(b.w / 6.2, (b.h - 24) / 5.6, 54);
  const x0 = b.x + (b.w - 5.4 * U) / 2 + 0.2 * U;
  const yc = b.y + 18 + (b.h - 18) / 2;
  const X = (u: number) => x0 + u * U;
  const shaftC = c.accent2;
  const gearC = c.accent;
  const brass = c.warn;
  const sleeveOff = s.sleeve * 1.15; // U
  const ringPush = s.sleeve >= CONTACT - 0.02 ? 0.05 : 0;
  const scroll = (ang: number, pitch: number) => mod((ang / TAU) * pitch * 6, pitch);

  text(ctx, 'Kesit', b.x + 10, b.y + 4, { size: 11, weight: 700, color: c.muted, baseline: 'top' });

  for (const sgn of [-1, 1]) {
    const Y = (v: number) => yc - sgn * v * U;
    const rect = (u0: number, u1: number, v0: number, v1: number) => {
      const ya = Y(v0);
      const yb = Y(v1);
      ctx.beginPath();
      ctx.rect(X(u0), Math.min(ya, yb), (u1 - u0) * U, Math.abs(yb - ya));
    };
    const stripes = (u0: number, u1: number, v0: number, v1: number, pitch: number, ang: number, slant: number, color: string, lw: number) => {
      ctx.save();
      rect(u0, u1, v0, v1);
      ctx.clip();
      const ya = Math.min(Y(v0), Y(v1));
      const yb = Math.max(Y(v0), Y(v1));
      const off = scroll(ang, pitch);
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let yy = ya - pitch * 3 + off; yy < yb + pitch * 2; yy += pitch) {
        ctx.moveTo(X(u0), yy);
        ctx.lineTo(X(u1), yy + slant);
      }
      ctx.stroke();
      ctx.restore();
    };
    // gear: body with dog-tooth ring and cone (one piece, free on the shaft)
    ctx.beginPath();
    ctx.moveTo(X(2.15), Y(0.34));
    ctx.lineTo(X(2.15), Y(0.62));
    ctx.lineTo(X(2.7), Y(0.8));
    ctx.lineTo(X(2.7), Y(1.18));
    ctx.lineTo(X(3.25), Y(1.18));
    ctx.lineTo(X(3.25), Y(1.35));
    ctx.lineTo(X(3.35), Y(1.35));
    ctx.lineTo(X(3.35), Y(2.5));
    ctx.lineTo(X(5.2), Y(2.5));
    ctx.lineTo(X(5.2), Y(0.34));
    ctx.closePath();
    ctx.fillStyle = mix(gearC, c.panel, 0.55);
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // gear teeth (helical) and dog-tooth ring: stripes scroll with the gear's rotation
    stripes(3.35, 5.2, 1.5, 2.5, U * 0.32, s.gearAng, U * 0.5, alpha(gearC, 0.9), 2);
    stripes(2.7, 3.25, 0.8, 1.18, U * 0.16, s.gearAng, 0, alpha(gearC, 0.9), 1.5);

    // brass synchro ring on the cone
    const rp = ringPush;
    ctx.beginPath();
    ctx.moveTo(X(2.08 + rp), Y(0.7));
    ctx.lineTo(X(2.62 + rp), Y(0.88));
    ctx.lineTo(X(2.62 + rp), Y(1.18));
    ctx.lineTo(X(2.08 + rp), Y(1.18));
    ctx.closePath();
    ctx.fillStyle = mix(brass, c.fire, s.heat * 0.7);
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (s.heat > 0.05) {
      ctx.strokeStyle = alpha(c.fire, s.heat);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X(2.12 + rp), Y(0.68));
      ctx.lineTo(X(2.62 + rp), Y(0.85));
      ctx.stroke();
    }

    // hub (splined to the shaft)
    rect(0, 2.0, 0.34, 1.18);
    ctx.fillStyle = mix(shaftC, c.panel, 0.55);
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // sleeve (slides on the hub, fork groove on the outside)
    const su = sleeveOff;
    ctx.beginPath();
    ctx.moveTo(X(su), Y(1.18));
    ctx.lineTo(X(su), Y(1.85));
    ctx.lineTo(X(su + 0.7), Y(1.85));
    ctx.lineTo(X(su + 0.7), Y(1.62));
    ctx.lineTo(X(su + 1.3), Y(1.62));
    ctx.lineTo(X(su + 1.3), Y(1.85));
    ctx.lineTo(X(su + 2.0), Y(1.85));
    ctx.lineTo(X(su + 2.08), Y(1.25));
    ctx.lineTo(X(su + 2.0), Y(1.18));
    ctx.closePath();
    ctx.fillStyle = shaftC;
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.stroke();
    // sleeve internal splines scroll with the shaft
    stripes(su, su + 2.0, 1.18, 1.62, U * 0.16, s.shaftAng, 0, alpha(c.panel, 0.5), 1.5);
  }
  // shaft
  ctx.fillStyle = c.metal;
  ctx.fillRect(b.x + 6, yc - 0.3 * U, b.w - 12, 0.6 * U);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(b.x + 6, yc - 0.3 * U, b.w - 12, 0.6 * U);
  ctx.setLineDash([6, 3, 1, 3]);
  ctx.strokeStyle = c.muted;
  ctx.beginPath();
  ctx.moveTo(b.x + 6, yc);
  ctx.lineTo(b.x + b.w - 6, yc);
  ctx.stroke();
  ctx.setLineDash([]);
  // shift fork in the groove
  const fx = X(sleeveOff + 1.0);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = Math.max(3, U * 0.14);
  ctx.beginPath();
  ctx.moveTo(fx, yc - 1.7 * U);
  ctx.lineTo(fx, b.y + 16);
  ctx.stroke();
  text(ctx, 'çatal', fx + 6, b.y + 18, { size: 11, color: c.muted, baseline: 'top' });
  if (s.phase === 'approach' || s.phase === 'engage' || s.phase === 'clash') {
    arrow(ctx, fx + 6, b.y + 18 + 18, fx + 6 + U * 0.9, b.y + 18 + 18, { color: c.ink, width: 2, head: 7 });
  }
  // labels
  const lab = (s1: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center') =>
    text(ctx, s1, x, y, { size: 11, weight: 700, color, align, baseline: 'top' });
  lab('kovan', X(sleeveOff + 1.0), yc + 1.95 * U, shaftC);
  lab('pirinç halka', X(2.35), yc + 2.35 * U, mix(brass, c.ink, 0.25), 'center');
  lab('dişli', X(4.3), yc + 2.6 * U, gearC);

  // sparks at the teeth when clashing
  for (const p of s.sparks) {
    ctx.fillStyle = alpha(p.life > 0.15 ? c.fire : c.warn, clamp(p.life * 3, 0, 1));
    ctx.fillRect(p.x, p.y, 2.5, 2.5);
  }
  return { x: X(2.1 + 0.05), y: yc - 1.2 * U };
}

/** Unrolled view of the dog teeth: the sleeve's teeth (top) must drop into the gear's gaps (bottom). */
function drawComb(ctx: Ctx, b: Box, c: ThemeColors, s: Sim) {
  text(ctx, 'Dişlerin açılımı', b.x + 10, b.y + 4, { size: 11, weight: 700, color: c.muted, baseline: 'top' });
  const pitch = clamp(b.w / 7, 22, 40);
  const tw = pitch * 0.5;
  const th = clamp(b.h * 0.2, 14, 30);
  const midY = b.y + 20 + (b.h - 20) / 2;
  // axial gap closes as the sleeve moves: at CONTACT the tips touch, at 1 teeth overlap fully
  const e = s.sleeve;
  const gap = e <= CONTACT ? lerp(th * 1.1, 0, e / CONTACT) : -th * ((e - CONTACT) / (1 - CONTACT)) * 0.85;
  const gearTop = midY + 2; // tips of gear teeth
  const sleeveTip = gearTop - gap;
  const x0 = b.x + 8;
  const x1 = b.x + b.w - 8;
  // circumferential offsets from each part's rotation (relative phase is what matters)
  const offS = mod((s.shaftAng / TAU) * pitch * 8, pitch);
  const offG = mod((s.gearAng / TAU) * pitch * 8 + pitch / 2, pitch);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, b.y + 18, x1 - x0, b.h - 20);
  ctx.clip();
  const tooth = (x: number, tipY: number, dir: 1 | -1, color: string) => {
    // chamfered dog tooth (dir = 1 points down, -1 points up)
    ctx.beginPath();
    ctx.moveTo(x - tw / 2, tipY - dir * th);
    ctx.lineTo(x - tw / 2, tipY - dir * th * 0.3);
    ctx.lineTo(x, tipY);
    ctx.lineTo(x + tw / 2, tipY - dir * th * 0.3);
    ctx.lineTo(x + tw / 2, tipY - dir * th);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  // gear teeth (bottom) + base
  ctx.fillStyle = mix(c.accent, c.panel, 0.55);
  ctx.fillRect(x0, gearTop + th, x1 - x0, 10);
  for (let x = x0 - pitch + offG; x < x1 + pitch; x += pitch) tooth(x, gearTop, -1, c.accent);
  // sleeve teeth (top) + base
  ctx.fillStyle = mix(c.accent2, c.panel, 0.55);
  ctx.fillRect(x0, sleeveTip - th - 10, x1 - x0, 10);
  for (let x = x0 - pitch + offS; x < x1 + pitch; x += pitch) tooth(x, sleeveTip, 1, c.accent2);
  ctx.restore();
  // relative speed arrow
  const dRpm = s.gearRpm - RPM_SHAFT;
  const msg =
    s.phase === 'clash'
      ? 'Dişler birbirine çarpıyor!'
      : s.phase === 'sync'
        ? 'Hızlar eşitleniyor…'
        : s.phase === 'engage' || s.phase === 'engaged'
          ? 'Hız farkı yok: dişler boşluklara kayar'
          : Math.abs(dRpm) > 20
            ? 'Hız farkı: dişler boşluk bulamaz'
            : '';
  const col = s.phase === 'clash' ? c.bad : s.phase === 'engage' || s.phase === 'engaged' ? c.good : c.muted;
  if (msg) text(ctx, msg, b.x + b.w / 2, b.y + b.h - 2, { size: 11, weight: 700, color: col, align: 'center', baseline: 'bottom', maxWidth: b.w - 8 });
  return { x: b.x + b.w / 2, y: gearTop };
}

export function Synchromesh() {
  const [synchro, setSynchro] = useState(true);
  const sim = useRef<Sim>({
    phase: 'neutral',
    since: 0,
    sleeve: 0,
    gearRpm: RPM_GEAR,
    shaftAng: 0,
    gearAng: 0,
    heat: 0,
    pressed: false,
    sparks: [],
    synchro: true,
  });
  const now = useRef(0);

  const ref = useCanvasAnimation(
    (ctx, t, w, h, c, dt) => {
      now.current = t;
      const s = sim.current;
      if (s.synchro !== synchro && (s.phase === 'neutral' || s.phase === 'release')) s.synchro = synchro;
      if (dt > 0) step(s, t, dt);
      const f = fs(w);
      const wide = w >= 560;
      // shake the whole drawing while the teeth clash
      const shake = s.phase === 'clash' ? 2.2 : 0;
      ctx.save();
      if (shake) ctx.translate((hash01(Math.floor(t * 60)) - 0.5) * shake * 2, (hash01(Math.floor(t * 60) + 7) - 0.5) * shake * 2);
      const dialsH = 64;
      drawDials(ctx, { x: 0, y: 4, w: wide ? w * 0.62 : w, h: dialsH }, c, s, f);
      // speed difference readout
      const diff = Math.abs(s.gearRpm - RPM_SHAFT);
      const diffTxt = `${fmt(Math.round(diff / 10) * 10)} d/dk`;
      const diffCol = diff < 20 ? c.good : c.bad;
      if (wide) {
        text(ctx, 'Fark', w * 0.62 + 10, 4 + dialsH / 2 - 2, { size: 11, color: c.muted, baseline: 'bottom' });
        text(ctx, diffTxt, w * 0.62 + 10, 4 + dialsH / 2 + 2, { size: f + 2, weight: 800, mono: true, color: diffCol, baseline: 'top' });
      } else {
        const tw = text(ctx, diffTxt, w - 12, dialsH + 14, { size: f, weight: 800, mono: true, color: diffCol, align: 'right', baseline: 'top' });
        text(ctx, 'Fark:', w - 12 - tw - 6, dialsH + 14, { size: 11, color: c.muted, align: 'right', baseline: 'top' });
      }
      const top = dialsH + 10;
      const sec: Box = wide ? { x: 0, y: top, w: w * 0.58, h: h - top } : { x: 0, y: top, w, h: (h - top) * 0.58 };
      const comb: Box = wide
        ? { x: w * 0.58, y: top, w: w * 0.42, h: h - top }
        : { x: 0, y: top + sec.h, w, h: h - top - sec.h };
      const contact = drawSection(ctx, sec, c, s);
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (wide) {
        ctx.moveTo(comb.x, comb.y + 6);
        ctx.lineTo(comb.x, h - 8);
      } else {
        ctx.moveTo(12, comb.y);
        ctx.lineTo(w - 12, comb.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const cp = drawComb(ctx, comb, c, s);
      // clash effects: sparks + "KRRRT"
      if (s.phase === 'clash') {
        if (dt > 0 && Math.random() < 0.8) {
          for (const src of [contact, cp]) {
            s.sparks.push({ x: src.x, y: src.y, vx: (Math.random() - 0.5) * 220, vy: -60 - Math.random() * 160, life: 0.35 + Math.random() * 0.25 });
          }
        }
        const k = (t - s.since) * 9;
        text(ctx, 'KRRRT!', cp.x + Math.sin(k * 3) * 3, comb.y + 22, { size: f + 6, weight: 900, color: c.bad, align: 'center', baseline: 'top' });
      }
      ctx.restore();
    },
    [synchro],
    { aspect: (w) => (w >= 700 ? 2.0 : w >= 560 ? 1.75 : 0.72) },
  );

  return (
    <AnimFrame
      name="synchromesh"
      canvasRef={ref}
      label="Senkromeç: vites kovanı dişliye takılmadan önce pirinç koni sürtünerek iki parçanın devrini eşitler; senkromeç yoksa farklı hızdaki dişler çarpışır."
      controls={
        <>
          <Toggle
            label="Senkromeç"
            value={synchro}
            options={[
              { value: true, label: 'açık' },
              { value: false, label: 'kapalı' },
            ]}
            onChange={setSynchro}
          />
          <Button
            primary
            onClick={() => {
              const s = sim.current;
              s.synchro = synchro;
              if (s.phase === 'neutral') s.pressed = true;
              else if (s.phase === 'engaged') {
                s.phase = 'release';
                s.since = now.current;
              }
            }}
          >
            Vitese tak
          </Button>
        </>
      }
      note={
        <>
          Köpek dişleri ancak iki parça <strong>aynı hızda</strong> dönerken birbirinin boşluğuna girebilir. Senkromeçsiz
          kutuda sürücü “çift debriyaj” ile devri kendisi eşitlemek zorundaydı. Senkromeçte önce pirinç halka koniye
          sürtünür, dişliyi milin hızına getirir; sonra kovan sessizce kayar (Cadillac, 1928).
        </>
      }
    />
  );
}
