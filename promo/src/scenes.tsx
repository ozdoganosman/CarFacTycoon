import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CarSVG } from '../../src/ui/viz/CarSVG';
import type { BodyId } from '../../src/core/types';
import { C, CAR_VARS, COND, Caption, Chip, Flash, Punch, SERIF, Shot, TYPE, TopShade, seqSrc, shotSrc } from './ui';
import MAP_STEPS from './map.json';
import SOUND from './sound.json';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const Car: React.FC<{ body: BodyId; year: number; cylinders: number; size: number; styling: number; color: string; width: number }> = (p) => (
  <div style={{ ...CAR_VARS, width: p.width, filter: 'drop-shadow(0 30px 30px rgba(0,0,0,0.45))' }}>
    <CarSVG body={p.body} size={p.size} year={p.year} cylinders={p.cylinders} styling={p.styling} color={p.color} width={p.width} />
  </div>
);

// ---------------------------------------------------------------- 1. hook

export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const yearP = spring({ frame: f, fps, config: { damping: 13, stiffness: 150 } });
  const typed = 'Bir atölye. 2 mühendis. 40 bin dolar.';
  const n = Math.floor(interpolate(f, [8, 36], [0, typed.length], clamp));
  const flicker = 0.9 + 0.1 * random(`flicker-${f}`);
  const carIn = spring({ frame: f, fps, config: { damping: 20, stiffness: 45 } });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 55% at 50% 42%, #4a331c 0%, #22180f 45%, ${C.dark} 80%)` }}>
      <AbsoluteFill style={{ opacity: flicker }}>
        <div
          style={{
            position: 'absolute',
            top: 190,
            width: '100%',
            textAlign: 'center',
            fontFamily: SERIF,
            fontWeight: 900,
            fontSize: 330,
            lineHeight: 1,
            color: C.cream,
            transform: `scale(${1.18 - 0.18 * yearP})`,
            textShadow: '0 12px 0 rgba(0,0,0,0.5), 0 0 80px rgba(231,187,79,0.35)',
          }}
        >
          1900
        </div>
        <div style={{ position: 'absolute', top: 570, width: '100%', textAlign: 'center', fontFamily: TYPE, fontSize: 52, color: C.gold }}>
          {typed.slice(0, n)}
          <span style={{ opacity: f % 16 < 8 ? 1 : 0 }}>▌</span>
        </div>
        <Caption text="1960'a kadar bir {otomobil devi} kurabilir misin?" top={760} size={94} delay={40} />
        <div style={{ position: 'absolute', top: 1190, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `translateX(${(1 - carIn) * -1000}px)` }}>
          <Car body="phaeton" year={1900} cylinders={1} size={0.25} styling={0.2} color="#7a2a24" width={760} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 2. cars through the decades

const STAGES: { year: number; body: BodyId; cyl: number; size: number; styling: number; color: string; label: string }[] = [
  { year: 1900, body: 'phaeton', cyl: 1, size: 0.25, styling: 0.2, color: '#7a2a24', label: 'Faeton · 1 silindir' },
  { year: 1908, body: 'roadster', cyl: 4, size: 0.4, styling: 0.35, color: '#1f3b5c', label: 'Roadster · 4 silindir' },
  { year: 1915, body: 'coupe', cyl: 4, size: 0.45, styling: 0.4, color: '#2b2a27', label: 'Coupé · 4 silindir' },
  { year: 1924, body: 'sedan', cyl: 6, size: 0.6, styling: 0.5, color: '#8a2a24', label: 'Sedan · 6 silindir' },
  { year: 1932, body: 'coupe', cyl: 8, size: 0.7, styling: 0.65, color: '#3e5a3a', label: 'Coupé · V8' },
  { year: 1940, body: 'sedan', cyl: 6, size: 0.65, styling: 0.7, color: '#6b4a2a', label: 'Sedan · 6 silindir' },
  { year: 1949, body: 'station', cyl: 6, size: 0.7, styling: 0.7, color: '#2e4d6b', label: 'Station · 6 silindir' },
  { year: 1957, body: 'sedan', cyl: 8, size: 0.85, styling: 0.95, color: '#c0392b', label: 'Sedan · V8' },
];
const PARTS = ['Gövde', 'Şasi', 'Motor', 'Şanzıman', 'Süspansiyon'];

