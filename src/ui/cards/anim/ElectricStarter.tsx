import { useRef } from 'react';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Button } from './controls';
import { TAU, alpha, arcArrow, clamp, fmt, fs, gearPath, lerp, mix, roundRect, sstep, text, type Ctx } from './draw';

const N_RING = 36; // flywheel ring-gear teeth (real ones have ~100+; fewer keeps the drawing legible)
const N_PINION = 9;
const CRANK_RPM = 150; // what a 6 V starter could turn a cold engine at
const IDLE_RPM = 450;
const VIS = 0.4; // on-screen revolutions per real revolution/s … keeps the flywheel readable

type Phase = 'idle' | 'engage' | 'crank' | 'fire' | 'run' | 'stop';

interface StarterState {
  phase: Phase;
  since: number; // time the phase started
  rpm: number;
  ring: number; // flywheel angle (rad)
  pinion: number; // last pinion angle
  engage: number; // 0 = pinion back, 1 = meshed
  pressed: boolean;
  // hand crank
  crank: number;
  crankT: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ---------------- left: hand crank ---------------- */

const CRANK_PERIOD = 4.8;

function drawHandCrank(ctx: Ctx, b: Box, c: ThemeColors, s: StarterState, f: number) {
  const tLoop = s.crankT % CRANK_PERIOD;
  const kick = tLoop >= 3.0 && tLoop < 3.35;
  const after = tLoop >= 3.0;
  text(ctx, 'El manivelası', b.x + 12, b.y + 12, { size: f + 1, weight: 700, color: c.ink, baseline: 'top' });
  text(ctx, '1912 öncesi', b.x + 12, b.y + 12 + (f + 1) * 1.35, { size: 11, color: c.muted, baseline: 'top' });

  const headerH = 12 + (f + 1) * 1.35 + 11 * 1.3 + 8;
  const ground = b.y + b.h - 30;
  const u = Math.min(b.w * 0.92, (ground - b.y - headerH - 26) / 0.62);
  const cx = b.x + b.w * 0.46;
  // car front, face-on
  const rw = u * 0.3;
  const rh = u * 0.34;
  const rTop = ground - u * 0.62;
  // wheels (front view: tall rounded rectangles)
  ctx.fillStyle = mix(c.ink, c.panel, 0.2);
  for (const sx of [-1, 1]) {
    roundRect(ctx, cx + sx * u * 0.36 - u * 0.045, ground - u * 0.3, u * 0.09, u * 0.3, u * 0.03);
    ctx.fill();
  }
  // axle & fenders
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - u * 0.36, ground - u * 0.15);
  ctx.lineTo(cx + u * 0.36, ground - u * 0.15);
  for (const sx of [-1, 1]) {
    ctx.moveTo(cx + sx * u * 0.27, ground - u * 0.3);
    ctx.quadraticCurveTo(cx + sx * u * 0.36, ground - u * 0.4, cx + sx * u * 0.45, ground - u * 0.3);
  }
  ctx.stroke();
  // radiator shell + grille
  ctx.fillStyle = c.metal;
  roundRect(ctx, cx - rw / 2, rTop, rw, rh, 6);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = alpha(c.ink, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 8; i++) {
    const gx = cx - rw / 2 + (rw * i) / 8;
    ctx.moveTo(gx, rTop + 6);
    ctx.lineTo(gx, rTop + rh - 6);
  }
  ctx.stroke();
  // headlamps
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + sx * u * 0.26, rTop + rh * 0.3, u * 0.045, 0, TAU);
    ctx.fillStyle = alpha(c.warn, 0.35);
    ctx.fill();
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // crank: shaft centre below the radiator, turned clockwise; a kickback spins it back hard
  const kc = { x: cx, y: rTop + rh + u * 0.1 };
  const cr = u * 0.1;
  const hx = kc.x + Math.cos(s.crank) * cr;
  const hy = kc.y + Math.sin(s.crank) * cr;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.arc(kc.x, kc.y, cr, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = mix(c.metal, c.ink, 0.4);
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(kc.x, kc.y);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(kc.x, kc.y, 4, 0, TAU);
  ctx.fillStyle = c.ink;
  ctx.fill();

  // person on the right, reaching for the handle (two-link arm, simple IK)
  const sh = { x: cx + u * 0.2, y: ground - u * 0.36 };
  const la = u * 0.15;
  const lb = u * 0.15;
  const dx = hx - sh.x;
  const dy = hy - sh.y;
  const d = clamp(Math.hypot(dx, dy), 1, la + lb - 0.5);
  const base = Math.atan2(dy, dx);
  const elbowAng = Math.acos(clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1));
  const el = { x: sh.x + Math.cos(base + elbowAng) * la, y: sh.y + Math.sin(base + elbowAng) * la };
  const hand = { x: sh.x + Math.cos(base) * d, y: sh.y + Math.sin(base) * d };
  const personC = mix(c.accent2, c.ink, 0.2);
  ctx.strokeStyle = personC;
  ctx.lineWidth = Math.max(2.5, u * 0.022);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  // legs & torso (leaning towards the car)
  const hip = { x: sh.x + u * 0.08, y: ground - u * 0.18 };
  ctx.moveTo(hip.x - u * 0.05, ground);
  ctx.lineTo(hip.x, hip.y);
  ctx.lineTo(hip.x + u * 0.06, ground);
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(sh.x, sh.y);
  // arm
  ctx.moveTo(sh.x, sh.y);
  ctx.lineTo(el.x, el.y);
  ctx.lineTo(hand.x, hand.y);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(sh.x - u * 0.015, sh.y - u * 0.055, u * 0.035, 0, TAU);
  ctx.fillStyle = personC;
  ctx.fill();
  // handle grip on top of the hand
  ctx.beginPath();
  ctx.arc(hx, hy, 5, 0, TAU);
  ctx.fillStyle = kick ? c.bad : mix(c.metal, c.ink, 0.4);
  ctx.fill();

  // direction arrows
  if (!after) {
    arcArrow(ctx, kc.x, kc.y, cr + 12, -0.4, 1.2, { color: c.muted, width: 1.5, head: 7 });
  } else {
    arcArrow(ctx, kc.x, kc.y, cr + 12, 1.4, -0.8, { color: c.bad, width: 2.5, head: 9 });
    // impact burst at the wrist
    const burst = 1 - sstep(3.0, 4.2, tLoop);
    ctx.strokeStyle = alpha(c.bad, burst);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const an = (i / 9) * TAU;
      ctx.moveTo(hand.x + Math.cos(an) * 8, hand.y + Math.sin(an) * 8);
      ctx.lineTo(hand.x + Math.cos(an) * 17, hand.y + Math.sin(an) * 17);
    }
    ctx.stroke();
    text(ctx, 'GERİ TEPME!', cx, rTop - 8, { size: f + 2, weight: 800, color: c.bad, align: 'center', baseline: 'bottom' });
  }
  text(ctx, after ? 'Erken ateşleme krankı ters çevirir: kol, bilek kırılır.' : 'Motoru elle çevirmek ağır ve yorucu.', b.x + b.w / 2, b.y + b.h - 8, {
    size: 11,
    color: after ? c.bad : c.muted,
    align: 'center',
    baseline: 'bottom',
    maxWidth: b.w - 16,
  });
}

