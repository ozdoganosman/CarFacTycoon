import { useId, type ReactNode, type RefObject } from 'react';

/** Common frame: canvas, optional controls row, optional readouts and a one-line note. */
export function AnimFrame(props: {
  name: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Accessible description of what the animation shows. */
  label: string;
  controls?: ReactNode;
  readouts?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className={`anim anim--${props.name}`}>
      <canvas className="anim-canvas" ref={props.canvasRef} role="img" aria-label={props.label} />
      {props.readouts ? <div className="anim-readouts">{props.readouts}</div> : null}
      {props.controls ? <div className="anim-controls">{props.controls}</div> : null}
      {props.note ? <p className="anim-note">{props.note}</p> : null}
    </div>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  /** Formats the live value shown next to the slider. */
  format?: (v: number) => string;
  /** Words at the two ends of the track, e.g. ['Kısa', 'Uzun']. */
  ends?: [string, string];
}) {
  const id = useId();
  return (
    <div className="anim-ctl">
      <label className="anim-ctl-label" htmlFor={id}>
        {props.label}
      </label>
      {props.ends ? <span className="anim-ctl-end">{props.ends[0]}</span> : null}
      <input
        id={id}
        className="anim-range"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
        aria-valuetext={props.format ? props.format(props.value) : undefined}
      />
      {props.ends ? <span className="anim-ctl-end">{props.ends[1]}</span> : null}
      {props.format ? (
        <output className="anim-ctl-value" htmlFor={id}>
          {props.format(props.value)}
        </output>
      ) : null}
    </div>
  );
}

export function Toggle<T extends string | number | boolean>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="anim-ctl" role="group" aria-label={props.label}>
      <span className="anim-ctl-label">{props.label}</span>
      <span className="anim-seg">
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            className="anim-seg-btn"
            aria-pressed={o.value === props.value}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

export function Button(props: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={props.primary ? 'anim-btn anim-btn--primary' : 'anim-btn'}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

export function Readout(props: { label: string; value: ReactNode }) {
  return (
    <span className="anim-readout">
      <span className="anim-readout-label">{props.label}</span>
      <span className="anim-readout-value">{props.value}</span>
    </span>
  );
}