export const Cars: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const per = (duration - 18) / STAGES.length;
  const idx = Math.min(STAGES.length - 1, Math.floor(f / per));
  const local = f - idx * per;
  const slide = idx === 0 ? 1 : interpolate(local, [0, 7], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const cur = STAGES[idx];
  const prev = idx > 0 ? STAGES[idx - 1] : undefined;
  const year = prev ? Math.round(prev.year + (cur.year - prev.year) * slide) : cur.year;
  const labelP = spring({ frame: local - 3, fps, config: { damping: 14 } });
  return (
    <Punch>
      <AbsoluteFill
        style={{
          backgroundColor: C.blueprint,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.08) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,0.08) 2px, transparent 2px), linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '120px 120px, 120px 120px, 24px 24px, 24px 24px',
          backgroundPosition: `${-f * 8}px 0, ${-f * 8}px 0, ${-f * 8}px 0, ${-f * 8}px 0`,
        }}
      />
      <Caption text="Her arabayı {sen} tasarla" top={170} size={100} />
      <div
        style={{
          position: 'absolute',
          top: 420,
          width: '100%',
          textAlign: 'center',
          fontFamily: SERIF,
          fontWeight: 900,
          fontSize: 210,
          color: C.cream,
          lineHeight: 1,
          textShadow: '0 8px 0 rgba(0,0,0,0.35)',
        }}
      >
        {year}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 650,
          width: '100%',
          textAlign: 'center',
          fontFamily: TYPE,
          fontSize: 50,
          color: C.gold,
          opacity: labelP,
          transform: `translateY(${(1 - labelP) * 20}px)`,
        }}
      >
        {cur.label}
      </div>
      <AbsoluteFill style={{ top: 760 }}>
        {prev && slide < 1 && (
          <div style={{ position: 'absolute', left: 60, transform: `translateX(${-slide * 1200}px) skewX(${slide * 10}deg)` }}>
            <Car body={prev.body} year={prev.year} cylinders={prev.cyl} size={prev.size} styling={prev.styling} color={prev.color} width={960} />
          </div>
        )}
        <div style={{ position: 'absolute', left: 60, transform: `translateX(${(1 - slide) * 1200}px) skewX(${-(1 - slide) * 10}deg)` }}>
          <Car body={cur.body} year={cur.year} cylinders={cur.cyl} size={cur.size} styling={cur.styling} color={cur.color} width={960} />
        </div>
      </AbsoluteFill>
      <div style={{ position: 'absolute', top: 1250, left: 60, right: 60, display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: 'center' }}>
        {PARTS.map((p, i) => {
          const s = spring({ frame: f - 24 - i * 7, fps, config: { damping: 11, stiffness: 170 } });
          return (
            <div key={p} style={{ transform: `scale(${s})`, opacity: Math.min(1, s * 2) }}>
              <Chip bg="rgba(246,234,208,0.95)" color={C.ink} size={42}>
                {p}
              </Chip>
            </div>
          );
        })}
      </div>
      {STAGES.slice(1).map((_, i) => (
        <Flash key={i} at={(i + 1) * per} length={4} max={0.18} />
      ))}
    </Punch>
  );
};

// ---------------------------------------------------------------- 3-4. engine and suspension

export const EngineScene: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  return (
    <Punch>
      <Shot src={seqSrc('engine', f, 150)} from={{ x: 540, y: 800, s: 1.1 }} to={{ x: 540, y: 780, s: 1.24 }} duration={duration} anchorY={1160} cropTop={330} />
      <TopShade height={640} />
      <Caption text="Motoru {silindir silindir} kur" top={190} size={100} />
    </Punch>
  );
};