/* ---------------- right: electric starter ---------------- */

function ground(ctx: Ctx, x: number, y: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x, y);
  for (let i = 0; i < 3; i++) {
    const hw = 7 - i * 2.5;
    ctx.moveTo(x - hw, y + i * 3);
    ctx.lineTo(x + hw, y + i * 3);
  }
  ctx.stroke();
}

function drawStarter(ctx: Ctx, b: Box, c: ThemeColors, s: StarterState, t: number, f: number) {
  text(ctx, 'Elektrikli marş', b.x + 12, b.y + 12, { size: f + 1, weight: 700, color: c.ink, baseline: 'top' });
  text(ctx, 'Cadillac 1912 · Charles Kettering', b.x + 12, b.y + 12 + (f + 1) * 1.35, { size: 11, color: c.muted, baseline: 'top' });

  const top = b.y + 12 + (f + 1) * 1.35 + 11 * 1.3 + 12;
  const bottom = b.y + b.h - 12 - f * 2.8; // leave room for the status lines
  const areaH = bottom - top;
  // flywheel on the right, pinion + motor down-left of it along one line (motor shaft ∥ crankshaft)
  const Rf = Math.min(areaH * 0.4, b.w * 0.24, 96); // pitch radius
  const m = Rf / (N_RING / 2); // gear module in px
  const Rp = (m * N_PINION) / 2;
  const fx = b.x + b.w - Rf - m - 16;
  const fy = top + areaH * 0.45;
  const phi = Math.PI * 0.84; // direction flywheel → pinion
  const ux = Math.cos(phi);
  const uy = Math.sin(phi);
  const back = m * 3.4; // how far the pinion is drawn back when disengaged
  const dist = Rf + Rp + (1 - s.engage) * back;
  const px = fx + ux * dist;
  const py = fy + uy * dist;
  const current = s.phase === 'engage' || s.phase === 'crank' || (s.phase === 'fire' && t - s.since < 0.25);

  // mesh: when a ring tooth points at the pinion, a pinion gap must point back at the ring
  if (s.engage > 0.02) s.pinion = phi + Math.PI + Math.PI / N_PINION - (s.ring - phi) * (N_RING / N_PINION);

  // ----- starter motor: body further out on the same line, shaft reaching to the pinion -----
  const ml = Math.max(40, Rf * 0.62);
  const mw = Math.max(26, Rf * 0.36);
  const mDist = Rf + Rp + back + m + ml / 2 + 4;
  const mx = fx + ux * mDist;
  const my = fy + uy * mDist;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(fx + ux * (Rf + Rp * 0.5), fy + uy * (Rf + Rp * 0.5));
  ctx.stroke();
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(phi);
  roundRect(ctx, -ml / 2, -mw / 2, ml, mw, 6);
  ctx.fillStyle = current ? mix(c.metal, c.warn, 0.45) : c.metal;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(mx, my, 9, 0, TAU);
  ctx.fillStyle = c.panel;
  ctx.fill();
  ctx.strokeStyle = c.ink;
  ctx.stroke();
  text(ctx, 'M', mx, my + 0.5, { size: 11, weight: 700, color: c.ink, align: 'center', baseline: 'middle' });

  // ----- ring gear + flywheel disc -----
  gearPath(ctx, fx, fy, Rf - 1.25 * m, Rf + m, N_RING, s.ring);
  ctx.fillStyle = c.metal;
  ctx.fill();
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(fx, fy, Rf - 2.4 * m, 0, TAU);
  ctx.fillStyle = mix(c.metal, c.panel, 0.45);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const an = s.ring + (i / 6) * TAU;
    ctx.beginPath();
    ctx.arc(fx + Math.cos(an) * Rf * 0.32, fy + Math.sin(an) * Rf * 0.32, Math.max(2, Rf * 0.045), 0, TAU);
    ctx.fillStyle = c.ink;
    ctx.fill();
  }
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(fx + Math.cos(s.ring) * Rf * 0.45, fy + Math.sin(s.ring) * Rf * 0.45);
  ctx.lineTo(fx + Math.cos(s.ring) * (Rf - 3 * m), fy + Math.sin(s.ring) * (Rf - 3 * m));
  ctx.stroke();
  // combustion glow once running (4 cylinders → 2 firings per crank turn)
  const running = s.phase === 'fire' || s.phase === 'run';
  const fl = running ? Math.max(0, Math.sin(s.ring * 2)) ** 4 : 0;
  ctx.beginPath();
  ctx.arc(fx, fy, Rf * 0.14, 0, TAU);
  ctx.fillStyle = running ? mix(c.panel, c.fire, 0.3 + 0.6 * fl) : c.panel;
  ctx.fill();
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  text(ctx, 'volan', fx, fy + Rf * 0.62, { size: 11, color: c.ink, align: 'center', baseline: 'middle', weight: 600 });

  // ----- pinion -----
  gearPath(ctx, px, py, Rp - 1.25 * m, Rp + m, N_PINION, s.pinion);
  ctx.fillStyle = s.engage > 0.5 ? c.accent2 : mix(c.accent2, c.panel, 0.45);
  ctx.fill();
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, py, Rp * 0.3, 0, TAU);
  ctx.fillStyle = c.panel;
  ctx.fill();
  ctx.stroke();
  text(ctx, 'pinyon', px + 4, py + Rp + m + 4, { size: 11, color: c.accent2, align: 'left', baseline: 'top', weight: 600 });

  // ----- battery (top-left), switch and wiring -----
  const bw = Math.max(46, Rf * 0.6);
  const bh = Math.max(24, Rf * 0.3);
  const bx = b.x + 14;
  const by = top + 2;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fillStyle = alpha(c.good, 0.18);
  ctx.fill();
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(bx + (bw * i) / 3, by + 3);
    ctx.lineTo(bx + (bw * i) / 3, by + bh - 3);
    ctx.stroke();
  }
  text(ctx, '6 V akü', bx + 16, by + bh + 3, { size: 11, color: c.muted, baseline: 'top' });
  text(ctx, '+', bx + bw - 6, by - 1, { size: 12, weight: 700, color: c.ink, align: 'center', baseline: 'bottom' });
  ground(ctx, bx + 8, by + bh + 26, c.muted);
  ctx.beginPath();
  ctx.moveTo(bx + 8, by + bh);
  ctx.lineTo(bx + 8, by + bh + 20);
  ctx.stroke();
  // motor case is earthed to the chassis
  const mBot = { x: mx - uy * (mw / 2) * -1, y: my + Math.abs(ux) * (mw / 2) };
  ground(ctx, mBot.x, mBot.y + 14, c.muted);
  ctx.beginPath();
  ctx.moveTo(mBot.x, mBot.y);
  ctx.lineTo(mBot.x, mBot.y + 8);
  ctx.stroke();
  // + wire: battery → right → down (switch on the way) → motor terminal
  const wx = mx;
  const wy = by + 6;
  const mTop = my - Math.abs(ux) * (mw / 2) - 2;
  const swA = wy + (mTop - wy) * 0.3;
  const swB = swA + Math.min(26, (mTop - wy) * 0.25);
  const path: [number, number][] = [
    [bx + bw, wy],
    [wx, wy],
    [wx, swA],
    [wx, swB],
    [wx, mTop],
  ];
  ctx.strokeStyle = current ? c.warn : c.ink;
  ctx.lineWidth = current ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.moveTo(path[0][0], path[0][1]);
  ctx.lineTo(path[1][0], path[1][1]);
  ctx.lineTo(path[2][0], path[2][1]);
  ctx.moveTo(path[3][0], path[3][1]);
  ctx.lineTo(path[4][0], path[4][1]);
  ctx.stroke();
  // switch blade: hinged at A, touches B when closed
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wx, swA);
  if (current) ctx.lineTo(wx, swB);
  else ctx.lineTo(wx - (swB - swA) * 0.6, swB - 3);
  ctx.stroke();
  for (const sy of [swA, swB]) {
    ctx.beginPath();
    ctx.arc(wx, sy, 2.5, 0, TAU);
    ctx.fillStyle = c.ink;
    ctx.fill();
  }
  text(ctx, 'düğme', wx + 7, (swA + swB) / 2, { size: 11, color: c.muted, baseline: 'middle' });
  // current dots along the live wire
  if (current) {
    const segs: number[] = [];
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      segs.push(l);
      total += l;
    }
    ctx.fillStyle = c.warn;
    for (let k = 0; k < 10; k++) {
      let dd = (t * 70 + (k * total) / 10) % total;
      let i = 0;
      while (i < segs.length - 1 && dd > segs[i]) dd -= segs[i++];
      const q = segs[i] ? dd / segs[i] : 0;
      ctx.beginPath();
      ctx.arc(lerp(path[i][0], path[i + 1][0], q), lerp(path[i][1], path[i + 1][1], q), 2.6, 0, TAU);
      ctx.fill();
    }
    text(ctx, '≈200 A', wx + 7, (wy + swA) / 2, { size: 11, weight: 700, mono: true, color: c.warn, baseline: 'middle' });
  }

  // ----- status + rpm -----
  const status: Record<Phase, [string, string]> = {
    idle: ['Hazır: marşa basın', c.muted],
    engage: ['Pinyon öne kayar, volana kavrar', c.accent2],
    crank: ['Marş motoru motoru çeviriyor', c.warn],
    fire: ['Ateşledi! Pinyon geri fırlar', c.good],
    run: ['Motor kendi gücüyle çalışıyor', c.good],
    stop: ['Kontak kapatıldı', c.muted],
  };
  const [msg, col] = status[s.phase];
  text(ctx, msg, b.x + 12, b.y + b.h - 12 - f * 1.35, { size: f - 1, weight: 700, color: col, baseline: 'bottom', maxWidth: b.w - 24 });
  text(ctx, `Motor: ${fmt(Math.round(s.rpm / 10) * 10)} d/dk`, b.x + 12, b.y + b.h - 10, { size: f - 1, weight: 600, mono: true, color: c.ink, baseline: 'bottom' });
}

