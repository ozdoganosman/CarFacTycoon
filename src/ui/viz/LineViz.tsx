import { useEffect, useRef } from 'react';
import { STAGES, stationDef } from '../../data/stations';
import type { ProductionLine, StageId } from '../../core/types';
import { readThemeColors } from '../theme';
import { t } from '../../i18n';
import { dec } from '../format';

// Animated production line. Each stage works at its own rate; bodies queue up in
// front of the slowest station (the bottleneck) and the stations after it starve.

interface Token {
  stage: number; // index of stage it is in / waiting for
  t: number; // progress 0..1 inside the stage
  state: 'wait' | 'work' | 'move';
  x: number;
}

export function LineViz(props: {
  line: ProductionLine;
  perStage: Record<StageId, number>;
  bottleneck: StageId;
  running: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef(props);
  dataRef.current = props;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let colors = readThemeColors();
    const tokens: Token[] = [];
    let spawnAcc = 0;
    const busy = [0, 0, 0, 0];
    let finished = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colors = readThemeColors();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * (reduce ? 0.3 : 1);
      last = now;
      const { perStage, bottleneck, running, line } = dataRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const rates = STAGES.map((st) => perStage[st.id]);
      const maxRate = Math.max(0.001, ...rates);
      // Visual speed: the fastest stage completes ~1.4 items per second.
      const speed = rates.map((r) => (r / maxRate) * 1.4);
      const colW = w / 4;
      const conveyorY = h * 0.66;
      const stageX = (i: number) => colW * i + colW / 2;

      // --- simulate ---
      if (running && rates[0] > 0) {
        spawnAcc += dt * speed[0];
        const waitingAtFirst = tokens.filter((t) => t.stage === 0 && t.state === 'wait').length;
        if (spawnAcc >= 1 && waitingAtFirst < 3) {
          spawnAcc = 0;
          tokens.push({ stage: 0, t: 0, state: 'wait', x: stageX(0) - colW * 0.45 });
        }
      }
      for (let i = 0; i < 4; i++) {
        const working = tokens.find((t) => t.stage === i && t.state === 'work');
        if (working) {
          working.t += dt * speed[i];
          if (working.t >= 1) {
            working.state = 'move';
            working.stage = i + 1;
            busy[i] = 0;
          }
        } else if (running && speed[i] > 0) {
          const next = tokens
            .filter((t) => t.stage === i && t.state === 'wait')
            .sort((a, b) => b.x - a.x)[0];
          const target = stageX(i);
          if (next && Math.abs(next.x - (target - 18)) < 3) {
            next.state = 'work';
            next.t = 0;
            next.x = target;
            busy[i] = 1;
          }
        }
      }
      // Move tokens toward their stage's queue position.
      for (const t of tokens) {
        if (t.state === 'work') continue;
        if (t.stage >= 4) {
          t.x += dt * 160;
          continue;
        }
        const queue = tokens.filter((o) => o.stage === t.stage && o.state !== 'work' && o !== t && o.x > t.x).length;
        const goal = stageX(t.stage) - 18 - queue * 13;
        t.x = Math.min(goal, t.x + dt * 150);
        if (t.state === 'move' && t.x >= goal - 0.5) t.state = 'wait';
      }
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (tokens[i].x > w + 20) {
          tokens.splice(i, 1);
          finished++;
        }
      }

      // --- draw ---
      ctx.clearRect(0, 0, w, h);
      // conveyor
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(8, conveyorY + 10);
      ctx.lineTo(w - 8, conveyorY + 10);
      ctx.stroke();
      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = running ? -(now / 40) % 12 : 0;
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, conveyorY + 10);
      ctx.lineTo(w - 8, conveyorY + 10);
      ctx.stroke();
      ctx.setLineDash([]);

      STAGES.forEach((st, i) => {
        const x = stageX(i);
        const isB = st.id === bottleneck && running;
        // station block
        const bw = Math.min(colW * 0.7, 120);
        const top = h * 0.12;
        ctx.fillStyle = isB ? colors.bad : colors.panel;
        ctx.globalAlpha = isB ? 0.14 : 1;
        ctx.fillRect(x - bw / 2, top, bw, conveyorY - top - 6);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = isB ? colors.bad : colors.line;
        ctx.lineWidth = isB ? 2 : 1;
        ctx.strokeRect(x - bw / 2 + 0.5, top + 0.5, bw - 1, conveyorY - top - 7);
        // station units as small blocks, colour by generation
        const units = line.stations[st.id];
        const cols = Math.min(4, Math.max(1, units.length));
        const uw = (bw - 12) / cols;
        units.forEach((id, k) => {
          const def = stationDef(id);
          const gen = def.year < 1910 ? 0 : def.year < 1925 ? 1 : def.year < 1945 ? 2 : 3;
          const ux = x - bw / 2 + 6 + (k % cols) * uw;
          const uy = top + 20 + Math.floor(k / cols) * 12;
          ctx.fillStyle = [colors.metal, colors.accent2, colors.good, colors.accent][gen];
          ctx.fillRect(ux + 1, uy, uw - 3, 8);
        });
        // label
        ctx.fillStyle = isB ? colors.bad : colors.ink;
        ctx.font = "600 12px 'Libre Franklin', 'Noto Sans Devanagari', 'Noto Sans Arabic', system-ui, sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText(t(st.name).split(' ')[0], x, top + 13);
        ctx.fillStyle = colors.muted;
        ctx.font = "11px ui-monospace, Menlo, 'Noto Sans Devanagari', 'Noto Sans Arabic', monospace";
        const rate = perStage[st.id];
        ctx.fillText(t('{v}/hf', { v: dec(rate, 1) }), x, conveyorY - 12);
        // work light
        if (busy[i]) {
          ctx.fillStyle = colors.fire;
          ctx.beginPath();
          ctx.arc(x + bw / 2 - 8, top + 9, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // car bodies
      for (const t of tokens) {
        const y = conveyorY;
        ctx.fillStyle = t.stage >= 3 && t.state !== 'wait' ? colors.accent : t.stage >= 3 ? colors.accent : t.stage >= 2 ? colors.metal : colors.muted;
        if (t.stage >= 4) ctx.fillStyle = colors.accent;
        ctx.fillRect(t.x - 6, y - 4, 12, 8);
        ctx.fillStyle = colors.ink;
        ctx.beginPath();
        ctx.arc(t.x - 3.5, y + 5, 2, 0, Math.PI * 2);
        ctx.arc(t.x + 3.5, y + 5, 2, 0, Math.PI * 2);
        ctx.fill();
        if (t.state === 'work') {
          ctx.fillStyle = colors.fire;
          ctx.fillRect(t.x - 6, y - 8, 12 * Math.min(1, t.t), 2);
        }
      }
      if (!running) {
        ctx.fillStyle = colors.muted;
        ctx.font = "12px 'Libre Franklin', 'Noto Sans Devanagari', 'Noto Sans Arabic', system-ui, sans-serif";
        ctx.textAlign = 'left';
        ctx.fillText(dataRef.current.label ?? t('Hat boşta'), 10, h - 8);
      }
      void finished;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas ref={ref} className="lineviz" aria-label={t('Üretim hattı animasyonu: darboğaz kırmızı gösterilir')} role="img" />;
}
