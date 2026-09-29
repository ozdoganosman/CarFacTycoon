import { useRef, useState } from 'react';
import { t } from '../../../i18n';
import { tx } from '../../i18n';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Readout, Slider } from './controls';
import { TAU, alpha, arcArrow, clamp, fmt, fs, hash01, lerp, mix, mod, text, type Ctx } from './draw';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Simple, era-plausible model of a mechanically driven Roots blower (1920s–30s). */
function model(boostBar: number) {
  const pr = 1 + boostBar / 1.013; // pressure ratio
  // Roots blowers compress inefficiently (≈55–60 %), so the charge heats up noticeably
  const dT = (293 * (pr ** 0.286 - 1)) / 0.6;
  const air = 1 + 0.8 * boostBar; // air mass per cycle vs. naturally aspirated (incl. breathing gains)
  const drive = 0.1 * boostBar; // share of engine power spent turning the blower
  const power = air * (1 - drive) - 1;
  const fuel = air * (1 + 0.15 * boostBar) - 1; // same mixture, plus enrichment to fight knock
  return { pr, dT, air, drive, power, fuel };
}

/** Two-lobe rotor: r(φ) = R0 + A·cos 2φ. Two such rotors 90° out of phase stay in contact on the centre line. */
function rotorPath(ctx: Ctx, cx: number, cy: number, R0: number, A: number, ang: number) {
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const p = (i / 96) * TAU;
    const r = R0 + A * Math.cos(2 * p);
    const x = cx + Math.cos(p + ang) * r;
    const y = cy + Math.sin(p + ang) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function drawBlower(ctx: Ctx, b: Box, c: ThemeColors, ang: number, boost: number, time: number, f: number) {
  text(ctx, t('Roots kompresörü (kesit)'), b.x + 12, b.y + 8, { size: f, weight: 700, color: c.ink, baseline: 'top' });
  const R0 = Math.min(b.w / 5.4, (b.h - 30) / 5.2, 60);
  const A = 0.42 * R0;
  const gap = Math.max(2, R0 * 0.06);
  const Rc = R0 + A + gap;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + 30 + (b.h - 30) / 2;
  const lx = bcx - R0;
  const rx = bcx + R0;
  const port = R0 * 0.95;
  const th = Math.acos((R0 - port / 2) / Rc);
  const yPortTop = bcy - Math.sin(th) * Rc;
  const yPortBot = bcy + Math.sin(th) * Rc;
  const ductTop = b.y + 30;
  const ductBot = b.y + b.h - 4;
  const air = c.accent2;
  const hot = mix(c.accent2, c.fire, clamp(model(boost).dT / 90, 0, 1));

  // ducts
  ctx.fillStyle = alpha(air, 0.1);
  ctx.fillRect(bcx - port / 2, ductTop, port, yPortTop - ductTop + 2);
  ctx.fillStyle = alpha(hot, 0.1 + 0.25 * (boost / 0.7));
  ctx.fillRect(bcx - port / 2, yPortBot - 2, port, ductBot - yPortBot + 2);
  // casing
  ctx.beginPath();
  ctx.arc(lx, bcy, Rc, -th, th, true);
  ctx.moveTo(rx + Math.cos(Math.PI - th) * Rc, bcy - Math.sin(th) * Rc);
  ctx.arc(rx, bcy, Rc, -(Math.PI - th), Math.PI - th, false);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = Math.max(3, R0 * 0.1);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bcx - port / 2, yPortTop);
  ctx.lineTo(bcx - port / 2, ductTop);
  ctx.moveTo(bcx + port / 2, yPortTop);
  ctx.lineTo(bcx + port / 2, ductTop);
  ctx.moveTo(bcx - port / 2, yPortBot);
  ctx.lineTo(bcx - port / 2, ductBot);
  ctx.moveTo(bcx + port / 2, yPortBot);
  ctx.lineTo(bcx + port / 2, ductBot);
  ctx.stroke();

  // rotors: left turns anticlockwise, right clockwise; the lobes sweep air round the OUTSIDE
  const aL = -ang;
  const aR = ang + Math.PI / 2;
  for (const [cx, a] of [
    [lx, aL],
    [rx, aR],
  ] as const) {
    rotorPath(ctx, cx, bcy, R0, A, a);
    ctx.fillStyle = mix(c.metal, c.panel, 0.2);
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, bcy, R0 * 0.14, 0, TAU);
    ctx.fillStyle = c.panel;
    ctx.fill();
    ctx.stroke();
  }
  arcArrow(ctx, lx, bcy, R0 * 0.35, -0.2, -2.2, { color: c.ink, width: 1.5, head: 6 });
  arcArrow(ctx, rx, bcy, R0 * 0.35, Math.PI + 0.2, Math.PI + 2.2, { color: c.ink, width: 1.5, head: 6 });

  // air trapped in the pockets between lobes and casing, carried from inlet (top) to outlet (bottom)
  const dot = Math.max(1.8, R0 * 0.06);
  for (const [cx, a, side] of [
    [lx, aL, -1],
    [rx, aR, 1],
  ] as const) {
    for (const valley of [Math.PI / 2, (3 * Math.PI) / 2]) {
      for (let j = 0; j < 7; j++) {
        const jit = (hash01(j * 5 + valley * 3) - 0.5) * 0.7;
        const pa = a + valley + jit;
        const ca = Math.cos(pa);
        if (side * ca < 0.08) continue; // only on the outer side (inside the casing, away from the mesh)
        const u = hash01(j * 11 + 3 + valley);
        const rmin = R0 - 0.64 * A + dot + 1;
        const rr = lerp(rmin, Rc - dot - 1, u);
        const fade = clamp((side * ca - 0.08) / 0.3, 0, 1);
        ctx.fillStyle = alpha(air, 0.9 * fade);
        ctx.beginPath();
        ctx.arc(cx + ca * rr, bcy + Math.sin(pa) * rr, dot, 0, TAU);
        ctx.fill();
      }
    }
  }
  // inlet stream (atmospheric) and outlet stream (compressed: slower, closer together, warmer)
  const speedIn = 30 + 60 * boost;
  const nIn = 10;
  for (let i = 0; i < nIn; i++) {
    const q = mod(time * speedIn / (yPortTop - ductTop) + i / nIn, 1);
    const x = bcx + (hash01(i * 7) - 0.5) * port * 0.7;
    ctx.fillStyle = alpha(air, 0.85);
    ctx.beginPath();
    ctx.arc(x, ductTop + q * (yPortTop - ductTop), dot, 0, TAU);
    ctx.fill();
  }
  const density = model(boost).pr;
  const nOut = Math.round(10 * density);
  for (let i = 0; i < nOut; i++) {
    const q = mod((time * speedIn) / density / (ductBot - yPortBot) + i / nOut, 1);
    const x = bcx + (hash01(i * 13 + 1) - 0.5) * port * 0.7;
    ctx.fillStyle = alpha(hot, 0.9);
    ctx.beginPath();
    ctx.arc(x, yPortBot + q * (ductBot - yPortBot), dot, 0, TAU);
    ctx.fill();
  }
  text(ctx, t('hava (1 bar)'), bcx + port / 2 + 6, ductTop + 4, { size: 11, color: c.muted, baseline: 'top' });
  text(ctx, t('motora: {v} bar', { v: fmt(1 + boost, 2) }), bcx + port / 2 + 6, ductBot - 2, { size: 11, weight: 700, color: boost > 0.02 ? mix(c.accent2, c.ink, 0.2) : c.muted, baseline: 'bottom' });
  // One sentence on two lines (\n), the last one at the bottom.
  const drive = t('krank milinden\nkayış/dişliyle döner').split('\n');
  drive.forEach((l, i) => text(ctx, l, b.x + 12, ductBot - 2 - 13 * (drive.length - 1 - i), { size: 11, color: c.muted, baseline: 'bottom' }));
}

