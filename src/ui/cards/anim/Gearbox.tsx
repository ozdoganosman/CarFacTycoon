import { useRef, useState } from 'react';
import { t } from '../../../i18n';
import { tx } from '../../i18n';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Slider, Toggle } from './controls';
import { TAU, alpha, clamp, fmt, fs, lerp, text, type Ctx } from './draw';

/* ---- a plausible 1930s car: ~2.5 L six, 36 hp ---- */
const N_MIN = 600; // rpm – below this the engine stalls (clutch must slip)
const N_MAX = 3200; // rpm – governed / redline
const N_LAUNCH = 1500; // rpm held while slipping the clutch from standstill
const T_PEAK = 130; // N·m at 1500 rpm
const ETA = 0.9; // driveline efficiency
const R_WHEEL = 0.34; // m
const MASS = 1150; // kg incl. rotating inertia
const CRR = 0.015;
const CDA = 1.5; // m² – upright body
const I_FIRST = 3.6; // 1st / top ratio spread (top gear is direct drive, 1:1)
const TIME_SCALE = 3; // sim seconds per screen second
const V_AXIS = 140; // km/h
const F_AXIS = 6000; // N

/** Engine torque curve: a broad parabola peaking at 1500 rpm (N·m). */
const torque = (n: number) => T_PEAK * (1 - 0.4 * ((n - 1500) / 1700) ** 2);
const powerW = (n: number) => (torque(n) * n * TAU) / 60;

const P_PEAK = (() => {
  let best = 0;
  for (let n = N_MIN; n <= N_MAX; n += 10) best = Math.max(best, powerW(n));
  return best;
})();
const N_PPEAK = (() => {
  let bn = N_MIN;
  for (let n = N_MIN; n <= N_MAX; n += 10) if (powerW(n) > powerW(bn)) bn = n;
  return bn;
})();

const roadLoad = (v: number) => MASS * 9.81 * CRR + 0.5 * 1.2 * CDA * v * v; // N, v in m/s

interface Gearing {
  ratios: number[]; // overall ratio (gear × final drive) per gear
}

function gearing(count: number, s: number): Gearing {
  const finalDrive = lerp(4.6, 3.0, s); // "Kısa" (0) → "Uzun" (1)
  const ratios: number[] = [];
  for (let k = 0; k < count; k++) {
    const g = count === 1 ? 1 : I_FIRST ** ((count - 1 - k) / (count - 1)); // geometric steps
    ratios.push(g * finalDrive);
  }
  return { ratios };
}

/** Road speed (m/s) at engine speed n in a gear of overall ratio i. */
const speedAt = (n: number, i: number) => (n * TAU * R_WHEEL) / (60 * i);
/** Tractive force at the wheels (N). */
const forceAt = (n: number, i: number) => (torque(n) * i * ETA) / R_WHEEL;
const rpmAt = (v: number, i: number) => (v * 60 * i) / (TAU * R_WHEEL);

/** Best available gear at speed v: the one giving the most force (the "sawtooth envelope"). */
function envelope(v: number, g: Gearing): { F: number; gear: number; rpm: number } {
  const i1 = g.ratios[0];
  if (rpmAt(v, i1) < N_LAUNCH) return { F: forceAt(N_LAUNCH, i1), gear: 0, rpm: N_LAUNCH }; // clutch slipping
  let best = { F: 0, gear: -1, rpm: 0 };
  g.ratios.forEach((i, k) => {
    const n = rpmAt(v, i);
    if (n < N_MIN || n > N_MAX) return;
    const F = forceAt(n, i);
    if (F > best.F) best = { F, gear: k, rpm: n };
  });
  return best;
}

interface Sim {
  v: number; // m/s
  hold: number;
  key: string;
}

