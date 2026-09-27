import { useRef, useState } from 'react';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Button, Slider } from './controls';
import { TAU, alpha, clamp, fmt, fs, mix, mod, sstep, text, worker, type Ctx } from './draw';

const T_STATIC = 750; // min per chassis, stationary assembly (≈12.5 h, 1913)
const T_LINE = 93; // min per chassis on the moving line (1914)
const SIM_RATE = 30; // simulated minutes per screen second at speed 1
const LOOP = 1560; // restart after 26 simulated hours

const TASKS = ['Aks', 'Tekerlek', 'Motor', 'Kaporta'];
const taskColors = (c: ThemeColors) => [c.accent2, c.good, c.warn, c.accent];

/** A part being fitted glows in its task colour, then settles to its normal colour. */
const partColor = (task: string, normal: string, a: number) => mix(task, normal, sstep(0.55, 1, a));

/**
 * Side view of a Model T–like chassis. `a[k]` is completion (0..1) of task k.
 * `L` is the overall length in px, (x, yGround) the centre of the car on the floor.
 */
function drawCar(ctx: Ctx, x: number, yGround: number, L: number, a: number[], c: ThemeColors) {
  const tc = taskColors(c);
  const R = 0.16 * L;
  const yFrame = yGround - R - 0.03 * L;
  const frameH = Math.max(3, 0.05 * L);
  const wheelX = [x - 0.33 * L, x + 0.31 * L];
  const lw = Math.max(1, L / 70);
  ctx.save();
  ctx.lineJoin = 'round';
  const baseAlpha = ctx.globalAlpha;

  // trestles under a bare frame (fade out once the wheels carry it)
  const standA = 1 - a[1];
  if (standA > 0.01) {
    ctx.globalAlpha = baseAlpha * standA;
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (const wx of wheelX) {
      ctx.moveTo(wx - 0.08 * L, yGround);
      ctx.lineTo(wx, yFrame + frameH);
      ctx.lineTo(wx + 0.08 * L, yGround);
    }
    ctx.stroke();
  }

  // body (task 3) – behind wheels/fenders
  if (a[3] > 0.01) {
    ctx.globalAlpha = baseAlpha * clamp(a[3] * 1.6, 0, 1);
    const bodyC = partColor(tc[3], mix(c.ink, c.panel, 0.12), a[3]);
    ctx.fillStyle = bodyC;
    ctx.beginPath(); // rear tub + seat back + cowl
    ctx.moveTo(x - 0.44 * L, yFrame);
    ctx.lineTo(x - 0.44 * L, yFrame - 0.2 * L);
    ctx.quadraticCurveTo(x - 0.42 * L, yFrame - 0.3 * L, x - 0.3 * L, yFrame - 0.3 * L);
    ctx.lineTo(x - 0.12 * L, yFrame - 0.3 * L);
    ctx.lineTo(x - 0.1 * L, yFrame - 0.16 * L);
    ctx.lineTo(x + 0.06 * L, yFrame - 0.16 * L);
    ctx.lineTo(x + 0.1 * L, yFrame - 0.22 * L);
    ctx.lineTo(x + 0.12 * L, yFrame);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // hood
    ctx.moveTo(x + 0.12 * L, yFrame);
    ctx.lineTo(x + 0.12 * L, yFrame - 0.2 * L);
    ctx.lineTo(x + 0.41 * L, yFrame - 0.18 * L);
    ctx.lineTo(x + 0.41 * L, yFrame);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = bodyC;
    ctx.lineWidth = lw;
    ctx.beginPath(); // windscreen + steering column
    ctx.moveTo(x + 0.1 * L, yFrame - 0.22 * L);
    ctx.lineTo(x + 0.08 * L, yFrame - 0.42 * L);
    ctx.moveTo(x + 0.06 * L, yFrame - 0.18 * L);
    ctx.lineTo(x - 0.02 * L, yFrame - 0.3 * L);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, L / 45);
    ctx.beginPath(); // fenders
    for (const wx of wheelX) {
      ctx.moveTo(wx - R * 1.25, yFrame + 0.01 * L);
      ctx.quadraticCurveTo(wx, yFrame - R * 0.9, wx + R * 1.25, yFrame + 0.01 * L);
    }
    ctx.stroke();
  }

  // frame rails
  ctx.globalAlpha = baseAlpha;
  ctx.fillStyle = mix(c.metal, c.ink, 0.25);
  ctx.fillRect(x - 0.46 * L, yFrame, 0.92 * L, frameH);

  // engine + radiator (task 2)
  if (a[2] > 0.01) {
    ctx.globalAlpha = baseAlpha * clamp(a[2] * 1.6, 0, 1);
    ctx.fillStyle = partColor(tc[2], c.metal, a[2]);
    ctx.fillRect(x + 0.16 * L, yFrame - 0.15 * L, 0.2 * L, 0.15 * L);
    ctx.fillStyle = partColor(tc[2], mix(c.metal, c.ink, 0.35), a[2]);
    ctx.fillRect(x + 0.4 * L, yFrame - 0.24 * L, 0.05 * L, 0.24 * L);
  }

  // springs + axles (task 0)
  if (a[0] > 0.01) {
    ctx.globalAlpha = baseAlpha * clamp(a[0] * 1.6, 0, 1);
    ctx.strokeStyle = partColor(tc[0], c.ink, a[0]);
    ctx.lineWidth = Math.max(1.5, L / 50);
    ctx.beginPath();
    for (const wx of wheelX) {
      // transverse leaf spring (seen end-on) + axle down to the hub
      ctx.moveTo(wx - 0.08 * L, yFrame + frameH);
      ctx.quadraticCurveTo(wx, yFrame + frameH + 0.07 * L, wx + 0.08 * L, yFrame + frameH);
      ctx.moveTo(wx, yFrame + frameH + 0.035 * L);
      ctx.lineTo(wx, yGround - R);
    }
    ctx.stroke();
  }

  // wheels (task 1)
  if (a[1] > 0.01) {
    ctx.globalAlpha = baseAlpha * clamp(a[1] * 1.6, 0, 1);
    const wc = partColor(tc[1], c.ink, a[1]);
    for (const wx of wheelX) {
      const wy = yGround - R;
      ctx.strokeStyle = wc;
      ctx.lineWidth = Math.max(2, R * 0.28);
      ctx.beginPath();
      ctx.arc(wx, wy, R * 0.86, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, R * 0.08);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * Math.PI;
        ctx.moveTo(wx - Math.cos(an) * R * 0.72, wy - Math.sin(an) * R * 0.72);
        ctx.lineTo(wx + Math.cos(an) * R * 0.72, wy + Math.sin(an) * R * 0.72);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Tiny finished-car icon for the tally. */
function miniCar(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - s * 0.45, s, s * 0.3);
  ctx.fillRect(x + s * 0.1, y - s * 0.75, s * 0.45, s * 0.32);
  ctx.beginPath();
  ctx.arc(x + s * 0.2, y - s * 0.12, s * 0.14, 0, TAU);
  ctx.arc(x + s * 0.8, y - s * 0.12, s * 0.14, 0, TAU);
  ctx.fill();
}

interface Lane {
  y0: number;
  yScene: number;
  yG: number;
}

function laneHeader(ctx: Ctx, w: number, pad: number, y: number, title: string, sub: string, f: number, c: ThemeColors) {
  text(ctx, title, pad, y, { size: f + 1, weight: 700, color: c.ink, baseline: 'top' });
  text(ctx, sub, pad, y + (f + 1) * 1.35, { size: f - 1, color: c.muted, baseline: 'top', maxWidth: w - pad * 2 });
}

/** Counter at the top-right of a lane's scene. */
function counter(ctx: Ctx, w: number, pad: number, y: number, done: number, f: number, c: ThemeColors, color: string) {
  const nw = text(ctx, String(done), w - pad, y, { size: f + 8, weight: 800, mono: true, color, align: 'right', baseline: 'top' });
  text(ctx, 'biten araç', w - pad - nw - 6, y + (f + 8) * 0.5, { size: 11, color: c.muted, align: 'right', baseline: 'middle' });
  const s = 12;
  const perRow = Math.max(4, Math.floor((w * 0.4) / (s + 3)));
  const shown = Math.min(done, perRow);
  for (let i = 0; i < shown; i++) miniCar(ctx, w - pad - (i + 1) * (s + 3) + 3, y + f + 8 + 16, s, alpha(color, 0.85));
}

function drawLine(ctx: Ctx, w: number, h: number, c: ThemeColors, simMin: number) {
  const f = fs(w);
  const tc = taskColors(c);
  const narrow = w < 480;
  const pad = 12;
  const clockH = 24;
  const laneH = (h - clockH) / 2;
  const headerH = (f + 1) * 1.35 + f * 1.3 + 8;
  const labelH = 20;
  const lanes: Lane[] = [0, 1].map((i) => {
    const y0 = clockH + i * laneH;
    return { y0, yScene: y0 + headerH, yG: y0 + laneH - labelH };
  });
  const x0 = pad + 4;
  const x1 = w - pad - 4;
  const span = (x1 - x0) / 5; // moving line: stations at 1..4, entry at 0, exit at 5
  const sceneH = lanes[0].yG - lanes[0].yScene;
  const L = Math.min(span * 0.86, (sceneH - 6) / 0.62, 150); // car length, same scale in both lanes
  const workSz = L * 0.5;

  // clock
  const hh = Math.floor(simMin / 60);
  const mm = Math.floor(simMin % 60);
  text(ctx, `Geçen süre: ${hh} sa ${String(mm).padStart(2, '0')} dk`, pad, 8, { size: 11, mono: true, weight: 600, color: c.ink, baseline: 'top' });

  // ----- top: stationary assembly -----
  {
    const { y0, yScene, yG } = lanes[0];
    laneHeader(ctx, w, pad, y0 + 2, 'Sabit istasyon (1908)', narrow ? '≈12,5 saat / şasi · ekip her işi yapar' : 'Ekip tek şasinin etrafında dolaşıp her işi yapar · ≈12,5 saat / şasi', f, c);
    counter(ctx, w, pad, yScene, Math.floor(simMin / T_STATIC), f, c, c.muted);
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, yG + 1);
    ctx.lineTo(w - pad, yG + 1);
    ctx.stroke();

    const p = mod(simMin, T_STATIC) / T_STATIC;
    const build = clamp(p / 0.94, 0, 1);
    const a = [0, 1, 2, 3].map((k) => clamp(build * 4 - k, 0, 1));
    const task = Math.min(3, Math.floor(build * 4));
    const drive = clamp((p - 0.94) / 0.06, 0, 1); // finished car rolls away
    const bayX = x0 + span * 2.6;
    const pileX = x0 + L * 0.35;
    // parts pile (all kinds of parts in one place → walking & searching)
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = alpha(tc[i], 0.3);
      ctx.strokeStyle = tc[i];
      ctx.lineWidth = 1;
      const bw = L * 0.3;
      const bh = L * 0.14;
      const bx = pileX - bw + (i % 2) * bw;
      const by = yG - bh * (1 + Math.floor(i / 2));
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    }
    text(ctx, 'Parçalar', pileX, yG + 5, { size: 11, color: c.muted, align: 'center', baseline: 'top' });
    ctx.globalAlpha = 1 - drive;
    drawCar(ctx, bayX + drive * span * 1.5, yG, L, a, c);
    ctx.globalAlpha = 1;
    text(ctx, drive > 0 ? 'Bitti!' : `Şimdi herkes: ${TASKS[task]}`, bayX, yG + 5, {
      size: 11,
      color: drive > 0 ? c.good : tc[task],
      align: 'center',
      baseline: 'top',
      weight: 700,
    });
    // four workers: walk to the pile, carry a part back, work on the car, repeat
    const pileStop = pileX + L * 0.38;
    for (let i = 0; i < 4; i++) {
      const ph = mod(simMin / 55 + i * 0.27, 1);
      const slot = bayX + (i - 1.5) * L * 0.3;
      let wx: number;
      let swing = 0;
      let carrying = false;
      if (ph < 0.35) wx = slot + (pileStop - slot) * (ph / 0.35);
      else if (ph < 0.42) wx = pileStop;
      else if (ph < 0.77) {
        wx = pileStop + (slot - pileStop) * ((ph - 0.42) / 0.35);
        carrying = true;
      } else {
        wx = slot;
        swing = Math.sin(simMin * 2.2 + i) * 0.9;
      }
      const facing = ph < 0.35 ? -1 : 1;
      const bob = ph < 0.77 ? Math.abs(Math.sin(simMin * 1.4 + i)) * 1.5 : 0;
      worker(ctx, wx, yG - bob, workSz, tc[task], c.ink, swing, facing);
      if (carrying) {
        ctx.fillStyle = tc[task];
        ctx.fillRect(wx + facing * workSz * 0.15, yG - workSz * 0.62, workSz * 0.22, workSz * 0.14);
      }
    }
  }

  // divider
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad, lanes[1].y0 - 3);
  ctx.lineTo(w - pad, lanes[1].y0 - 3);
  ctx.stroke();
  ctx.setLineDash([]);

  // ----- bottom: moving line -----
  {
    const { y0, yScene, yG } = lanes[1];
    laneHeader(ctx, w, pad, y0 + 2, 'Hareketli hat (1913)', narrow ? '≈93 dk / şasi · herkes tek iş' : 'Şasi zincirle ilerler, her işçi tek bir işi tekrarlar · ≈93 dk / şasi', f, c);
    counter(ctx, w, pad, yScene, Math.floor(simMin / T_LINE), f, c, c.accent);
    // station bays + task names
    for (let k = 0; k < 4; k++) {
      const sx = x0 + span * (k + 1);
      ctx.fillStyle = alpha(tc[k], 0.1);
      ctx.fillRect(sx - span * 0.46, yG - L * 0.62, span * 0.92, L * 0.62);
      text(ctx, TASKS[k], sx, yG + 7, { size: 11, color: tc[k], align: 'center', baseline: 'top', weight: 700, maxWidth: span * 0.96 });
    }
    // chain conveyor: links move at line speed; arrow shows direction
    const off = mod((simMin / T_LINE) * span, 12);
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -off;
    ctx.beginPath();
    ctx.moveTo(pad, yG + 2);
    ctx.lineTo(w - pad - 8, yG + 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.fillStyle = c.muted;
    ctx.beginPath();
    ctx.moveTo(w - pad, yG + 2);
    ctx.lineTo(w - pad - 8, yG - 3);
    ctx.lineTo(w - pad - 8, yG + 7);
    ctx.closePath();
    ctx.fill();
    // chassis: one every T_LINE minutes, spaced one station apart (the line starts full)
    const o = simMin / T_LINE;
    const frac = o - Math.floor(o);
    const active = [false, false, false, false];
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, yScene, w - pad * 2, yG - yScene + 4);
    ctx.clip();
    for (let m = -1; m <= 5; m++) {
      const s = frac + m; // position in station units
      if (s < -0.6 || s > 5.6) continue;
      const a = [0, 1, 2, 3].map((k) => clamp((s - (k + 1) + 0.3) / 0.6, 0, 1));
      for (let k = 0; k < 4; k++) if (Math.abs(s - (k + 1)) < 0.3) active[k] = true;
      ctx.globalAlpha = s > 4.7 ? clamp(1 - (s - 4.7) / 0.6, 0, 1) : s < 0.2 ? clamp((s + 0.6) / 0.8, 0, 1) : 1;
      drawCar(ctx, x0 + span * s, yG, L, a, c);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // one worker per station, always the same task
    for (let k = 0; k < 4; k++) {
      const sx = x0 + span * (k + 1) - span * 0.4;
      const swing = active[k] ? Math.sin(simMin * 2.4 + k) * 0.9 : 0.4;
      worker(ctx, sx, yG, workSz, tc[k], c.ink, swing, 1);
    }
  }
}

