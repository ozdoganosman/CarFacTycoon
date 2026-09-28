import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CYLINDER_OPTIONS, VALVETRAINS } from '../../data/tech';
import { engineSound, savedVolume } from '../audio/engineSound';
import type { EngineSoundSpec } from '../audio/engineVoice';
import { fmt } from '../cards/anim/draw';
import { Button, Info } from './ui';

// The engine on the test stand: start it, blip the throttle, hear it rev.

const SWEEP = 240; // degrees of needle travel
const toAngle = (rpm: number, max: number) => -SWEEP / 2 + (Math.min(rpm, max) / max) * SWEEP;

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [60 + r * Math.cos(a), 60 + r * Math.sin(a)];
}

function arc(r: number, from: number, to: number): string {
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/** A period tachometer; the needle is moved directly, frame by frame, not through React. */
function Tacho({ redline, needle, readout }: { redline: number; needle: React.RefObject<SVGGElement | null>; readout: React.RefObject<HTMLSpanElement | null> }) {
  const max = Math.ceil((redline * 1.2) / 1000) * 1000;
  const marks = [];
  for (let r = 0; r <= max; r += 500) {
    const major = r % 1000 === 0;
    const a = toAngle(r, max);
    const [x0, y0] = polar(major ? 40 : 43, a);
    const [x1, y1] = polar(48, a);
    marks.push(<line key={r} x1={x0} y1={y0} x2={x1} y2={y1} className={major ? 'tacho-major' : 'tacho-minor'} />);
    if (major) {
      const [tx, ty] = polar(32, a);
      marks.push(
        <text key={`t${r}`} x={tx} y={ty} className="tacho-num">
          {r / 1000}
        </text>,
      );
    }
  }
  return (
    <div className="tacho">
      <svg viewBox="0 0 120 118" role="img" aria-label={`Devir saati, kırmızı çizgi ${redline} devir`}>
        <circle cx="60" cy="60" r="54" className="tacho-face" />
        <path d={arc(46, toAngle(redline, max), toAngle(max, max))} className="tacho-red" />
        {marks}
        <text x="60" y="88" className="tacho-unit">
          d/d ×1000
        </text>
        <g ref={needle} style={{ transformOrigin: '60px 60px', transform: `rotate(${-SWEEP / 2}deg)` }}>
          <line x1="60" y1="66" x2="60" y2="16" className="tacho-needle" />
        </g>
        <circle cx="60" cy="60" r="4" className="tacho-hub" />
      </svg>
      <span ref={readout} className="tacho-readout">
        —
      </span>
    </div>
  );
}

export function EngineSound({ spec, onRunning }: { spec: EngineSoundSpec; onRunning?: (on: boolean) => void }) {
  const [running, setRunning] = useState(engineSound.running);
  const [steady, setSteady] = useState(0);
  const [volume, setVolume] = useState(savedVolume);
  const holding = useRef(false);
  const needle = useRef<SVGGElement | null>(null);
  const readout = useRef<HTMLSpanElement | null>(null);
  const supported = typeof window !== 'undefined' && !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);

  useEffect(() => {
    engineSound.setSpec(spec);
  }, [spec]);
  useEffect(() => engineSound.subscribe(() => setRunning(engineSound.running)), []);
  // Leaving the engine tab switches the engine off.
  useEffect(() => () => engineSound.stop(), []);
  useEffect(() => {
    onRunning?.(running);
  }, [running, onRunning]);
  useEffect(() => {
    if (!holding.current) engineSound.setThrottle(steady);
  }, [steady]);

  useEffect(() => {
    const max = Math.ceil((spec.redline * 1.2) / 1000) * 1000;
    let raf = 0;
    const draw = () => {
      const rpm = engineSound.running ? engineSound.rpm : 0;
      if (needle.current) needle.current.style.transform = `rotate(${toAngle(rpm, max)}deg)`;
      if (readout.current) {
        readout.current.textContent = engineSound.running ? `${fmt(Math.round(rpm / 10) * 10)} d/d` : 'motor duruyor';
        readout.current.classList.toggle('is-red', rpm >= spec.redline * 0.97);
      }
      if (engineSound.running) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [running, spec.redline]);

  const press = () => {
    holding.current = true;
    engineSound.setThrottle(1);
  };
  const release = () => {
    if (!holding.current) return;
    holding.current = false;
    engineSound.setThrottle(steady);
  };
  // Space would pause the game: the gas button keeps its keys to itself.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) press();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    release();
  };

  const opt = CYLINDER_OPTIONS.find((o) => o.cylinders === spec.cylinders && o.layout === spec.layout);
  const vt = VALVETRAINS.find((v) => v.id === spec.valvetrain);
  const what = [
    opt?.label ?? `${spec.cylinders} silindir`,
    `${fmt(spec.displacementCc / 1000, 1)} L`,
    spec.diesel ? 'dizel' : vt?.name.replace(/ \(.*\)/, ''),
    spec.supercharged ? 'kompresörlü' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!supported) return null;
  return (
    <section className={`engine-sound ${running ? 'is-running' : ''}`} aria-label="Motor sesi">
      <div className="engine-sound-head">
        <b>Motor sesi</b>
        <span className="muted small">{what}</span>
        <Info>
          <p>Ses, tasarladığın motordan hesaplanır: her silindir motorun gerçek ateşleme sırasıyla patlar, V motorlarda iki sıranın egzozu ayrı duyulur.</p>
          <p>
            Hacim büyüdükçe ses kalınlaşır, uzun strok daha tok vurur. Yan supaplı motor yumuşak tıkırdar, üstten kamlı motor dişlileriyle öter; dizel vuruntu yapar,
            kompresör devirle birlikte ıslık çalar. Erken yılların susturucusu zayıftır, rölantisi de düzensizdir.
          </p>
          <p>Motor çalışırken ayarları değiştir: ses anında değişir.</p>
        </Info>
      </div>
      <div className="engine-sound-body">
        <Tacho redline={spec.redline} needle={needle} readout={readout} />
        <div className="engine-sound-controls">
          <div className="engine-sound-buttons">
            <Button kind={running ? 'default' : 'primary'} onClick={() => (running ? engineSound.stop() : void engineSound.start())}>
              {running ? '■ Durdur' : spec.electricStart ? '▶ Marşa bas' : '▶ Kolla çalıştır'}
            </Button>
            <button
              type="button"
              className="btn btn-default engine-gas"
              disabled={!running}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                press();
              }}
              onPointerUp={release}
              onPointerCancel={release}
              onLostPointerCapture={release}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              onContextMenu={(e) => e.preventDefault()}
            >
              Gaza bas <span className="muted small">(basılı tut)</span>
            </button>
          </div>
          <label className="engine-sound-range">
            <span>Sabit gaz</span>
            <input type="range" min={0} max={1} step={0.01} value={steady} disabled={!running} onChange={(e) => setSteady(Number(e.target.value))} />
            <output>%{Math.round(steady * 100)}</output>
          </label>
          <label className="engine-sound-range">
            <span>Ses</span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                engineSound.setVolume(v);
              }}
            />
            <output>%{Math.round(volume * 100)}</output>
          </label>
          <p className="muted small engine-sound-note">
            Rölanti {fmt(spec.idle)} d/d · kırmızı çizgi {fmt(spec.redline)} d/d
          </p>
        </div>
      </div>
    </section>
  );
}
