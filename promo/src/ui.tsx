import React from 'react';
import { AbsoluteFill, Easing, Img, cancelRender, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import fonts from '../public/fonts/fonts.json';

// Fonts are bundled in public/fonts (node capture/fonts.mjs), so rendering needs no network.
const fontsReady = delayRender('Loading fonts');
Promise.all(
  fonts.map((f) =>
    new FontFace(f.family, `url(${staticFile(`fonts/${f.file}`)}) format('woff2')`, { weight: f.weight, unicodeRange: f.range, display: 'block' })
      .load()
      .then((face) => document.fonts.add(face)),
  ),
)
  .then(() => continueRender(fontsReady))
  .catch((e) => cancelRender(e));

export const SERIF = "'Playfair Display', Georgia, serif";
export const TYPE = "'Special Elite', 'Courier New', monospace";
export const COND = "'Oswald', 'Arial Narrow', sans-serif";

/** The game's own palette. */
export const C = {
  paper: '#f4ecdc',
  cream: '#f6ead0',
  ink: '#221f1b',
  dark: '#14110e',
  red: '#b2432c',
  deepRed: '#7a1f18',
  gold: '#e7bb4f',
  green: '#3f9443',
  blueprint: '#16334d',
};

/** CSS variables the game's CarSVG paints with. */
export const CAR_VARS = {
  '--car-body': '#7a2a24',
  '--car-trim': '#2b2a27',
  '--car-glass': '#b9d3e4',
  '--car-tyre': '#1f1e1c',
  '--car-chrome': '#c9c6be',
  '--car-wood': '#b78a52',
  '--car-top': '#3a3833',
  '--car-lamp': '#f6e7a6',
  '--car-whitewall': '#f2efe6',
  '--car-shadow': 'rgba(0, 0, 0, 0.25)',
  '--car-arch': '#1f1e1c',
  '--bad': '#b2432c',
} as React.CSSProperties;

/** Old-film grain over everything. */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.16 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'overlay', opacity }}>
      <svg width="100%" height="100%">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={f % 16} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <AbsoluteFill
    style={{ pointerEvents: 'none', background: `radial-gradient(ellipse 80% 70% at 50% 50%, transparent 55%, rgba(0,0,0,${strength}) 100%)` }}
  />
);

/** Dark band behind the top caption so it reads over any screen. */
export const TopShade: React.FC<{ height?: number }> = ({ height = 760 }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height,
      background: 'linear-gradient(180deg, rgba(14,11,8,0.95) 0%, rgba(14,11,8,0.85) 55%, rgba(14,11,8,0) 100%)',
    }}
  />
);

/**
 * Words pop in one by one. Words in {braces} are picked out in the accent colour.
 * Kept in the upper part of the frame, clear of the Shorts title and buttons.
 */
export const Caption: React.FC<{
  text: string;
  top?: number;
  size?: number;
  delay?: number;
  accent?: string;
  color?: string;
  font?: string;
}> = ({ text, top = 200, size = 96, delay = 0, accent = C.gold, color = C.cream, font = SERIF }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words: { w: string; hot: boolean }[] = [];
  let hot = false;
  for (const raw of text.split(' ')) {
    let w = raw;
    const open = w.startsWith('{');
    if (open) w = w.slice(1);
    const close = w.endsWith('}');
    if (close) w = w.slice(0, -1);
    if (open) hot = true;
    words.push({ w, hot });
    if (close) hot = false;
  }
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 70,
        right: 70,
        textAlign: 'center',
        fontFamily: font,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.08,
        color,
        textShadow: '0 6px 0 rgba(0,0,0,0.55), 0 0 40px rgba(0,0,0,0.6)',
        letterSpacing: -1,
      }}
    >
      {words.map(({ w, hot: h }, i) => {
        const p = spring({ frame: f - delay - i * 3, fps, config: { damping: 12, stiffness: 180, mass: 0.6 } });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: size * 0.26,
              opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translateY(${(1 - p) * 40}px) scale(${0.6 + 0.4 * p})`,
              color: h ? accent : undefined,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

export interface Focus {
  /** Point of the 1080 x 1920 capture to put at the anchor. */
  x: number;
  y: number;
  /** Zoom. */
  s: number;
}

/**
 * A capture of the game shown full screen and slowly pushed in on the part that matters:
 * `from` and `to` are the source point and zoom at the start and end of the scene.
 */
export const Shot: React.FC<{
  src: string;
  from: Focus;
  to: Focus;
  duration: number;
  anchorY?: number;
  frame?: number;
  /** Source pixels hidden at the top (the game's own header bar is 320 px). */
  cropTop?: number;
}> = ({ src, from, to, duration, anchorY = 1080, frame, cropTop = 0 }) => {
  const cur = useCurrentFrame();
  const f = frame ?? cur;
  const t = interpolate(f, [0, duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.33, 0, 0.2, 1) });
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  const s = from.s + (to.s - from.s) * t;
  return (
    <AbsoluteFill style={{ backgroundColor: C.dark, overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          position: 'absolute',
          width: 1080,
          height: 1920,
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          transform: `translate(${540 - x * s}px, ${anchorY - y * s}px) scale(${s})`,
          clipPath: cropTop ? `inset(${cropTop}px 0 0 0)` : undefined,
        }}
      />
    </AbsoluteFill>
  );
};

export const shotSrc = (name: string) => staticFile(`shots/${name}.png`);
export const seqSrc = (name: string, i: number, count: number) =>
  staticFile(`seq/${name}/${String(Math.max(0, Math.min(count - 1, Math.floor(i)))).padStart(4, '0')}.jpg`);

/** Quick white flash on a cut. */
export const Flash: React.FC<{ at?: number; length?: number; max?: number }> = ({ at = 0, length = 6, max = 0.55 }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [at, at + 1, at + length], [0, max, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ backgroundColor: '#fff7e6', opacity: o, pointerEvents: 'none' }} />;
};

/** Every scene starts with a short punch-in so the cuts feel fast. */
export const Punch: React.FC<{ children: React.ReactNode; amount?: number }> = ({ children, amount = 0.06 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f, fps, config: { damping: 16, stiffness: 200 } });
  return <AbsoluteFill style={{ transform: `scale(${1 + amount * (1 - p)})` }}>{children}</AbsoluteFill>;
};

/** Small chip label (Oswald caps). */
export const Chip: React.FC<{ children: React.ReactNode; bg?: string; color?: string; size?: number; style?: React.CSSProperties }> = ({
  children,
  bg = C.red,
  color = C.cream,
  size = 40,
  style,
}) => (
  <span
    style={{
      display: 'inline-block',
      background: bg,
      color,
      fontFamily: COND,
      fontWeight: 700,
      fontSize: size,
      letterSpacing: 2,
      textTransform: 'uppercase',
      padding: `${size * 0.22}px ${size * 0.55}px`,
      borderRadius: size * 0.3,
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      ...style,
    }}
  >
    {children}
  </span>
);
