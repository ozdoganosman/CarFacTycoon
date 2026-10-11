import type { CSSProperties } from 'react';
import { weeklyDemand } from '../../core/autocap';
import { lineReport } from '../../core/factory';
import { yearFloat } from '../../core/time';
import type { GameState } from '../../core/types';
import { t } from '../../i18n';
import { modelPaint } from '../paint';
import { store } from '../store';
import { CarSVG } from './CarSVG';

// The factory seen from the road, on the headquarters screen: its halls grow with its lines and its
// era, the week's cars drive off down the road in their paint, the unsold ones wait in the yard. It
// moves only while the clock runs (and not at all for those who prefer less motion).

const W = 1100;
const H = 150;
const ROAD = 132;

/** A car on the scene, 64 units long. */
function SmallCar({ s, m, x, y }: { s: GameState; m: GameState['models'][number]; x: number; y: number }) {
  const p = modelPaint(s, m);
  return (
    <g transform={`translate(${x},${y})`}>
      <svg width={64} height={26} viewBox="0 0 440 180" y={-26} overflow="visible">
        <CarSVG body={m.design.body} size={m.design.size} year={yearFloat(m.refreshWeek)} cylinders={m.design.engine.cylinders} styling={m.design.styling} color={p.body.color} roof={p.roof?.color} />
      </svg>
    </g>
  );
}

/** One hall: a workshop shed before mass production, a sawtooth-roofed brick hall after it. */
function Hall({ x, w, h, era, sign }: { x: number; w: number; h: number; era: number; sign?: string }) {
  const top = ROAD - 18 - h;
  const teeth = era >= 1913 ? Math.max(2, Math.round(w / 34)) : 0;
  const tw = w / Math.max(1, teeth);
  const windows = Math.max(2, Math.round(w / 26));
  return (
    <g className="yard-hall">
      <rect x={x} y={top} width={w} height={h} className={era >= 1913 ? 'yard-brick' : 'yard-wood'} />
      {teeth > 0
        ? Array.from({ length: teeth }, (_, i) => (
            <path key={i} d={`M${x + i * tw},${top} L${x + i * tw},${top - 12} L${x + (i + 1) * tw},${top} Z`} className="yard-roof" />
          ))
        : <path d={`M${x - 4},${top} L${x + w / 2},${top - 18} L${x + w + 4},${top} Z`} className="yard-roof" />}
      {Array.from({ length: windows }, (_, i) => (
        <rect key={i} x={x + 6 + (i * (w - 12)) / windows} y={top + h * 0.35} width={(w - 12) / windows - 5} height={h * 0.3} className="yard-window" />
      ))}
      {sign && (
        <text x={x + w / 2} y={top + h * 0.22} textAnchor="middle" className="yard-sign">
          {sign}
        </text>
      )}
    </g>
  );
}

export function FactoryYard({ s }: { s: GameState }) {
  const yf = yearFloat(s.week);
  const active = s.models.filter((m) => m.status === 'active');
  if (!active.length) return null;
  const output = active.map((m) => ({
    m,
    week: s.lines.filter((l) => l.modelId === m.id && !l.military).reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0),
  }));
  const total = output.reduce((a, x) => a + x.week, 0);
  // The halls: one for a workshop, up to five for a big works; taller after mass production.
  const halls = Math.min(5, 1 + Math.floor(s.lines.length / 8));
  const hallW = Math.min(90 + s.lines.length * 4, (W - 200) / halls - 14);
  const hallH = yf >= 1913 ? 46 : 30;
  // Cars leaving: one to five on the road at once, more the more the factory builds.
  const driving = total > 0 ? Math.max(1, Math.min(5, Math.round(Math.log10(1 + total) * 1.6))) : 0;
  const leaving = Array.from({ length: driving }, (_, i) => output[i % output.length].m);
  // The yard in front of the halls: the cars nobody has bought yet, by how many weeks of sales are waiting.
  const stockWeeks = active.reduce((a, m) => a + m.inventory / Math.max(1, weeklyDemand(s, m)), 0);
  const parked = Math.max(0, Math.min(8, Math.round(stockWeeks * 1.5)));
  const running = store.speed !== 0 && !s.gameOver;
  const chimneys = yf >= 1908 ? halls : 0;
  const water = yf >= 1925 && halls >= 3;
  return (
    <div className={`yard ${running ? '' : 'is-still'}`} role="img" aria-label={t('{name} fabrikası: {n} hat, haftada {output} araç', { name: s.company.name, n: s.lines.length, output: Math.round(total) })}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMax slice">
        <rect x={0} y={0} width={W} height={H} className="yard-sky" />
        <rect x={0} y={ROAD - 18} width={W} height={18} className="yard-ground" />
        {Array.from({ length: chimneys }, (_, i) => {
          const cx = 160 + i * (hallW + 14) + hallW * 0.75;
          return (
            <g key={i}>
              <rect x={cx} y={ROAD - 18 - hallH - 44} width={9} height={44} className="yard-brick" />
              {[0, 1, 2].map((k) => (
                <circle key={k} cx={cx + 4} cy={ROAD - 18 - hallH - 48} r={6 + k * 2} className="yard-smoke" style={{ animationDelay: `${k * 1.1 + i * 0.4}s` } as CSSProperties} />
              ))}
            </g>
          );
        })}
        {water && (
          <g className="yard-tower">
            <rect x={78} y={ROAD - 90} width={3} height={72} />
            <rect x={98} y={ROAD - 90} width={3} height={72} />
            <rect x={70} y={ROAD - 112} width={40} height={24} rx={4} />
          </g>
        )}
        {Array.from({ length: halls }, (_, i) => (
          <Hall key={i} x={160 + i * (hallW + 14)} w={hallW} h={hallH - (i % 2) * 6} era={yf} sign={i === 0 ? s.company.name.toUpperCase() : undefined} />
        ))}
        {Array.from({ length: parked }, (_, i) => (
          <SmallCar key={i} s={s} m={active[i % active.length]} x={175 + i * 72} y={ROAD - 3} />
        ))}
        <rect x={0} y={ROAD} width={W} height={H - ROAD} className="yard-road" />
        <line x1={0} y1={ROAD + 9} x2={W} y2={ROAD + 9} className="yard-lane" />
        {leaving.map((m, i) => (
          <g key={i} className="yard-drive" style={{ animationDelay: `${(-i * 9) / driving}s`, '--x': `${300 + i * 150}px` } as CSSProperties}>
            <SmallCar s={s} m={m} x={0} y={ROAD + 7} />
          </g>
        ))}
      </svg>
    </div>
  );
}
