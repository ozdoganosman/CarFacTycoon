import { useRef, useState } from 'react';
import type { ThemeColors } from '../../theme';
import { useCanvasAnimation } from '../useCanvasAnimation';
import { AnimFrame, Button, Slider } from './controls';
import { TAU, alpha, clamp, fmt, fs, hash01, mix, mod, roundRect, sstep, text, type Ctx } from './draw';

// Brushed varnish, ~1920: 7 coats; each is brushed (~0.3 day), left to dry (~2.5 days), then sanded.
const COATS = 7;
const COAT_DAYS = 3;
const T_VARNISH = COATS * COAT_DAYS + 0.5; // + final rub-down ≈ 21.5 days ≈ 3 weeks
// Duco nitrocellulose lacquer, 1924: sprayed, dry to the touch in minutes, ready in hours.
const T_DUCO = 0.25; // ≈ 6 hours
const ARRIVALS = 1; // bodies per day entering each paint shop
const AXIS_DAYS = 24;
const LOOP_DAYS = 36;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Side-view car body silhouette, (x, y) = bottom-left. */
function bodyShape(ctx: Ctx, x: number, y: number, L: number) {
  const h = L * 0.42;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h * 0.55);
  ctx.quadraticCurveTo(x + L * 0.02, y - h * 0.62, x + L * 0.12, y - h * 0.62);
  ctx.lineTo(x + L * 0.28, y - h * 0.62);
  ctx.lineTo(x + L * 0.34, y - h);
  ctx.lineTo(x + L * 0.62, y - h);
  ctx.lineTo(x + L * 0.66, y - h * 0.62);
  ctx.lineTo(x + L * 0.97, y - h * 0.55);
  ctx.lineTo(x + L, y - h * 0.2);
  ctx.lineTo(x + L, y);
  ctx.closePath();
}

function laneHeader(ctx: Ctx, b: Box, title: string, sub: string, f: number, c: ThemeColors, color: string) {
  text(ctx, title, b.x + 12, b.y + 6, { size: f, weight: 700, color, baseline: 'top' });
  text(ctx, sub, b.x + 12, b.y + 6 + f * 1.35, { size: 11, color: c.muted, baseline: 'top', maxWidth: b.w - 24 });
}

/** Grid of bodies waiting on the drying rack (up to 22 shown). */
function rack(ctx: Ctx, b: Box, n: number, done: number, color: string, c: ThemeColors, narrow: boolean) {
  const cap = 22;
  const inner: Box = { x: b.x, y: b.y + 18, w: b.w, h: b.h - 18 };
  ctx.fillStyle = alpha(c.line, 0.35);
  roundRect(ctx, inner.x, inner.y, inner.w, inner.h, 6);
  ctx.fill();
  const nw = text(ctx, String(n), b.x + b.w - 2, b.y - 2, { size: 15, weight: 800, mono: true, color: n > 3 ? c.bad : c.good, align: 'right', baseline: 'top' });
  text(ctx, narrow ? 'Bekleyen' : 'Kurumayı bekleyen gövde', b.x + 2, b.y, { size: 11, color: c.muted, baseline: 'top', maxWidth: b.w - nw - 10 });
  // largest icon size that fits the whole capacity in the box
  let iconL = 44;
  let cols = 1;
  for (; iconL > 10; iconL -= 1) {
    cols = Math.floor((inner.w - 8) / (iconL + 4));
    const rows = Math.ceil(cap / Math.max(1, cols));
    if (cols > 0 && rows * (iconL * 0.45 + 5) <= inner.h - 22) break;
  }
  const rowH = iconL * 0.45 + 5;
  for (let i = 0; i < Math.min(n, cap); i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.fillStyle = color;
    bodyShape(ctx, inner.x + 6 + col * (iconL + 4), inner.y + 6 + (row + 1) * rowH - 4, iconL);
    ctx.fill();
  }
  text(ctx, `biten: ${fmt(done)}`, inner.x + inner.w - 6, inner.y + inner.h - 5, { size: 11, mono: true, weight: 700, color: c.ink, align: 'right', baseline: 'bottom' });
}

