import { useId, type ReactNode } from 'react';

export function Panel(props: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; tight?: boolean }) {
  return (
    <section className={`panel ${props.tight ? 'panel-tight' : ''} ${props.className ?? ''}`}>
      {(props.title || props.actions) && (
        <header className="panel-head">
          {props.title && <h3>{props.title}</h3>}
          {props.actions && <div className="panel-actions">{props.actions}</div>}
        </header>
      )}
      {props.children}
    </section>
  );
}

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'default';
  disabled?: boolean;
  title?: string;
  small?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={props.type ?? 'button'}
      className={`btn btn-${props.kind ?? 'default'} ${props.small ? 'btn-sm' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      {props.children}
    </button>
  );
}

export function Slider(props: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  left?: string;
  right?: string;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`slider ${props.disabled ? 'is-disabled' : ''}`}>
      <div className="slider-top">
        <label htmlFor={id}>{props.label}</label>
        <output htmlFor={id}>{props.format ? props.format(props.value) : props.value}</output>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {(props.left || props.right) && (
        <div className="slider-ends">
          <span>{props.left}</span>
          <span>{props.right}</span>
        </div>
      )}
      {props.hint && <div className="slider-hint">{props.hint}</div>}
    </div>
  );
}

export function Choice<T extends string | number>(props: {
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string; sub?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  cols?: number;
  compact?: boolean;
}) {
  return (
    <div
      className={`choice ${props.compact ? 'choice-compact' : ''}`}
      style={props.cols ? { gridTemplateColumns: `repeat(auto-fill, minmax(${Math.floor(560 / props.cols)}px, 1fr))` } : undefined}
    >
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={`choice-item ${o.value === props.value ? 'is-on' : ''}`}
          disabled={o.disabled}
          title={o.title}
          aria-pressed={o.value === props.value}
          onClick={() => props.onChange(o.value)}
        >
          <span className="choice-label">{o.label}</span>
          {o.sub && <span className="choice-sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; sub?: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <label className={`toggle ${props.disabled ? 'is-disabled' : ''}`} title={props.title}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="toggle-box" aria-hidden />
      <span className="toggle-text">
        <span>{props.label}</span>
        {props.sub && <small>{props.sub}</small>}
      </span>
    </label>
  );
}

export function Stat(props: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="stat">
      <div className="stat-label">{props.label}</div>
      <div className={`stat-value ${props.tone ? `tone-${props.tone}` : ''}`}>{props.value}</div>
      {props.sub && <div className="stat-sub">{props.sub}</div>}
    </div>
  );
}

export function Progress(props: { value: number; max?: number; tone?: 'good' | 'warn' | 'bad' | 'accent'; label?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, (props.value / (props.max ?? 1)) * 100));
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill tone-bg-${props.tone ?? 'accent'}`} style={{ width: `${pct}%` }} />
      {props.label && <span className="progress-label">{props.label}</span>}
    </div>
  );
}

/** A 0-100 score bar with the era/class average marked at 50. */
export function ScoreBar(props: { value: number; compare?: number; label?: ReactNode }) {
  const v = Math.max(0, Math.min(100, props.value));
  const tone = v >= 60 ? 'good' : v <= 40 ? 'bad' : 'mid';
  return (
    <div className="scorebar" title={`${Math.round(v)} / 100 (50 = sınıf ortalaması)`}>
      <div className={`scorebar-fill sb-${tone}`} style={{ width: `${v}%` }} />
      {props.compare !== undefined && <div className="scorebar-compare" style={{ left: `${Math.max(0, Math.min(100, props.compare))}%` }} />}
      <div className="scorebar-mid" />
      {props.label && <span className="scorebar-label">{props.label}</span>}
    </div>
  );
}

export function Badge(props: { children: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'info' | 'muted' }) {
  return <span className={`badge badge-${props.tone ?? 'muted'}`}>{props.children}</span>;
}

export function Empty(props: { children: ReactNode }) {
  return <div className="empty">{props.children}</div>;
}

export function Table(props: { head: ReactNode[]; rows: ReactNode[][]; className?: string; align?: ('l' | 'r' | 'c')[] }) {
  return (
    <div className="table-wrap">
      <table className={`table ${props.className ?? ''}`}>
        <thead>
          <tr>
            {props.head.map((h, i) => (
              <th key={i} className={`al-${props.align?.[i] ?? 'l'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`al-${props.align?.[j] ?? 'l'}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NumberInput(props: { value: number; onChange: (v: number) => void; min?: number; step?: number; prefix?: string; label?: ReactNode; width?: number }) {
  const id = useId();
  return (
    <div className="numinput">
      {props.label && <label htmlFor={id}>{props.label}</label>}
      <div className="numinput-box">
        {props.prefix && <span>{props.prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(props.value) ? Math.round(props.value) : 0}
          min={props.min}
          step={props.step ?? 1}
          style={props.width ? { width: props.width } : undefined}
          onChange={(e) => props.onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

/** An engineer's estimate: a shaded range on the 0-100 scale, class average marked at 50. */
export function RangeBar(props: { lo: number; hi: number; rough?: boolean }) {
  const lo = Math.max(0, Math.min(100, props.lo));
  const hi = Math.max(lo, Math.min(100, props.hi));
  const mid = (lo + hi) / 2;
  const tone = mid >= 60 ? 'good' : mid <= 40 ? 'bad' : 'mid';
  return (
    <div className="scorebar rangebar" title={`Tahmin: ${Math.round(lo)}–${Math.round(hi)} (50 = sınıf ortalaması)`}>
      <div className={`rangebar-band sb-${tone} ${props.rough ? 'is-rough' : ''}`} style={{ left: `${lo}%`, width: `${Math.max(2, hi - lo)}%` }} />
      <div className="scorebar-mid" />
    </div>
  );
}
