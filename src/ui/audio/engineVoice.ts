import type { EngineDesign, EngineStats, ValvetrainId } from '../../core/types';
import { engineConfig } from '../cards/anim/EngineBlock';

// The sound of an engine, built from the same physics the designer draws: every
// cylinder fires in the engine's real order, and each firing sends a pressure
// pulse down the exhaust. The pulse train is rendered into short loops at a few
// engine speeds (how racing games layer recorded engine loops); the player hears
// the two loops nearest the current speed, pitched to it and crossfaded, through
// exhaust resonances that stay put as the revs change.

export interface EngineSoundSpec {
  cylinders: number;
  layout: 'inline' | 'v';
  bore: number;
  stroke: number;
  displacementCc: number;
  /** Compression ratio: higher burns harder and sounds sharper. */
  compression: number;
  /** How hard it knocks (0 none .. 1 badly): compression above what the era's petrol stands. */
  knock: number;
  diesel: boolean;
  valvetrain: ValvetrainId;
  supercharged: boolean;
  electricStart: boolean;
  year: number;
  idle: number;
  redline: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function soundSpec(e: EngineDesign, es: EngineStats, year: number, features: readonly string[]): EngineSoundSpec {
  const diesel = !!es.diesel || e.fuel === 'diesel';
  const era = clamp(year - 1900, 0, 60);
  const redline = Math.max(1200, Math.round(es.redline));
  // Early engines idled very slowly; a diesel needs more to keep turning.
  let idle = diesel ? 520 : 280 + 5 * era;
  if (e.cylinders <= 2) idle *= 1.15;
  idle = Math.round(Math.min(idle, redline * 0.3));
  return {
    cylinders: e.cylinders,
    layout: e.layout,
    bore: e.bore,
    stroke: e.stroke,
    displacementCc: es.displacementCc,
    compression: e.compression,
    knock: diesel || !es.knocking ? 0 : clamp(0.25 + (e.compression - es.knockLimit) / 1.2, 0.25, 1),
    diesel,
    valvetrain: e.valvetrain,
    supercharged: e.aspiration === 'supercharger',
    electricStart: features.includes('electricStart'),
    year: Math.floor(year),
    idle,
    redline,
  };
}

export interface Firing {
  /** Crank angle of the firing within the 720° cycle. */
  angle: number;
  /** Exhaust side: -1 left bank, 1 right bank, 0 a single inline manifold. */
  bank: -1 | 0 | 1;
}

/** When each cylinder fires, and into which bank's exhaust. */
export function firings(cylinders: number, layout: 'inline' | 'v'): Firing[] {
  const cfg = engineConfig(cylinders, layout);
  return cfg.cyls
    .map((c) => ({ angle: c.fire, bank: (cfg.vee ? (c.axis < 0 ? -1 : 1) : 0) as -1 | 0 | 1 }))
    .sort((a, b) => a.angle - b.angle);
}

/** What the engine's hardware does to its voice. */
export interface VoiceTone {
  /** Main exhaust body resonance: bigger engines sound deeper. */
  bodyHz: number;
  pipeHz: number;
  /** Mechanical rasp band and how much it is lifted (dB). */
  raspHz: number;
  raspDb: number;
  /** Muffler cut-off: early cars barely had one. */
  muffleHz: number;
  /** Tappet and valve ticking. */
  tick: number;
  /** Diesel combustion knock. */
  clatter: number;
  /** The sharp edge of each exhaust valve opening. */
  crack: number;
  /** Rush of gas in each pulse. */
  noise: number;
  /** Firing-to-firing timing wobble, in crank degrees (idle lope). */
  roughness: number;
  /** Length of an exhaust pulse in crank degrees: long strokes blow down slower. */
  pulseDeg: number;
  /** How slowly the engine gathers and loses revs (flywheel, era). */
  inertia: number;
  /** Petrol combustion thud through the block: harder with more compression. */
  combust: number;
  /** Ring of a knocking cylinder (Hz): the gas in the bore resonates, lower in a wide bore. */
  knockHz: number;
  /** How far past the redline the valves start to float (share of the redline). */
  floatMargin: number;
}

const RASP: Record<ValvetrainId, [number, number, number, number]> = {
  // [rasp Hz, rasp dB, tick, valve float margin]
  sv: [1300, 1, 0.1, 0.08],
  ioe: [1500, 2, 0.11, 0.08],
  ohv: [1700, 3, 0.13, 0.1],
  ohc: [2200, 4, 0.07, 0.12],
  dohc: [2600, 5, 0.06, 0.14],
};

export function voiceTone(s: EngineSoundSpec): VoiceTone {
  const cc = Math.max(200, s.displacementCc);
  const [raspHz, raspDb, tick, floatMargin] = RASP[s.valvetrain] ?? RASP.ohv;
  // 4:1 (1900) burns soft, 9:1 (late 1950s) hard.
  const hard = clamp((s.compression - 4) / 6, 0, 1);
  const bodyHz = clamp(95 * Math.pow(2000 / cc, 0.3), 36, 150);
  const old = s.year < 1915;
  const muffle = s.year < 1912 ? 4500 : s.year < 1925 ? 3400 : s.year < 1940 ? 2700 : 2300;
  return {
    bodyHz,
    pipeHz: bodyHz * 2.8,
    raspHz: s.diesel ? 2000 : raspHz,
    raspDb: raspDb + (s.year < 1920 ? 2 : 0),
    muffleHz: muffle * (s.diesel ? 1.4 : 1),
    tick,
    clatter: s.diesel ? 0.9 : 0,
    crack: s.diesel ? 0.15 : (0.25 + (s.valvetrain === 'ohc' || s.valvetrain === 'dohc' ? 0.1 : 0)) * (0.7 + 0.6 * hard),
    noise: (old ? 0.35 : 0.22) + (s.supercharged ? 0.05 : 0),
    roughness: (old ? 7 : s.year < 1935 ? 4 : 2.5) * (s.cylinders <= 2 ? 1.3 : 1),
    pulseDeg: 100 * Math.sqrt(clamp(s.stroke / s.bore, 0.8, 1.6)),
    inertia:
      clamp(Math.pow(cc / 2000, 0.35), 0.6, 1.8) *
      (s.year < 1920 ? 1.5 : s.year < 1940 ? 1.2 : 1) *
      (s.cylinders <= 2 ? 1.4 : 1) *
      (s.diesel ? 1.3 : 1),
    combust: s.diesel ? 0 : 0.1 + 0.3 * hard,
    // First two acoustic modes of the gas in a cylinder of this bore (speed of sound ~950 m/s when hot).
    knockHz: (1.841 * 950) / (Math.PI * (Math.max(50, s.bore) / 1000)),
    floatMargin,
  };
}

/** Engine speeds the loops are rendered at: from cranking to past the redline, at most 1.5x apart. */
export function layerRpms(s: EngineSoundSpec): number[] {
  const lo = Math.max(90, s.idle * 0.45);
  const hi = s.redline * 1.1;
  const n = Math.max(2, Math.ceil(Math.log(hi / lo) / Math.log(1.5)));
  return Array.from({ length: n + 1 }, (_, i) => lo * Math.pow(hi / lo, i / n));
}

/** Small seeded generator so a design always sounds the same. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Layer {
  /** The engine speed the loop plays at when not re-pitched. */
  rpm: number;
  left: Float32Array;
  right: Float32Array;
  /**
   * Knock: a click in the cycles where a cylinder detonates (not every one). Played in step with
   * the main loop through a resonator at the bore's ring, so the ping keeps its pitch as the revs change.
   */
  knock?: Float32Array;
}