/** A level meter under the caption, so the sound shows even with the phone muted. */
const Meter: React.FC<{ level: number; hot: boolean }> = ({ level, hot }) => {
  const f = useCurrentFrame();
  const bars = 26;
  return (
    <div style={{ position: 'absolute', top: 330, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 22 }}>
      <Chip bg="rgba(246,234,208,0.95)" color={C.ink} size={40}>
        🔊 Sesi aç
      </Chip>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 120 }}>
        {Array.from({ length: bars }, (_, i) => {
          const wobble = 0.55 + 0.45 * Math.abs(Math.sin(f * (0.9 + (i % 5) * 0.23) + i * 1.7));
          const shape = 0.35 + 0.65 * Math.sin((Math.PI * (i + 0.5)) / bars);
          const h = 10 + 110 * level * wobble * shape;
          return <div key={i} style={{ width: 11, height: h, borderRadius: 6, background: hot ? C.red : C.gold, boxShadow: '0 0 18px rgba(0,0,0,0.5)' }} />;
        })}
      </div>
    </div>
  );
};

/** The engine heard on the test stand: the game's own engine voice, the tachometer at the same revs. */
export const SoundScene: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const n = SOUND.rpm.length;
  const rpm = SOUND.rpm[Math.max(0, Math.min(n - 1, f))];
  const level = Math.min(1, rpm / SOUND.redline);
  const hot = rpm > SOUND.redline * 0.97;
  // The whole picture trembles as the revs climb, hardest past the redline.
  const amp = hot ? 7 : level > 0.75 ? 3 : 0;
  const dx = Math.sin(f * 2.3) * amp;
  const dy = Math.cos(f * 1.9) * amp * 0.6;
  return (
    <Punch>
      <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px)` }}>
        <Shot src={seqSrc('sound', f, n)} from={{ x: 540, y: 1000, s: 1.0 }} to={{ x: 540, y: 990, s: 1.1 }} duration={duration} anchorY={1150} cropTop={330} />
      </AbsoluteFill>
      <TopShade height={560} />
      <Caption text="Motorunu {dinle}" top={170} size={108} />
      <Meter level={level} hot={hot} />
      {hot && <AbsoluteFill style={{ boxShadow: 'inset 0 0 160px rgba(200,40,20,0.55)', pointerEvents: 'none' }} />}
    </Punch>
  );
};

export const SuspScene: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  return (
    <Punch>
      <Shot src={seqSrc('susp', f + 10, 150)} from={{ x: 540, y: 690, s: 1.14 }} to={{ x: 540, y: 700, s: 1.28 }} duration={duration} anchorY={1130} cropTop={330} />
      <TopShade height={640} />
      <Caption text="Deneme yolunda {sına}" top={210} size={104} />
    </Punch>
  );
};

// ---------------------------------------------------------------- 5. launch day

const Confetti: React.FC<{ start: number }> = ({ start }) => {
  const f = useCurrentFrame() - start;
  if (f < 0) return null;
  const colors = [C.gold, C.red, C.cream, '#3f9443'];
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 70 }, (_, i) => {
        const x = random(`cx${i}`) * 1080;
        const speed = 14 + random(`cs${i}`) * 16;
        const y = -60 - random(`cy${i}`) * 500 + f * speed;
        const rot = random(`cr${i}`) * 360 + f * (6 + random(`cw${i}`) * 10);
        const sway = Math.sin((f + i * 7) / 6) * 20;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + sway,
              top: y,
              width: 18,
              height: 30,
              background: colors[i % colors.length],
              transform: `rotate(${rot}deg) scaleX(${Math.cos((f + i) / 4)})`,
              borderRadius: 3,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const LaunchScene: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const r1 = 84;
  const r2 = 106;
  const r3 = 128;
  let src: string;
  let from = { x: 540, y: 900, s: 1.1 };
  let to = { x: 540, y: 900, s: 1.2 };
  let local = f;
  let len = 60;
  if (f < 60) src = seqSrc('reveal', f, 60);
  else if (f < r1) {
    src = shotSrc('reveal-crowd');
    from = to;
    to = { x: 540, y: 900, s: 1.24 };
    local = f - 60;
    len = r1 - 60;
  } else {
    src = shotSrc(f < r2 ? 'review-1' : f < r3 ? 'review-2' : 'review-3');
    from = { x: 540, y: 880, s: 1.02 };
    to = f < r3 ? { x: 540, y: 880, s: 1.06 } : { x: 490, y: 1440, s: 1.3 };
    local = f < r3 ? f - r1 : f - r3 - 8;
    len = f < r3 ? r3 - r1 : 26;
  }
  return (
    <Punch>
      <Shot src={src} from={from} to={to} duration={len} frame={local} anchorY={f < r3 ? 1200 : 1080} cropTop={f < r1 ? 470 : 150} />
      <TopShade height={560} />
      {f < r1 ? <Caption text="{Lansman} günü" top={200} size={110} /> : <Caption text="Dergiler ne {diyecek?}" top={200} size={104} />}
      {[20, 34, 48].map((at) => (
        <Flash key={at} at={at} length={4} max={0.45} />
      ))}
      <Flash at={r1} length={5} max={0.35} />
      <Flash at={r2} length={4} max={0.25} />
      <Flash at={r3} length={4} max={0.25} />
      <Confetti start={r3 + 20} />
    </Punch>
  );
};

// ---------------------------------------------------------------- 6. the dealer map, state by state

const MAP_CHIPS = ['Bayi ara', 'Servis kur', 'Nakliye öde'];

export const MapScene: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const per = (duration - 12) / MAP_STEPS.length;
  const idx = Math.min(MAP_STEPS.length - 1, Math.floor(f / per));
  const local = f - idx * per;
  const step = MAP_STEPS[idx];
  const prev = idx > 0 ? MAP_STEPS[idx - 1] : undefined;
  const fadeIn = idx === 0 ? 1 : interpolate(local, [0, 8], [0, 1], clamp);
  const count = prev ? Math.round(prev.states + (step.states - prev.states) * interpolate(local, [0, 14], [0, 1], clamp)) : step.states;
  const zoom = interpolate(f, [0, duration], [1.0, 1.08], clamp);
  const stamp = spring({ frame: local - 2, fps, config: { damping: 11, stiffness: 180 } });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 55%, #3a2a18 0%, #1c140c 60%, ${C.dark} 100%)`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 560, display: 'flex', justifyContent: 'center', transform: `scale(${zoom})` }}>
        <div style={{ position: 'relative', width: 1000, height: 640, boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}>
          {prev && fadeIn < 1 && <Img src={shotSrc(`map-${prev.year}`)} style={{ position: 'absolute', inset: 0, width: 1000, height: 640, objectFit: 'contain' }} />}
          <Img src={shotSrc(`map-${step.year}`)} style={{ position: 'absolute', inset: 0, width: 1000, height: 640, objectFit: 'contain', opacity: fadeIn }} />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 1260,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'baseline',
          gap: 36,
          color: C.cream,
          transform: `scale(${0.8 + 0.2 * stamp})`,
        }}
      >
        <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 150, lineHeight: 1, textShadow: '0 8px 0 rgba(0,0,0,0.4)' }}>{step.year}</span>
        <span style={{ fontFamily: TYPE, fontSize: 58, color: C.gold }}>{count} eyalet</span>
      </div>
      <div style={{ position: 'absolute', top: 1500, left: 60, right: 60, display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
        {MAP_CHIPS.map((c, i) => {
          const s = spring({ frame: f - 20 - i * 9, fps, config: { damping: 11, stiffness: 170 } });
          return (
            <div key={c} style={{ transform: `scale(${s})`, opacity: Math.min(1, s * 2) }}>
              <Chip bg="rgba(246,234,208,0.95)" color={C.ink} size={44}>
                {c}
              </Chip>
            </div>
          );
        })}
      </div>
      <TopShade height={520} />
      <Caption text="Eyalet eyalet {büyü}" top={200} size={112} />
      {MAP_STEPS.slice(1).map((_, i) => (
        <Flash key={i} at={(i + 1) * per} length={4} max={0.22} />
      ))}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 6b. newspaper

export const PaperScene: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const spin = interpolate(f, [0, 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const rot = -720 * (1 - spin) - 3;
  const s = interpolate(f, [0, 22, duration], [0.04, 0.74, 0.8], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: '#1d0f0b', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `repeating-conic-gradient(from ${f * 1.5}deg at 50% 62%, rgba(178,67,44,0.55) 0deg 9deg, rgba(20,10,8,0) 9deg 18deg)`,
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 62%, transparent 20%, rgba(10,6,4,0.85) 75%)' }} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1080,
          height: 1920,
          transformOrigin: '540px 960px',
          transform: `translateY(${230}px) rotate(${rot}deg) scale(${s})`,
          filter: 'drop-shadow(0 40px 60px rgba(0,0,0,0.7))',
        }}
      >
        <Img src={shotSrc('paper')} style={{ width: 1080, height: 1920, clipPath: 'inset(56px 64px 0px 26px)' }} />
      </div>
      <TopShade height={420} />
      <Caption text="{Manşetlere} çık" top={200} size={112} delay={10} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 7b. rivals strike back, the board wants its due

export const RivalsScene: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const split = Math.round(duration * 0.52);
  const first = f < split;
  const since = first ? f : f - split;
  const shake = since < 8 ? (8 - since) * 2.2 : 0;
  const sx = (random(`rx${f}`) - 0.5) * shake;
  const sy = (random(`ry${f}`) - 0.5) * shake;
  return (
    <Punch>
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px)` }}>
        {first ? (
          <Shot src={shotSrc('rival')} from={{ x: 540, y: 960, s: 1.06 }} to={{ x: 540, y: 960, s: 1.16 }} duration={split} anchorY={1130} cropTop={330} />
        ) : (
          <Shot src={shotSrc('board')} from={{ x: 540, y: 900, s: 1.04 }} to={{ x: 540, y: 1000, s: 1.12 }} duration={duration - split} frame={since} anchorY={1120} cropTop={330} />
        )}
      </AbsoluteFill>
      <TopShade height={640} />
      {first ? <Caption text="Öne geç, {rakipler saldırsın}" top={190} size={100} /> : <Caption text="Borsaya açıl, {kurula hesap ver}" top={190} size={96} />}
      <Flash at={0} length={5} max={0.35} />
      <Flash at={split} length={5} max={0.3} />
    </Punch>
  );
};

// ---------------------------------------------------------------- 7. factory

export const FactoryScene: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  return (
    <Punch>
      <Shot src={seqSrc('factory', f + 20, 150)} from={{ x: 540, y: 880, s: 1.1 }} to={{ x: 540, y: 900, s: 1.24 }} duration={duration} anchorY={1120} cropTop={330} />
      <TopShade height={640} />
      <Caption text="Fabrikanı kur, {hattı büyüt}" top={190} size={100} />
    </Punch>
  );
};

// ---------------------------------------------------------------- 8. crises

const CRISES = [
  { year: '1914', title: 'Avrupa’da savaş', sub: 'Çelik pahalandı: malzeme %25 zamlı.' },
  { year: '1920', title: 'Savaş sonrası durgunluk', sub: 'Alıcılar çekildi, stoklar şişti.' },
  { year: '1929', title: 'Kara Perşembe', sub: 'Borsa çöktü. Bankalar krediyi kısıyor.' },
  { year: '1942', title: 'Sivil üretim durdu', sub: 'Fabrikalar tank ve cip üretiyor.' },
];

export const CrisisScene: React.FC<{ duration: number }> = () => {
  const f = useCurrentFrame();
  const start = 12;
  const each = 27;
  const hits = CRISES.map((_, i) => start + i * each);
  const last = Math.max(...hits.filter((h) => h <= f), -100);
  const since = f - last;
  const shake = since >= 0 && since < 8 ? (8 - since) * 2.4 : 0;
  const sx = (random(`sx${f}`) - 0.5) * shake;
  const sy = (random(`sy${f}`) - 0.5) * shake;
  const pulse = since >= 0 && since < 10 ? (10 - since) / 10 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#120c0a', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 58%, rgba(178,40,24,${0.25 + 0.45 * pulse}) 0%, transparent 65%)` }} />
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px)` }}>
        {CRISES.map((c, i) => {
          const t = f - hits[i];
          if (t < 0) return null;
          const p = interpolate(t, [0, 6], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
          const rot = [-5, 4, -3, 5][i];
          const dx = [-24, 30, -14, 22][i];
          const dy = [0, 40, 80, 120][i];
          return (
            <div
              key={c.year}
              style={{
                position: 'absolute',
                left: 90 + dx,
                top: 720 + dy,
                width: 900,
                padding: '34px 44px 40px',
                background: C.paper,
                color: C.ink,
                boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
                transform: `rotate(${rot}deg) scale(${2.4 - 1.4 * p})`,
                opacity: Math.min(1, p * 3),
                backgroundImage: 'linear-gradient(rgba(120,90,50,0.08), rgba(120,90,50,0.16))',
              }}
            >
              <div style={{ fontFamily: COND, fontWeight: 700, fontSize: 30, letterSpacing: 6, color: C.red, borderBottom: `4px double ${C.ink}`, paddingBottom: 8 }}>
                MOTOR VE YOL · SON DAKİKA
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 26, marginTop: 14 }}>
                <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 132, color: C.red, lineHeight: 1 }}>{c.year}</span>
                <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 70, lineHeight: 1.02, textTransform: 'uppercase' }}>{c.title}</span>
              </div>
              <div style={{ fontFamily: TYPE, fontSize: 38, marginTop: 16 }}>{c.sub}</div>
            </div>
          );
        })}
      </AbsoluteFill>
      <TopShade height={560} />
      <Caption text="Savaşlar. Buhranlar. {Krizler.}" top={200} size={100} />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 9. research and racing

export const ResearchScene: React.FC<{ duration: number }> = ({ duration }) => (
  <Punch>
    <Shot src={shotSrc('research')} from={{ x: 540, y: 880, s: 1.08 }} to={{ x: 540, y: 1180, s: 1.08 }} duration={duration} anchorY={1150} cropTop={330} />
    <TopShade height={640} />
    <Caption text="Rakiplerinden önce {icat et}" top={190} size={100} />
  </Punch>
);

export const RacingScene: React.FC<{ duration: number }> = ({ duration }) => (
  <Punch>
    <Shot src={shotSrc('company')} from={{ x: 540, y: 880, s: 1.0 }} to={{ x: 540, y: 960, s: 1.1 }} duration={duration} anchorY={1150} cropTop={330} />
    <TopShade height={640} />
    <Caption text="Yarış kazan, {rakiplerini satın al}" top={190} size={96} />
  </Punch>
);

// ---------------------------------------------------------------- 10. score ladder

const RANKS = [
  { name: 'Butik atölye', pts: '0+' },
  { name: 'Saygın marka', pts: '650+' },
  { name: 'Büyük üretici', pts: '900+' },
  { name: 'Sanayi devi', pts: '1150+' },
  { name: 'Efsane', pts: '1400+' },
];

export const ScoreScene: React.FC<{ duration: number }> = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rowH = 150;
  const bottom = 1400;
  const climb = interpolate(f, [16, 60], [0, 3], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const legend = f > 64;
  return (
    <AbsoluteFill style={{ backgroundColor: C.dark }}>
      <Img src={shotSrc('score')} style={{ width: 1080, height: 1920, filter: 'blur(14px) brightness(0.35)', transform: 'scale(1.1)' }} />
      <TopShade height={560} />
      <Caption text="60 yıl sonra {sen} ne olacaksın?" top={180} size={98} />
      {RANKS.map((r, i) => {
        const inP = spring({ frame: f - 4 - i * 3, fps, config: { damping: 14 } });
        const reached = climb >= i - 0.02;
        const isLegend = i === 4;
        const glow = isLegend && legend ? 0.5 + 0.5 * Math.sin(f / 3) : 0;
        return (
          <div
            key={r.name}
            style={{
              position: 'absolute',
              left: 130,
              right: 130,
              top: bottom - i * rowH - rowH + 16,
              height: rowH - 26,
              borderRadius: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 40px 0 150px',
              background: isLegend ? `rgba(231,187,79,${0.18 + 0.5 * glow})` : reached ? C.paper : 'rgba(246,234,208,0.16)',
              border: isLegend ? `4px solid ${C.gold}` : 'none',
              color: reached || isLegend ? (isLegend ? C.gold : C.ink) : 'rgba(246,234,208,0.6)',
              transform: `translateX(${(1 - inP) * (i % 2 ? 500 : -500)}px)`,
              opacity: inP,
              boxShadow: isLegend ? `0 0 ${40 + 60 * glow}px rgba(231,187,79,${0.5 * glow})` : '0 12px 30px rgba(0,0,0,0.4)',
            }}
          >
            <span style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 64 }}>
              {r.name}
              {isLegend && legend ? ' ?' : ''}
            </span>
            <span style={{ fontFamily: COND, fontWeight: 700, fontSize: 40, opacity: 0.8 }}>{r.pts}</span>
          </div>
        );
      })}
      {/* the player's car climbing the ladder */}
      <div style={{ position: 'absolute', left: 150, top: bottom - rowH + 16 - climb * rowH + 20, width: 110 }}>
        <div style={{ ...CAR_VARS }}>
          <CarSVG body="sedan" size={0.5} year={1900 + climb * 18} cylinders={6} styling={0.6} color={C.red} width={110} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- 11. end card

export const EndScene: React.FC<{ duration: number; cta: string }> = ({ cta }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const open = interpolate(f, [0, 26], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const logo = spring({ frame: f - 14, fps, config: { damping: 12, stiffness: 140 } });
  const sub = spring({ frame: f - 26, fps, config: { damping: 14 } });
  const car = spring({ frame: f - 6, fps, config: { damping: 18, stiffness: 60 } });
  const btn = spring({ frame: f - 40, fps, config: { damping: 10, stiffness: 160 } });
  const pulse = 1 + 0.035 * Math.sin(f / 4.5) * (f > 55 ? 1 : 0);
  const info = spring({ frame: f - 56, fps, config: { damping: 14 } });
  const curtain = 'repeating-linear-gradient(90deg, #7a1f18 0 28px, #942820 28px 44px, #6c1a14 44px 60px)';
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d0a08', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 55% 45% at 50% 55%, rgba(255,236,190,0.30), transparent 70%)', opacity: open }} />
      <div
        style={{
          position: 'absolute',
          top: 180,
          width: '100%',
          textAlign: 'center',
          fontFamily: SERIF,
          fontWeight: 900,
          fontSize: 150,
          color: C.cream,
          letterSpacing: -3,
          transform: `scale(${0.5 + 0.5 * logo})`,
          opacity: Math.min(1, logo * 2),
          textShadow: '0 10px 0 rgba(0,0,0,0.5), 0 0 60px rgba(231,187,79,0.35)',
        }}
      >
        CarFac<span style={{ color: C.gold }}>Tycoon</span>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 390,
          width: '100%',
          textAlign: 'center',
          fontFamily: COND,
          fontWeight: 700,
          fontSize: 40,
          letterSpacing: 2,
          color: C.gold,
          textTransform: 'uppercase',
          opacity: sub,
          transform: `translateY(${(1 - sub) * 30}px)`,
        }}
      >
        Amerika 1900–1960 · Otomobil fabrikanı kur
      </div>
      <div style={{ position: 'absolute', top: 560, left: 0, right: 0, display: 'flex', justifyContent: 'center', transform: `translateX(${(1 - car) * -900}px)` }}>
        <Car body="sedan" year={1957} cylinders={8} size={0.85} styling={0.95} color="#c0392b" width={940} />
      </div>
      <div style={{ position: 'absolute', top: 1040, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            transform: `scale(${btn * pulse})`,
            background: C.red,
            color: C.cream,
            fontFamily: COND,
            fontWeight: 700,
            fontSize: 66,
            letterSpacing: 2,
            padding: '26px 56px',
            borderRadius: 60,
            boxShadow: '0 14px 0 #6c1a14, 0 30px 60px rgba(0,0,0,0.5)',
            textTransform: 'uppercase',
          }}
        >
          ▶ Ücretsiz oyna
        </div>
      </div>
      <div style={{ position: 'absolute', top: 1230, width: '100%', textAlign: 'center', opacity: info, transform: `translateY(${(1 - info) * 20}px)` }}>
        <div style={{ fontFamily: TYPE, fontSize: 44, color: 'rgba(246,234,208,0.9)' }}>İnternetsiz oynanır · Hesap gerekmez</div>
        <div style={{ marginTop: 36 }}>
          <Chip bg={C.gold} color={C.ink} size={50}>
            {cta}
          </Chip>
        </div>
      </div>
      {/* curtains part to reveal the car */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '51%', background: curtain, transform: `translateX(${-open * 100}%)`, boxShadow: 'inset -30px 0 60px rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '51%', background: curtain, transform: `translateX(${open * 100}%)`, boxShadow: 'inset 30px 0 60px rgba(0,0,0,0.5)' }} />
    </AbsoluteFill>
  );
};