function drawCylinders(ctx: Ctx, b: Box, c: ThemeColors, boost: number, time: number, f: number) {
  const m = model(boost);
  const gapX = 18;
  const cw = Math.min((b.w - gapX - 24) / 2, 140);
  const ch = Math.min(b.h - 78, cw * 1.35);
  const y0 = b.y + 28 + (b.h - 78 - ch) / 2;
  const x0 = b.x + (b.w - (cw * 2 + gapX)) / 2;
  const items = [
    { label: t('Doğal emişli'), n: 22, color: c.accent2, x: x0 },
    { label: t('Kompresörlü'), n: Math.round(22 * m.air), color: mix(c.accent2, c.fire, clamp(m.dT / 90, 0, 1)), x: x0 + cw + gapX },
  ];
  text(ctx, t('Bir emme zamanında silindirdeki hava'), b.x + b.w / 2, b.y + 8, { size: f - 1, weight: 700, color: c.ink, align: 'center', baseline: 'top', maxWidth: b.w - 12 });
  for (const it of items) {
    // cylinder walls + head
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(it.x, y0 + ch);
    ctx.lineTo(it.x, y0);
    ctx.lineTo(it.x + cw, y0);
    ctx.lineTo(it.x + cw, y0 + ch);
    ctx.stroke();
    // piston at bottom dead centre
    ctx.fillStyle = c.metal;
    ctx.fillRect(it.x + 2, y0 + ch - 12, cw - 4, 12);
    const inner = { x: it.x + 5, y: y0 + 5, w: cw - 10, h: ch - 22 };
    ctx.fillStyle = alpha(it.color, 0.08 + 0.1 * (it.n / 40));
    ctx.fillRect(inner.x - 3, inner.y - 3, inner.w + 6, inner.h + 6);
    const dot = clamp(cw * 0.035, 2, 3.5);
    for (let i = 0; i < it.n; i++) {
      const u = hash01(i * 3 + 1);
      const v = hash01(i * 7 + 2);
      const jx = Math.sin(time * 5 + i * 1.3) * 2.5;
      const jy = Math.cos(time * 4.3 + i) * 2.5;
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(inner.x + dot + u * (inner.w - 2 * dot) + jx, inner.y + dot + v * (inner.h - 2 * dot) + jy, dot, 0, TAU);
      ctx.fill();
    }
    text(ctx, it.label, it.x + cw / 2, y0 + ch + 8, { size: 11, weight: 700, color: c.ink, align: 'center', baseline: 'top' });
    text(ctx, t('{n} birim hava', { n: it.n }), it.x + cw / 2, y0 + ch + 8 + 14, { size: 11, mono: true, color: c.muted, align: 'center', baseline: 'top' });
  }
}