function step(s: StarterState, t: number, dt: number) {
  const age = t - s.since;
  const go = (p: Phase) => {
    s.phase = p;
    s.since = t;
  };
  let target = 0;
  switch (s.phase) {
    case 'idle':
      if (s.pressed || age > 2.2) go('engage'); // auto-demo when left alone
      s.pressed = false;
      break;
    case 'engage':
      s.engage = sstep(0, 0.4, age);
      if (age > 0.45) go('crank');
      break;
    case 'crank':
      s.engage = 1;
      target = CRANK_RPM;
      if (age > 1.6) go('fire');
      break;
    case 'fire':
      target = IDLE_RPM;
      s.engage = 1 - sstep(0.1, 0.4, age); // Bendix drive throws the pinion back out
      if (age > 0.6) go('run');
      break;
    case 'run':
      s.engage = 0;
      target = IDLE_RPM;
      if (age > 3.2) go('stop');
      break;
    case 'stop':
      target = 0;
      if (age > 1.6 && s.rpm < 5) go('idle');
      break;
  }
  if (s.phase !== 'idle') s.pressed = false;
  // first-order lag towards the target speed (motor torque / engine inertia)
  const tau = s.phase === 'fire' ? 0.25 : s.phase === 'stop' ? 0.5 : 0.35;
  s.rpm += (target - s.rpm) * clamp(dt / tau, 0, 1);
  s.ring += ((s.rpm / 60) * TAU * VIS) * dt;
  // hand crank loop
  s.crankT += dt;
  const tl = s.crankT % CRANK_PERIOD;
  if (tl < 3.0) s.crank += 1.1 * TAU * dt * 0.8;
  else if (tl < 3.35) s.crank -= ((1.3 * TAU) / 0.35) * dt * (1 - (tl - 3.0) / 0.35) * 2;
}