function drawGearbox(ctx: Ctx, w: number, h: number, c: ThemeColors, g: Gearing, sim: Sim) {
  const f = fs(w);
  const narrow = w < 480;
  const m = { l: 46, r: 12, t: 14, b: narrow ? 40 : 42 };
  const pw = w - m.l - m.r;
  const ph = h - m.t - m.b;
  const X = (kmh: number) => m.l + (kmh / V_AXIS) * pw;
  const Y = (N: number) => m.t + ph - (N / F_AXIS) * ph;

  // ----- axes & grid -----
  ctx.strokeStyle = alpha(c.line, 0.8);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let kmh = 0; kmh <= V_AXIS; kmh += 20) {
    ctx.moveTo(Math.round(X(kmh)) + 0.5, m.t);
    ctx.lineTo(Math.round(X(kmh)) + 0.5, m.t + ph);
  }
  for (let N = 0; N <= F_AXIS; N += 1000) {
    ctx.moveTo(m.l, Math.round(Y(N)) + 0.5);
    ctx.lineTo(m.l + pw, Math.round(Y(N)) + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = c.muted;
  ctx.beginPath();
  ctx.moveTo(m.l + 0.5, m.t);
  ctx.lineTo(m.l + 0.5, m.t + ph + 0.5);
  ctx.lineTo(m.l + pw, m.t + ph + 0.5);
  ctx.stroke();
  for (let kmh = 0; kmh <= V_AXIS; kmh += narrow ? 40 : 20) {
    text(ctx, String(kmh), X(kmh), m.t + ph + 5, { size: 11, color: c.muted, align: 'center', baseline: 'top', mono: true });
  }
  for (let N = 0; N <= F_AXIS; N += 2000) {
    text(ctx, String(N / 1000), m.l - 6, Y(N), { size: 11, color: c.muted, align: 'right', baseline: 'middle', mono: true });
  }
  text(ctx, t('Hız (km/sa)'), m.l + pw, h - 4, { size: 11, color: c.muted, align: 'right', baseline: 'bottom' });
  ctx.save();
  ctx.translate(12, m.t + ph / 2);
  ctx.rotate(-Math.PI / 2);
  text(ctx, t('Çekiş kuvveti (kN)'), 0, 0, { size: 11, color: c.muted, align: 'center', baseline: 'middle' });
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(m.l, m.t, pw, ph);
  ctx.clip();

  // ----- ideal constant-power hyperbola F = P/v -----
  const hyper: [number, number][] = [];
  for (let kmh = 2; kmh <= V_AXIS; kmh += 1) hyper.push([X(kmh), Y((P_PEAK * ETA) / (kmh / 3.6))]);

  // ----- sawtooth envelope -----
  const env: [number, number][] = [];
  for (let kmh = 0; kmh <= V_AXIS; kmh += 0.5) {
    const e = envelope(kmh / 3.6, g);
    env.push([X(kmh), Y(e.F)]);
  }
  // shaded gap between ideal and actual = force the gearbox leaves unused (only where a gear is usable)
  let vEnd = 0;
  for (let kmh = 0; kmh <= V_AXIS; kmh += 0.5) if (envelope(kmh / 3.6, g).F > 0) vEnd = kmh;
  ctx.beginPath();
  for (let kmh = 2; kmh <= vEnd; kmh += 0.5) {
    const x = X(kmh);
    const y = Y((P_PEAK * ETA) / (kmh / 3.6));
    if (kmh === 2) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let kmh = vEnd; kmh >= 2; kmh -= 0.5) ctx.lineTo(X(kmh), Y(envelope(kmh / 3.6, g).F));
  ctx.closePath();
  ctx.fillStyle = alpha(c.warn, 0.14);
  ctx.fill();

  // road load
  ctx.beginPath();
  for (let kmh = 0; kmh <= V_AXIS; kmh += 2) {
    const y = Y(roadLoad(kmh / 3.6));
    if (kmh) ctx.lineTo(X(kmh), y);
    else ctx.moveTo(X(kmh), y);
  }
  ctx.strokeStyle = c.muted;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // per-gear curves
  const cur = envelope(sim.v, g);
  g.ratios.forEach((i, k) => {
    ctx.beginPath();
    for (let n = N_MIN; n <= N_MAX; n += 25) {
      const x = X(speedAt(n, i) * 3.6);
      const y = Y(forceAt(n, i));
      if (n === N_MIN) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const active = k === cur.gear;
    ctx.strokeStyle = active ? c.accent2 : alpha(c.muted, 0.75);
    ctx.lineWidth = active ? 2.5 : 1.25;
    ctx.stroke();
  });

  // envelope on top
  ctx.beginPath();
  env.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // hyperbola last so the dashes stay visible
  ctx.beginPath();
  hyper.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // gear number badges at each curve's torque peak
  g.ratios.forEach((i, k) => {
    const x = X(speedAt(1500, i) * 3.6);
    const y = Y(forceAt(1500, i)) - 12;
    if (y < m.t + 8) return;
    const active = k === cur.gear;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.fillStyle = active ? c.accent2 : c.panel;
    ctx.fill();
    ctx.strokeStyle = active ? c.accent2 : c.muted;
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, String(k + 1), x, y + 0.5, { size: 11, weight: 700, color: active ? c.panel : c.ink, align: 'center', baseline: 'middle' });
  });

  // curve labels
  const labX = narrow ? 34 : 30;
  const hy = Y((P_PEAK * ETA) / (labX / 3.6));
  if (hy > m.t + 10) {
    text(ctx, t('İdeal: sabit güç'), X(labX) + 6, hy - 4, { size: f - 1, weight: 600, color: c.ink, bg: alpha(c.panel, 0.85), pad: 2 });
  }
  text(ctx, t('Yol direnci'), X(V_AXIS) - 3, Y(roadLoad(V_AXIS / 3.6)) - 9, { size: 11, color: c.muted, align: 'right', bg: alpha(c.panel, 0.85), pad: 2 });

  // ----- marker on the envelope -----
  const kmhNow = sim.v * 3.6;
  const mx = X(kmhNow);
  const my = Y(cur.F);
  ctx.strokeStyle = alpha(c.accent, 0.6);
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(mx, m.t + ph);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(mx, my, 6, 0, TAU);
  ctx.fillStyle = c.accent;
  ctx.fill();
  ctx.strokeStyle = c.panel;
  ctx.lineWidth = 2;
  ctx.stroke();

  // ----- rpm gauge (top right) -----
  const gr = clamp(Math.min(pw * 0.15, ph * 0.22), 34, 62);
  const gcx = m.l + pw - gr - 14;
  const gcy = m.t + gr + 16;
  const a0 = Math.PI * 0.8;
  const a1 = Math.PI * 2.2;
  const RPM_AX = 3500;
  const ang = (n: number) => a0 + (clamp(n, 0, RPM_AX) / RPM_AX) * (a1 - a0);
  ctx.fillStyle = alpha(c.panel, 0.92);
  ctx.beginPath();
  ctx.arc(gcx, gcy, gr + 10, 0, TAU);
  ctx.fill();
  ctx.lineWidth = gr * 0.16;
  ctx.strokeStyle = alpha(c.line, 1);
  ctx.beginPath();
  ctx.arc(gcx, gcy, gr, a0, a1);
  ctx.stroke();
  // power band: within 90 % of peak power
  let bandLo = N_MIN;
  let bandHi = N_MAX;
  for (let n = N_MIN; n <= N_MAX; n += 10) if (powerW(n) >= 0.9 * P_PEAK) { bandLo = n; break; }
  for (let n = N_MAX; n >= N_MIN; n -= 10) if (powerW(n) >= 0.9 * P_PEAK) { bandHi = n; break; }
  ctx.strokeStyle = c.good;
  ctx.beginPath();
  ctx.arc(gcx, gcy, gr, ang(bandLo), ang(bandHi));
  ctx.stroke();
  ctx.strokeStyle = c.bad;
  ctx.beginPath();
  ctx.arc(gcx, gcy, gr, ang(N_MAX), a1);
  ctx.stroke();
  // needle
  const na = ang(cur.rpm);
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(gcx, gcy);
  ctx.lineTo(gcx + Math.cos(na) * gr * 0.95, gcy + Math.sin(na) * gr * 0.95);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(gcx, gcy, 3.5, 0, TAU);
  ctx.fillStyle = c.ink;
  ctx.fill();
  text(ctx, `${fmt(Math.round(cur.rpm / 10) * 10)}`, gcx, gcy + gr * 0.42, { size: f, weight: 700, mono: true, color: c.ink, align: 'center', baseline: 'middle' });
  text(ctx, t('d/dk'), gcx, gcy + gr * 0.42 + f, { size: 11, color: c.muted, align: 'center', baseline: 'middle' });
  // gear & speed readout under the gauge
  const gearTxt = cur.gear < 0 ? '—' : rpmAt(sim.v, g.ratios[0]) < N_LAUNCH ? t('1. vites (kalkış)') : t('{gear}. vites', { gear: cur.gear + 1 });
  text(ctx, gearTxt, gcx, gcy + gr + 14, { size: f, weight: 700, color: c.accent2, align: 'center', baseline: 'middle' });
  text(ctx, t('{v} km/sa', { v: fmt(kmhNow) }), gcx, gcy + gr + 14 + f * 1.3, { size: f - 1, mono: true, color: c.ink, align: 'center', baseline: 'middle' });
  text(ctx, t('güç bandı'), gcx - gr * 0.05, gcy - gr - 6, { size: 11, color: c.good, align: 'center', baseline: 'bottom', weight: 600 });
}

export function Gearbox() {
  const [count, setCount] = useState(3);
  const [spread, setSpread] = useState(0.5);
  const sim = useRef<Sim>({ v: 0, hold: 0, key: '' });
  const g = gearing(count, spread);

  const ref = useCanvasAnimation(
    (ctx, _t, w, h, c, dt) => {
      const s = sim.current;
      const key = `${count}/${spread}`;
      if (s.key !== key) {
        s.key = key;
        s.v = 0;
        s.hold = 0;
      }
      if (dt > 0) {
        if (s.hold > 0) {
          s.hold -= dt;
          if (s.hold <= 0) s.v = 0;
        } else {
          // Newton: m·dv/dt = F_wheel − F_road, integrated in small sub-steps
          const steps = 4;
          const h1 = (dt * TIME_SCALE) / steps;
          let acc = 0;
          for (let i = 0; i < steps; i++) {
            const e = envelope(s.v, g);
            acc = (e.F - roadLoad(s.v)) / MASS;
            s.v = Math.max(0, s.v + acc * h1);
          }
          if (acc < 0.03 || s.v * 3.6 > V_AXIS - 1) s.hold = 2; // reached top speed → pause, restart
        }
      }
      drawGearbox(ctx, w, h, c, g, s);
    },
    [count, spread],
    { aspect: (w) => (w < 480 ? 0.95 : 1.6) },
  );

  return (
    <AnimFrame
      name="gearbox"
      canvasRef={ref}
      label={t('Şanzıman grafiği: her vitesin çekiş kuvveti eğrisi, ideal sabit güç eğrisi ve aracın izlediği testere dişi zarf.')}
      controls={
        <>
          <Toggle
            label={t('Vites sayısı')}
            value={count}
            options={[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
            onChange={setCount}
          />
          <Slider label={t('Oranlar')} value={spread} min={0} max={1} step={0.05} onChange={setSpread} ends={[t('Kısa'), t('Uzun')]} />
        </>
      }
      note={tx(
        'Motor en çok gücü dar bir devir aralığında (yeşil bant, ~{rpm} d/dk) verir. Her vites o gücü başka bir hıza taşır; <strong>vites sayısı arttıkça</strong> turuncu testere dişi, kesikli ideal eğriye yaklaşır ve motor güç tepesine yakın kalır. Kısa oranlar kalkışı güçlendirir ama son hızı devir sınırına dayar; fazla uzun oranlarda son viteste motor güç tepesine hiç çıkamaz.',
        { rpm: fmt(N_PPEAK) },
      )}
    />
  );
}