export function Supercharger() {
  const [boost, setBoost] = useState(0.5);
  const rot = useRef(0);
  const m = model(boost);

  const ref = useCanvasAnimation(
    (ctx, t, w, h, c, dt) => {
      rot.current += dt * (0.4 + 4.5 * boost); // rotor speed rises with boost
      const f = fs(w);
      const wide = w >= 560;
      const A: Box = wide ? { x: 0, y: 0, w: w * 0.54, h } : { x: 0, y: 0, w, h: h * 0.52 };
      const B: Box = wide ? { x: w * 0.54, y: 0, w: w * 0.46, h } : { x: 0, y: h * 0.52, w, h: h * 0.48 };
      drawBlower(ctx, A, c, rot.current, boost, t, f);
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (wide) {
        ctx.moveTo(B.x, 10);
        ctx.lineTo(B.x, h - 10);
      } else {
        ctx.moveTo(12, B.y);
        ctx.lineTo(w - 12, B.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      drawCylinders(ctx, B, c, boost, t, f);
    },
    [boost],
    { aspect: (w) => (w >= 700 ? 1.95 : w >= 560 ? 1.65 : 0.72) },
  );

  const pct = (v: number) => `${v >= 0 ? '+' : ''}${fmt(v * 100)}%`;

  return (
    <AnimFrame
      name="supercharger"
      canvasRef={ref}
      label={t(
        'Roots kompresörü: iki loblu rotor ters yönlerde dönüp havayı gövde duvarı boyunca taşır ve emme manifolduna basar; kompresörlü silindirde daha çok hava vardır.',
      )}
      readouts={
        <>
          <Readout label={t('Şarj basıncı')} value={t('+{v} bar', { v: fmt(boost, 2) })} />
          <Readout label={t('Hava')} value={`×${fmt(m.air, 2)}`} />
          <Readout label={t('Güç')} value={pct(m.power)} />
          <Readout label={t('Yakıt')} value={pct(m.fuel)} />
          <Readout label={t('Emme havası')} value={t('+{v} °C', { v: fmt(m.dT) })} />
        </>
      }
      controls={
        <Slider label={t('Şarj basıncı')} value={boost} min={0} max={0.7} step={0.05} onChange={setBoost} format={(v) => t('{v} bar', { v: fmt(v, 2) })} />
      }
      note={tx(
        'Motor gücü, silindire sığan hava kadardır: kompresör havayı sıkıştırıp <strong>aynı silindire daha çok hava</strong> basar, böylece daha çok yakıt yakılır. Bedeli: kompresörü krank döndürdüğü için güç harcar, sıkışan hava ısınır (vuruntu riski) ve yakıt tüketimi güçten hızlı artar (Mercedes, Bentley “Blower”, 1920’ler).',
      )}
    />
  );
}