function timeline(ctx: Ctx, b: Box, segs: [number, number, string][], cursor: number, c: ThemeColors, ticks: boolean, note: string, noteColor: string) {
  const X = (d: number) => b.x + (d / AXIS_DAYS) * b.w;
  const y = b.y;
  const bh = 10;
  ctx.fillStyle = alpha(c.line, 0.5);
  ctx.fillRect(b.x, y, b.w, bh);
  for (const [d0, d1, col] of segs) {
    ctx.fillStyle = col;
    ctx.fillRect(X(d0), y, Math.max(1.5, X(d1) - X(d0)), bh);
  }
  // cursor
  const cx = X(cursor);
  ctx.fillStyle = c.ink;
  ctx.beginPath();
  ctx.moveTo(cx, y - 1);
  ctx.lineTo(cx - 5, y - 8);
  ctx.lineTo(cx + 5, y - 8);
  ctx.closePath();
  ctx.fill();
  if (ticks) {
    for (let d = 0; d <= AXIS_DAYS; d += 7) {
      ctx.fillStyle = c.muted;
      ctx.fillRect(X(d), y + bh, 1, 4);
      const lab = d === 0 ? '0' : `${d / 7} hf`;
      text(ctx, lab, X(d), y + bh + 5, { size: 11, color: c.muted, align: d === 0 ? 'left' : 'center', baseline: 'top' });
    }
  }
  const segEnd = segs.length ? X(segs[segs.length - 1][1]) : b.x;
  text(ctx, note, Math.max(segEnd + 8, b.x + 8), y + bh / 2, { size: 11, weight: 700, color: noteColor, baseline: 'middle', maxWidth: b.x + b.w - segEnd - 8 });
}