export function MovingLine() {
  const [speed, setSpeed] = useState(1);
  const sim = useRef({ min: 0, hold: 0 });

  const ref = useCanvasAnimation(
    (ctx, _t, w, h, c, dt) => {
      const s = sim.current;
      if (s.hold > 0) {
        s.hold -= dt;
        if (s.hold <= 0) s.min = 0;
      } else {
        s.min += dt * SIM_RATE * speed;
        if (s.min >= LOOP) {
          s.min = LOOP;
          s.hold = 2.5;
        }
      }
      drawLine(ctx, w, h, c, s.min);
    },
    [speed],
    { aspect: (w) => (w < 480 ? 1.15 : w < 700 ? 1.7 : 2.0) },
  );

  return (
    <AnimFrame
      name="movingLine"
      canvasRef={ref}
      label="Üstte sabit istasyonda bir ekip tek şasi üzerinde tüm işleri yapıyor; altta şasiler zincirle istasyonlardan geçiyor ve çok daha hızlı araç çıkıyor."
      controls={
        <>
          <Slider label="Hız" value={speed} min={0.25} max={3} step={0.25} onChange={setSpeed} format={(v) => `${fmt(v, 2)}×`} />
          <Button
            onClick={() => {
              sim.current.min = 0;
              sim.current.hold = 0;
            }}
          >
            Sıfırla
          </Button>
        </>
      }
      note={
        <>
          Ford Highland Park, 1913–14: <strong>şasi montajı ≈12,5 saatten ≈93 dakikaya</strong> indi. İşçi parça
          aramaya yürümez; iş ona gelir ve her işçi tek bir işi tekrarlayarak hızlanır. Bedeli: tekdüze, yıpratıcı iş ve
          yüksek işçi devri (Ford 1914’te günlüğü 5 dolara çıkardı).
        </>
      }
    />
  );
}