export function ElectricStarter() {
  const st = useRef<StarterState>({
    phase: 'idle',
    since: 0,
    rpm: 0,
    ring: 0,
    pinion: 0,
    engage: 0,
    pressed: false,
    crank: -Math.PI / 2,
    crankT: 0,
  });
  const now = useRef(0);

  const ref = useCanvasAnimation(
    (ctx, t, w, h, c, dt) => {
      now.current = t;
      const s = st.current;
      if (dt > 0) step(s, t, dt);
      const f = fs(w);
      const wide = w >= 560;
      const left: Box = wide ? { x: 0, y: 0, w: w * 0.44, h } : { x: 0, y: 0, w, h: h * 0.45 };
      const right: Box = wide ? { x: w * 0.44, y: 0, w: w * 0.56, h } : { x: 0, y: h * 0.45, w, h: h * 0.55 };
      drawHandCrank(ctx, left, c, s, f);
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (wide) {
        ctx.moveTo(right.x, 12);
        ctx.lineTo(right.x, h - 12);
      } else {
        ctx.moveTo(12, right.y);
        ctx.lineTo(w - 12, right.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      drawStarter(ctx, right, c, s, t, f);
    },
    [],
    { aspect: (w) => (w >= 700 ? 2.15 : w >= 560 ? 1.9 : 0.62) },
  );

  return (
    <AnimFrame
      name="electricStarter"
      canvasRef={ref}
      label="Solda motoru elle çeviren biri ve geri tepme tehlikesi; sağda akü, marş motoru ve volan dişlisine kavrayan pinyon ile elektrikli marş."
      controls={
        <Button
          primary
          onClick={() => {
            const s = st.current;
            if (s.phase === 'idle') s.pressed = true;
            else if (s.phase === 'stop' && s.rpm < 60) {
              s.phase = 'engage';
              s.since = now.current;
            }
          }}
        >
          Marşa bas
        </Button>
      }
      note={
        <>
          Kettering’in marşı küçük bir elektrik motoruyla krankı çevirir; pinyon (Bendix) ancak marş sırasında volan
          dişlisine girer, motor çalışınca geri fırlar. Elle çevirme zahmeti ve tehlikesi bitti; otomobil kadın ve yaşlı
          sürücülere de açıldı.
        </>
      }
    />
  );
}
