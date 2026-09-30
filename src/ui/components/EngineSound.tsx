import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CYLINDER_OPTIONS, VALVETRAINS } from '../../data/tech';
import { engineSound, savedVolume } from '../audio/engineSound';
import type { EngineSoundSpec } from '../audio/engineVoice';
import { fmt } from '../cards/anim/draw';
import { t } from '../../i18n';
import { pct } from '../format';
import { tx } from '../i18n';
import { Button, Info } from './ui';
import { Icon } from './Icon';

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
      const [lx, ly] = polar(32, a);
      marks.push(
        <text key={`t${r}`} x={lx} y={ly} className="tacho-num">
          {r / 1000}
        </text>,
      );
    }
  }
  return (
    <div className="tacho">
      <svg viewBox="0 0 120 118" role="img" aria-label={t('Devir saati, kırmızı çizgi {rpm} devir', { rpm: redline })}>
        <circle cx="60" cy="60" r="54" className="tacho-face" />
        <path d={arc(46, toAngle(redline, max), toAngle(max, max))} className="tacho-red" />
        {marks}
        <text x="60" y="88" className="tacho-unit">
          {t('d/d ×1000')}
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
  const status = useRef<HTMLParagraphElement | null>(null);
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
        readout.current.textContent = engineSound.running ? t('{v} d/d', { v: fmt(Math.round(rpm / 10) * 10) }) : t('motor duruyor');
        readout.current.classList.toggle('is-red', rpm >= spec.redline * 0.97);
      }
      if (status.current) {
        const on = engineSound.running;
        let msg = '';
        let tone = '';
        if (on && engineSound.float > 0.05) {
          msg = t('Supaplar yüzüyor! Kırmızı çizginin üstünde yaylar supapları kapatamıyor: güç düşer, motor tekler ve takırdar. Uzun tutarsan supaplar pistona çarpar.');
          tone = 'tone-bad';
        } else if (on && engineSound.governed) {
          msg = t('Regülatör yakıtı kısıyor: dizel bu devrin üstüne çıkmaz.');
          tone = 'muted';
        } else if (on && spec.knock > 0 && engineSound.throttle > 0.4 && rpm < spec.redline * 0.8) {
          msg = t('Vuruntu: sıkıştırma dönemin benzinine fazla, yükte silindirler metalik tıkırdıyor.');
          tone = 'tone-warn';
        }
        if (status.current.textContent !== msg) status.current.textContent = msg;
        status.current.className = `small engine-sound-status ${tone}`;
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
    opt ? t(opt.label) : t('{n} silindir', { n: spec.cylinders }),
    t('{v} L', { v: fmt(spec.displacementCc / 1000, 1) }),
    spec.diesel ? t('dizel') : vt && t(vt.name).replace(/ \(.*\)/, ''),
    t('sıkıştırma {v}:1', { v: fmt(spec.compression, 1) }),
    spec.supercharged ? t('kompresörlü') : null,
    spec.knock > 0 ? t('vuruntu yapıyor') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (!supported) return null;
  return (
    <section className={`engine-sound ${running ? 'is-running' : ''}`} aria-label={t('Motor sesi')}>
      <div className="engine-sound-head">
        <b>{t('Motor sesi')}</b>
        <span className="muted small">{what}</span>
        <Info>
          <p>{t('Ses, tasarladığın motordan hesaplanır: her silindir motorun gerçek ateşleme sırasıyla patlar, V motorlarda iki sıranın egzozu ayrı duyulur.')}</p>
          <p>
            {t(
              'Hacim büyüdükçe ses kalınlaşır, uzun strok daha tok vurur. Yan supaplı motor yumuşak tıkırdar, üstten kamlı motor dişlileriyle öter; dizel vuruntu yapar, kompresör devirle birlikte ıslık çalar. Erken yılların susturucusu zayıftır, rölantisi de düzensizdir.',
            )}
          </p>
          <p>
            {t(
              'Sıkıştırma yükseldikçe patlama sertleşir, ses keskinleşir. Sıkıştırma dönemin benzinine fazlaysa motor vuruntu yapar: yükte, silindirin çapına göre 5-10 kHz’de çınlayan metalik bir tıkırtı.',
            )}
          </p>
          <p>
            {t(
              'Dönemin motorlarında devir kesici yoktur. Benzinli motor kırmızı çizgiyi geçince supap yayları yetişemez, supaplar yüzer: güç düşer, motor tekler, takırdar, egzozdan patlar ve daha fazla devir alamaz. Dizelin pompasındaki regülatör ise yakıtı kısıp devri tutar.',
            )}
          </p>
          <p>{t('Motor çalışırken ayarları değiştir: ses anında değişir.')}</p>
        </Info>
      </div>
      <div className="engine-sound-body">
        <Tacho redline={spec.redline} needle={needle} readout={readout} />
        <div className="engine-sound-controls">
          <div className="engine-sound-buttons">
            <Button kind={running ? 'default' : 'primary'} onClick={() => (running ? engineSound.stop() : void engineSound.start())}>
              <Icon name={running ? 'pause' : 'play'} /> {running ? t('Durdur') : spec.electricStart ? t('Marşa bas') : t('Kolla çalıştır')}
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
              {tx('Gaza bas <hint>(basılı tut)</hint>', {}, {
                hint: (c, k) => (
                  <span key={k} className="muted small">
                    {c}
                  </span>
                ),
              })}
            </button>
          </div>
          <label className="engine-sound-range">
            <span>{t('Sabit gaz')}</span>
            <input type="range" min={0} max={1} step={0.01} value={steady} disabled={!running} onChange={(e) => setSteady(Number(e.target.value))} />
            <output>{pct(steady, 0)}</output>
          </label>
          <label className="engine-sound-range">
            <span>{t('Ses')}</span>
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
            <output>{pct(volume, 0)}</output>
          </label>
          <p className="muted small engine-sound-note">
            {t('Rölanti {idle} d/d · kırmızı çizgi {redline} d/d', { idle: fmt(spec.idle), redline: fmt(spec.redline) })}
          </p>
          <p ref={status} className="small engine-sound-status" aria-live="polite" />
        </div>
      </div>
    </section>
  );
}