function drawDuco(ctx: Ctx, w: number, h: number, c: ThemeColors, day: number, t: number) {
  const f = fs(w);
  const narrow = w < 520;
  const clockH = 22;
  text(ctx, `Gün ${fmt(Math.floor(day))}`, 12, 6, { size: f, weight: 700, mono: true, color: c.ink, baseline: 'top' });
  text(ctx, '(her iki atölyeye günde 1 gövde girer)', 12 + f * 4.8, 6 + 1, { size: 11, color: c.muted, baseline: 'top' });
  const laneH = (h - clockH) / 2;
  const varnishC = c.accent;
  const ducoC = c.accent2;
  const primer = mix(c.metal, c.panel, 0.3);

  for (let lane = 0; lane < 2; lane++) {
    const L: Box = { x: 0, y: clockH + lane * laneH, w, h: laneH };
    const isV = lane === 0;
    laneHeader(
      ctx,
      L,
      isV ? 'Fırçayla vernik (≈1920)' : 'Duco sprey lak (1924)',
      isV ? `${COATS} kat; her kat günlerce kurur, sonra zımparalanır` : 'Tabancayla püskürtülür, saatler içinde kurur',
      f,
      c,
      isV ? varnishC : ducoC,
    );
    const headH = 6 + f * 1.35 + 11 * 1.3 + 8;
    const tlH = isV ? 38 : 26;
    const content: Box = { x: 12, y: L.y + headH, w: w - 24, h: laneH - headH - tlH - 6 };
    const animW = Math.min(content.w * (narrow ? 0.42 : 0.34), 220);
    const anim: Box = { x: content.x, y: content.y, w: animW, h: content.h };
    const rackB: Box = { x: content.x + animW + 14, y: content.y, w: content.w - animW - 14, h: content.h };

    // --- painting animation ---
    const bodyL = Math.min(anim.w * 0.72, anim.h * 1.2);
    const bx = anim.x + (anim.w - bodyL) / 2 + (isV ? 0 : anim.w * 0.08);
    const by = anim.y + anim.h - 4;
    if (isV) {
      // first body's progress drives the coat count and brushing / drying state
      const prog = clamp(day, 0, T_VARNISH);
      const coat = Math.min(COATS, Math.floor(prog / COAT_DAYS) + 1);
      const inCoat = mod(prog, COAT_DAYS);
      const brushing = prog < COATS * COAT_DAYS && inCoat < 0.35;
      const done = day >= T_VARNISH;
      const paint = mix(primer, varnishC, clamp((coat - (brushing ? 1 : 0) + (brushing ? inCoat / 0.35 : 0)) / COATS, 0, 1));
      ctx.fillStyle = paint;
      bodyShape(ctx, bx, by, bodyL);
      ctx.fill();
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // gloss highlight grows with coats
      ctx.strokeStyle = alpha(c.panel, 0.25 + 0.05 * coat);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx + bodyL * 0.08, by - bodyL * 0.2);
      ctx.lineTo(bx + bodyL * 0.3, by - bodyL * 0.2);
      ctx.stroke();
      if (brushing) {
        const q = inCoat / 0.35;
        const brX = bx + bodyL * (0.05 + 0.9 * (0.5 - 0.5 * Math.cos(q * Math.PI * 6)));
        const brY = by - bodyL * 0.28;
        ctx.save();
        ctx.translate(brX, brY);
        ctx.rotate(-0.5);
        ctx.fillStyle = c.warn;
        ctx.fillRect(-2, -bodyL * 0.22, 4, bodyL * 0.16);
        ctx.fillStyle = c.ink;
        ctx.fillRect(-5, -bodyL * 0.07, 10, bodyL * 0.08);
        ctx.restore();
      } else if (!done) {
        // drying: rising solvent wisps, and the wait
        ctx.strokeStyle = alpha(c.muted, 0.6);
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const wx = bx + bodyL * (0.25 + i * 0.25);
          const ph = mod(t * 0.6 + i * 0.33, 1);
          ctx.globalAlpha = 1 - ph;
          ctx.beginPath();
          for (let k = 0; k <= 10; k++) {
            const yy = by - bodyL * 0.45 - ph * 14 - k * 1.6;
            const xx = wx + Math.sin(k * 0.8 + t * 3 + i) * 3;
            if (k) ctx.lineTo(xx, yy);
            else ctx.moveTo(xx, yy);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      const status = done ? 'Bitti: 1. gövde' : brushing ? `${coat}. kat sürülüyor` : `${coat}. kat kuruyor…`;
      text(ctx, status, anim.x, anim.y, { size: 11, weight: 700, color: brushing ? varnishC : c.muted, baseline: 'top' });
    } else {
      // spray loop: the gun passes along the body, then the next body rolls in
      const cyc = 1.5;
      const q = mod(t, cyc) / cyc;
      const sprayQ = clamp(q / 0.65, 0, 1);
      const slide = sstep(0.75, 1, q);
      const ox = -slide * (bodyL + 20);
      ctx.save();
      ctx.beginPath();
      ctx.rect(anim.x, anim.y, anim.w, anim.h);
      ctx.clip();
      for (const [dx, pr] of [
        [ox, sprayQ],
        [ox + bodyL + 20, 0],
      ] as const) {
        const x0 = bx + dx;
        ctx.fillStyle = primer;
        bodyShape(ctx, x0, by, bodyL);
        ctx.fill();
        if (pr > 0) {
          ctx.save();
          bodyShape(ctx, x0, by, bodyL);
          ctx.clip();
          ctx.fillStyle = ducoC;
          ctx.fillRect(x0, by - bodyL, bodyL * pr, bodyL);
          ctx.restore();
        }
        bodyShape(ctx, x0, by, bodyL);
        ctx.strokeStyle = c.ink;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
      if (q < 0.7) {
        // gun + mist cone
        const gx = bx + bodyL * sprayQ;
        const gy = by - bodyL * 0.42 - 8;
        ctx.fillStyle = c.ink;
        ctx.fillRect(gx - 4, gy - 16, 8, 6);
        ctx.fillRect(gx - 1.5, gy - 12, 3, 8);
        ctx.fillRect(gx + 3, gy - 20, 3, 8);
        for (let i = 0; i < 18; i++) {
          const r1 = hash01(i + Math.floor(t * 30) * 17);
          const r2 = hash01(i * 3 + Math.floor(t * 30) * 5);
          const dd = r1 * bodyL * 0.3;
          ctx.fillStyle = alpha(ducoC, 0.7 * (1 - r1));
          ctx.beginPath();
          ctx.arc(gx + (r2 - 0.5) * dd * 0.9, gy - 4 + dd, 1.4, 0, TAU);
          ctx.fill();
        }
      }
      text(ctx, 'püskürtme', anim.x, anim.y, { size: 11, weight: 700, color: ducoC, baseline: 'top' });
    }

    // --- drying rack: bodies that must wait ---
    // a body enters at the start of each day and leaves T days later
    const T = isV ? T_VARNISH : T_DUCO;
    const entered = Math.floor(day * ARRIVALS) + 1;
    const finished = day >= T ? Math.floor((day - T) * ARRIVALS) + 1 : 0;
    rack(ctx, rackB, entered - finished, finished, isV ? alpha(varnishC, 0.8) : alpha(ducoC, 0.8), c, narrow);

    // --- timeline (shared day scale) ---
    const tl: Box = { x: 12, y: L.y + laneH - tlH + 2, w: w - 24, h: tlH };
    const segs: [number, number, string][] = [];
    if (isV) {
      for (let k = 0; k < COATS; k++) {
        const s0 = k * COAT_DAYS;
        segs.push([s0, s0 + 0.35, varnishC]);
        segs.push([s0 + 0.35, s0 + COAT_DAYS - 0.2, alpha(varnishC, 0.25)]);
        segs.push([s0 + COAT_DAYS - 0.2, s0 + COAT_DAYS, c.warn]);
      }
      segs.push([COATS * COAT_DAYS, T_VARNISH, c.good]);
      timeline(ctx, tl, segs, clamp(day, 0, T_VARNISH), c, true, '', c.ink);
    } else {
      segs.push([0, 0.05, ducoC], [0.05, 0.2, alpha(ducoC, 0.35)], [0.2, T_DUCO, c.good]);
      timeline(ctx, tl, segs, Math.min(mod(day, 1), T_DUCO), c, false, '≈ 6 saat (aynı ölçek!)', ducoC);
    }
  }
  // divider
  ctx.strokeStyle = c.line;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(12, clockH + laneH);
  ctx.lineTo(w - 12, clockH + laneH);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function Duco() {
  const [speed, setSpeed] = useState(1);
  const sim = useRef({ day: 0, hold: 0 });

  const ref = useCanvasAnimation(
    (ctx, t, w, h, c, dt) => {
      const s = sim.current;
      if (s.hold > 0) {
        s.hold -= dt;
        if (s.hold <= 0) s.day = 0;
      } else {
        s.day += dt * speed;
        if (s.day >= LOOP_DAYS) {
          s.day = LOOP_DAYS;
          s.hold = 2.5;
        }
      }
      drawDuco(ctx, w, h, c, s.day, t);
    },
    [speed],
    { aspect: (w) => (w < 520 ? 0.85 : w < 700 ? 1.7 : 2.1) },
  );

  return (
    <AnimFrame
      name="duco"
      canvasRef={ref}
      label="Fırçayla vernik kat kat sürülüp haftalarca kururken gövdeler raflarda birikiyor; Duco sprey lak birkaç saatte kuruyor ve raf boş kalıyor."
      controls={
        <>
          <Slider label="Hız" value={speed} min={0.25} max={3} step={0.25} onChange={setSpeed} format={(v) => `${fmt(v, 2)} gün/sn`} />
          <Button
            onClick={() => {
              sim.current.day = 0;
              sim.current.hold = 0;
            }}
          >
            Sıfırla
          </Button>
        </>
      }
      note={
        <>
          Vernikle boyamak haftalar sürer; her gün giren gövdeler rafta bekler, fabrika alanı ve sermaye bağlanır. Bu
          yüzden Model T 1914–25 arası yalnız <strong>siyah “Japan” emaye</strong> ile boyandı: en hızlı kuruyan boya
          oydu. DuPont’un nitroselüloz <strong>Duco</strong> lakı (ilk kez 1924 Oakland’da) tabancayla püskürtülür, saatler
          içinde kurur ve renkli araçları ucuzlatır.
        </>
      }
    />
  );
}