/**
 * About a second of the engine running steadily at `rpm`: a whole number of
 * 720° cycles, so the loop is seamless. Firings wobble a little from cycle to
 * cycle, more so at idle and in early engines.
 */
export function makeLayer(s: EngineSoundSpec, tone: VoiceTone, rpm: number, sampleRate: number, seed = 1): Layer {
  const rnd = rng(seed * 7919 + Math.round(rpm));
  const gauss = () => {
    const u = Math.max(1e-9, rnd());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const cycleSec = 120 / rpm;
  const K = clamp(Math.round(1.1 / cycleSec), 2, 64);
  const len = Math.round(K * cycleSec * sampleRate);
  const spd = len / K / 720; // samples per crank degree
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  const knock = s.knock > 0 ? new Float32Array(len) : undefined;
  const thudLen = Math.round(0.0015 * sampleRate);
  const clickLen = Math.round(0.0002 * sampleRate);
  const at = (i: number) => ((Math.round(i) % len) + len) % len;
  const idleness = 1 - clamp((rpm - s.idle) / Math.max(1, s.redline - s.idle), 0, 1);
  const events = firings(s.cylinders, s.layout);

  const crackLen = Math.round(0.0006 * sampleRate);
  const tickLen = Math.round(0.0008 * sampleRate);
  const clatterLen = Math.round(0.0025 * sampleRate);
  const W = tone.pulseDeg * spd;
  const pulseLen = Math.round(W * 1.6);

  for (let k = 0; k < K; k++) {
    for (const f of events) {
      // Worn-in early engines skip the odd firing at idle.
      if (s.year < 1912 && idleness > 0.8 && rnd() < 0.03) continue;
      const jitter = gauss() * tone.roughness * (0.3 + idleness);
      const amp = Math.max(0.3, 1 + gauss() * (0.05 + 0.1 * idleness));
      const gl = f.bank === 0 ? 0.85 : f.bank < 0 ? 1 : 0.5;
      const gr = f.bank === 0 ? 0.85 : f.bank > 0 ? 1 : 0.5;
      const fire = (k * 720 + f.angle + jitter) * spd;

      // Combustion: a diesel knocks hard; petrol thuds through the block, harder with more compression.
      if (tone.combust > 0) {
        for (let j = 0; j < thudLen; j++) {
          const v = (rnd() * 2 - 1) * tone.combust * amp * Math.exp(-j / (0.0004 * sampleRate));
          left[at(fire + j)] += v * gl;
          right[at(fire + j)] += v * gr;
        }
      }
      // Detonation: the end gas explodes some 10-25° after the top, and not in every cycle.
      if (knock && rnd() < 0.55) {
        const t0 = fire + (10 + rnd() * 15) * spd;
        const a = 0.4 + 0.6 * rnd();
        for (let j = 0; j < clickLen; j++) knock[at(t0 + j)] += (rnd() * 2 - 1) * a;
      }
      if (tone.clatter > 0) {
        let prev = 0;
        const a = tone.clatter * amp * (0.5 + 0.5 * idleness);
        for (let j = 0; j < clatterLen; j++) {
          const n = rnd() * 2 - 1;
          const v = (n - prev) * a * Math.exp(-j / (0.0006 * sampleRate));
          prev = n;
          left[at(fire + j)] += v * gl;
          right[at(fire + j)] += v * gr;
        }
      }

      // The exhaust valve opens ~140° later: the pulse that makes the note.
      const ex = fire + 140 * spd;
      for (let j = 0; j < pulseLen; j++) {
        const u = j / W;
        const body = u * 6 * Math.exp(1 - u * 6);
        const gas = (rnd() * 2 - 1) * tone.noise * Math.exp(-u * 3);
        const gas2 = (rnd() * 2 - 1) * tone.noise * Math.exp(-u * 3);
        left[at(ex + j)] += (body + gas) * amp * gl;
        right[at(ex + j)] += (body + gas2) * amp * gr;
      }
      for (let j = 0; j < crackLen; j++) {
        const v = Math.sin((2 * Math.PI * 3200 * j) / sampleRate) * Math.exp(-j / (0.00015 * sampleRate)) * tone.crack * amp;
        left[at(ex + j)] += v * gl;
        right[at(ex + j)] += v * gr;
      }

      // Valve gear: a tick as each exhaust and intake valve opens.
      for (const deg of [140, 350]) {
        const t0 = fire + deg * spd;
        let prev = 0;
        for (let j = 0; j < tickLen; j++) {
          const n = rnd() * 2 - 1;
          const v = (n - prev) * tone.tick * Math.exp(-j / (0.00012 * sampleRate));
          prev = n;
          left[at(t0 + j)] += v;
          right[at(t0 + j)] += v;
        }
      }
    }
  }

  // Remove the pulses' average push (DC) and level the loop.
  for (const ch of [left, right]) {
    let mean = 0;
    for (let i = 0; i < len; i++) mean += ch[i];
    mean /= len;
    for (let i = 0; i < len; i++) ch[i] -= mean;
  }
  let peak = 1e-6;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const g = 0.85 / peak;
  for (let i = 0; i < len; i++) {
    left[i] *= g;
    right[i] *= g;
  }
  if (knock) {
    let kp = 1e-6;
    for (let i = 0; i < len; i++) kp = Math.max(kp, Math.abs(knock[i]));
    for (let i = 0; i < len; i++) knock[i] *= 0.9 / kp;
  }
  return { rpm: (120 * K * sampleRate) / len, left, right, knock };
}

export interface RevState {
  rpm: number;
  /** 0..1: how badly the valves float (petrol past the redline). */
  float: number;
  /** A diesel's governor is holding the speed. */
  governed: boolean;
  /** Level this frame: floating valves make cylinders miss. */
  level: number;
  /** Load the sound should carry: the throttle, or what the governor lets through. */
  load: number;
  /** An unburnt charge went off in the exhaust. */
  backfire: boolean;
}

/**
 * One step of the engine's revs on the test stand. No engine of the period had a rev limiter: a
 * petrol engine runs on past its redline until the valve springs can no longer close the valves
 * ("valve float"), where it loses power, misses and clatters, still screaming; a diesel's
 * injection-pump governor cuts the fuel and holds the speed.
 */
export function stepRevs(s: EngineSoundSpec, tone: VoiceTone, rpm: number, throttle: number, dt: number, t: number, rnd: () => number = Math.random): RevState {
  const top = s.diesel ? s.redline * 1.02 : s.redline * (1 + tone.floatMargin);
  const target = s.idle + throttle * (top * (s.diesel ? 1 : 1.02) - s.idle);
  let tau = (target > rpm ? 0.45 : 0.8) * tone.inertia;
  // Past the redline the power falls away: the revs creep up instead of flying.
  if (!s.diesel && rpm > s.redline && target > rpm) tau *= 3;
  let next = rpm + (target - rpm) * (1 - Math.exp(-dt / tau));
  // An old engine hunts a little at idle.
  if (throttle < 0.05) next *= 1 + Math.sin(t / (s.year < 1925 ? 0.26 : 0.4)) * (s.year < 1925 ? 0.004 : 0.0015);

  if (s.diesel) {
    const governed = throttle > 0.3 && next > s.redline * 0.97;
    // The governor trims the fuel as the set speed nears, and hunts a touch around it.
    const fuel = clamp((top - next) / (s.redline * 0.06) + 0.25, 0.25, 1);
    if (governed) next = Math.min(top, next * (1 + (rnd() - 0.5) * 0.004));
    return { rpm: next, float: 0, governed, level: 1, load: throttle * fuel, backfire: false };
  }

  const float = clamp((next - s.redline) / (top - s.redline), 0, 1);
  let level = 1;
  let backfire = false;
  if (float > 0.15) {
    // Valves that do not seat: cylinders miss, the revs stagger, unburnt mixture pops in the exhaust.
    if (rnd() < float * 0.35) {
      level = 0.45 + 0.35 * rnd();
      backfire = rnd() < 0.2 * float;
    }
    next *= 1 + (rnd() - 0.5) * 0.02 * float;
    next = Math.min(next, top * 1.01);
  }
  return { rpm: next, float, governed: false, level, load: throttle, backfire };
}

/** Where `rpm` falls between the loops: the two to play and their equal-power gains. */
export function layerMix(rpms: number[], rpm: number): number[] {
  const g = rpms.map(() => 0);
  if (rpm <= rpms[0]) {
    g[0] = 1;
    return g;
  }
  if (rpm >= rpms[rpms.length - 1]) {
    g[rpms.length - 1] = 1;
    return g;
  }
  let i = 0;
  while (rpm > rpms[i + 1]) i++;
  const x = Math.log(rpm / rpms[i]) / Math.log(rpms[i + 1] / rpms[i]);
  g[i] = Math.cos((x * Math.PI) / 2);
  g[i + 1] = Math.sin((x * Math.PI) / 2);
  return g;
}
