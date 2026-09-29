import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../../i18n';

export interface Series {
  id: string;
  name: string;
  /** CSS color, normally a var(--series-n) token. */
  color: string;
  points: { x: number; y: number }[];
  dashed?: boolean;
  width?: number;
  /** Area fill under the line. */
  area?: boolean;
  /** Skip in tooltip/legend (e.g. helper lines). */
  quiet?: boolean;
}

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max === min) return [min];
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(Math.round(v / step) * step);
  // Always close the axis with a labelled tick above the data.
  if (out.length && out[out.length - 1] < max - step * 1e-6) out.push(out[out.length - 1] + step);
  return out;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(480);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function LineChart(props: {
  series: Series[];
  height?: number;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  xLabel?: string;
  yLabel?: string;
  yMin?: number;
  yMax?: number;
  xMin?: number;
  xMax?: number;
  markers?: { x: number; label: string }[];
  title?: ReactNode;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = props.height ?? 220;
  const pad = { l: 48, r: 14, t: 12, b: props.xLabel ? 38 : 26 };
  const [hover, setHover] = useState<number | null>(null);
  const xf = props.xFormat ?? ((v: number) => String(Math.round(v)));
  const yf = props.yFormat ?? ((v: number) => String(Math.round(v)));

  const dom = useMemo(() => {
    const xs = props.series.flatMap((s) => s.points.map((p) => p.x));
    const ys = props.series.flatMap((s) => s.points.map((p) => p.y));
    const xMin = props.xMin ?? Math.min(...xs);
    const xMax = props.xMax ?? Math.max(...xs);
    let yMin = props.yMin ?? Math.min(0, ...ys);
    let yMax = props.yMax ?? Math.max(...ys);
    if (!Number.isFinite(yMax) || yMax === yMin) yMax = yMin + 1;
    const yt = niceTicks(yMin, yMax, 4);
    yMin = Math.min(yMin, yt[0]);
    yMax = Math.max(yMax, yt[yt.length - 1]);
    return { xMin, xMax: xMax === xMin ? xMin + 1 : xMax, yMin, yMax, yTicks: yt };
  }, [props.series, props.xMin, props.xMax, props.yMin, props.yMax]);

  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const sx = (x: number) => pad.l + ((x - dom.xMin) / (dom.xMax - dom.xMin)) * iw;
  const sy = (y: number) => pad.t + ih - ((y - dom.yMin) / (dom.yMax - dom.yMin)) * ih;
  // Drop ticks outside the domain and ticks whose labels would repeat (e.g. whole years).
  const xTicks = niceTicks(dom.xMin, dom.xMax, Math.max(2, Math.floor(iw / 80))).filter(
    (t, i, arr) => t >= dom.xMin - 1e-9 && t <= dom.xMax + 1e-9 && (i === 0 || xf(t) !== xf(arr[i - 1])),
  );
  const visible = props.series.filter((s) => !s.quiet);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = dom.xMin + ((e.clientX - rect.left - pad.l) / iw) * (dom.xMax - dom.xMin);
    setHover(Math.max(dom.xMin, Math.min(dom.xMax, x)));
  };

  const nearest = (s: Series, x: number) => {
    let best = s.points[0];
    for (const p of s.points) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    return best;
  };

  const empty = props.series.every((s) => s.points.length === 0);

  return (
    <figure className="chart" ref={ref}>
      {props.title && <figcaption className="chart-title">{props.title}</figcaption>}
      {visible.length >= 2 && (
        <div className="chart-legend">
          {visible.map((s) => (
            <span key={s.id} className="legend-item">
              <span className={`legend-swatch ${s.dashed ? 'is-dashed' : ''}`} style={{ background: s.dashed ? undefined : s.color, borderColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      {empty ? (
        <div className="chart-empty" style={{ height }}>{t('Henüz veri yok')}</div>
      ) : (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={props.ariaLabel}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {dom.yTicks.map((t) => (
            <g key={`y${t}`}>
              <line className="grid" x1={pad.l} x2={pad.l + iw} y1={sy(t)} y2={sy(t)} />
              <text className="tick" x={pad.l - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle">
                {yf(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={`x${t}`} className="tick" x={sx(t)} y={pad.t + ih + 16} textAnchor="middle">
              {xf(t)}
            </text>
          ))}
          <line className="axis" x1={pad.l} x2={pad.l + iw} y1={pad.t + ih} y2={pad.t + ih} />
          {props.xLabel && (
            <text className="axis-label" x={pad.l + iw / 2} y={height - 4} textAnchor="middle">
              {props.xLabel}
            </text>
          )}
          {props.yLabel && (
            <text className="axis-label" x={pad.l} y={pad.t - 2} textAnchor="start">
              {props.yLabel}
            </text>
          )}
          {props.markers?.map((m) => (
            <g key={m.label}>
              <line className="marker" x1={sx(m.x)} x2={sx(m.x)} y1={pad.t} y2={pad.t + ih} />
              <text className="marker-label" x={sx(m.x) + 4} y={pad.t + 10}>
                {m.label}
              </text>
            </g>
          ))}
          {props.series.map((s) => {
            if (!s.points.length) return null;
            const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
            return (
              <g key={s.id}>
                {s.area && (
                  <path
                    d={`${d}L${sx(s.points[s.points.length - 1].x)},${sy(dom.yMin)}L${sx(s.points[0].x)},${sy(dom.yMin)}Z`}
                    fill={s.color}
                    opacity={0.12}
                  />
                )}
                <path d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}
          {hover !== null && (
            <g className="hover">
              <line className="crosshair" x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={pad.t + ih} />
              {visible.map((s) => {
                if (!s.points.length) return null;
                const p = nearest(s, hover);
                return <circle key={s.id} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={s.color} stroke="var(--panel)" strokeWidth={2} />;
              })}
            </g>
          )}
          <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" />
        </svg>
      )}
      {hover !== null && !empty && (
        <div className="chart-tip" style={{ left: Math.min(width - 150, Math.max(0, sx(hover) + 10)) }}>
          <div className="chart-tip-x">{xf(nearest(visible[0] ?? props.series[0], hover).x)}</div>
          {visible.map((s) =>
            s.points.length ? (
              <div key={s.id} className="chart-tip-row">
                <span className="legend-swatch" style={{ background: s.color }} />
                <span>{s.name}</span>
                <b>{yf(nearest(s, hover).y)}</b>
              </div>
            ) : null,
          )}
        </div>
      )}
    </figure>
  );
}

/** Simple vertical bar chart (e.g. yearly profit), with hover tooltips. */
export function BarChart(props: {
  bars: { label: string; value: number; tone?: 'pos' | 'neg' }[];
  height?: number;
  yFormat?: (v: number) => string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = props.height ?? 180;
  const pad = { l: 52, r: 8, t: 10, b: 24 };
  const [hover, setHover] = useState<number | null>(null);
  const vals = props.bars.map((b) => b.value);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals, 1), 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = height - pad.t - pad.b;
  const sy = (y: number) => pad.t + ih - ((y - yMin) / (yMax - yMin || 1)) * ih;
  const bw = iw / Math.max(1, props.bars.length);
  const yf = props.yFormat ?? ((v: number) => String(Math.round(v)));
  const labelEvery = Math.ceil(props.bars.length / Math.max(1, Math.floor(iw / 44)));
  return (
    <figure className="chart" ref={ref}>
      {props.bars.length === 0 ? (
        <div className="chart-empty" style={{ height }}>{t('Henüz veri yok')}</div>
      ) : (
        <svg width={width} height={height} role="img" aria-label={props.ariaLabel} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={pad.l} x2={pad.l + iw} y1={sy(t)} y2={sy(t)} />
              <text className="tick" x={pad.l - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle">
                {yf(t)}
              </text>
            </g>
          ))}
          {props.bars.map((b, i) => {
            const y0 = sy(0);
            const y1 = sy(b.value);
            const x = pad.l + i * bw + 1;
            const w = Math.max(1, bw - 2);
            const top = Math.min(y0, y1);
            const h = Math.max(1, Math.abs(y1 - y0));
            return (
              <g key={i} onPointerEnter={() => setHover(i)}>
                <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" />
                <rect
                  x={x}
                  y={top}
                  width={w}
                  height={h}
                  rx={Math.min(4, w / 2)}
                  className={b.value < 0 ? 'bar-neg' : 'bar-pos'}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
                {i % labelEvery === 0 && (
                  <text className="tick" x={pad.l + i * bw + bw / 2} y={pad.t + ih + 16} textAnchor="middle">
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
          <line className="axis" x1={pad.l} x2={pad.l + iw} y1={sy(0)} y2={sy(0)} />
        </svg>
      )}
      {hover !== null && props.bars[hover] && (
        <div className="chart-tip" style={{ left: Math.min(width - 150, pad.l + hover * bw + bw) }}>
          <div className="chart-tip-x">{props.bars[hover].label}</div>
          <div className="chart-tip-row">
            <b>{yf(props.bars[hover].value)}</b>
          </div>
        </div>
      )}
    </figure>
  );
}
