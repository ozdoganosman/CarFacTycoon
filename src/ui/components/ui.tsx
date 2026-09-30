import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBackClose } from '../back';
import { t } from '../../i18n';
import { segmentDef } from '../../data/segments';
import type { SegmentId } from '../../core/types';
import { Icon } from './Icon';

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
  // Longer values ("$378,65 Mio.") get a smaller size so they fit the card instead of being cut off.
  const len = typeof props.value === 'string' ? props.value.replace(/[\u2066-\u2069]/g, '').length : 0;
  const fit = len > 12 ? 'is-longer' : len > 10 ? 'is-long' : '';
  return (
    <div className="stat">
      <div className="stat-label">{props.label}</div>
      <div className={`stat-value ${fit} ${props.tone ? `tone-${props.tone}` : ''}`}>{props.value}</div>
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
    <div className="scorebar" title={t('{v} / 100 (50 = sınıf ortalaması)', { v: Math.round(v) })}>
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

/**
 * What speaks for and against a choice, one point a line, each marked with a plus or a minus (spans, so it
 * can sit inside a choice button).
 */
export function ProsCons(props: { pros: ReactNode[]; cons: ReactNode[] }) {
  return (
    <span className="pros-cons">
      {props.pros.map((p, i) => (
        <span key={`p${i}`} className="pc-item is-pro">
          {p}
        </span>
      ))}
      {props.cons.map((c, i) => (
        <span key={`c${i}`} className="pc-item is-con">
          {c}
        </span>
      ))}
    </span>
  );
}

/** A class of car: its pictogram and its name. */
export function SegmentLabel({ id }: { id: SegmentId }) {
  const d = segmentDef(id);
  return (
    <span className="seg-label">
      <Icon name={d.icon} /> {t(d.name)}
    </span>
  );
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
    <div className="scorebar rangebar" title={t('Tahmin: {lo}–{hi} (50 = sınıf ortalaması)', { lo: Math.round(lo), hi: Math.round(hi) })}>
      <div className={`rangebar-band sb-${tone} ${props.rough ? 'is-rough' : ''}`} style={{ left: `${lo}%`, width: `${Math.max(2, hi - lo)}%` }} />
      <div className="scorebar-mid" />
    </div>
  );
}

/**
 * A small (i) button whose details show in a bubble on hover, focus or tap.
 * The bubble lives on <body> so panels never clip it, and it stays on screen.
 */
export function Info({ children, label = t('Ayrıntı') }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !btn.current || !tip.current) {
      setPos(null);
      return;
    }
    const r = btn.current.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 16);
    const h = tip.current.offsetHeight;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8));
    const top = r.bottom + 8 + h < window.innerHeight || r.top - 8 - h < 0 ? r.bottom + 6 : r.top - 6 - h;
    setPos({ left, top, width });
  }, [open]);
  useBackClose(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  return (
    // Hover and focus open it for a mouse or keyboard; a finger taps it open and closed
    // (on a tap the browser also sends hover and focus, which would undo the tap).
    <span
      className="info"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
    >
      <button
        type="button"
        ref={btn}
        className="info-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      {open &&
        createPortal(
          <div
            ref={tip}
            role="tooltip"
            className="info-tip"
            style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { left: 0, top: 0, width: Math.min(340, window.innerWidth - 16), visibility: 'hidden' }}
          >
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}
