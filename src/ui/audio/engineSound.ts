import { layerMix, layerRpms, makeLayer, voiceTone, type EngineSoundSpec, type VoiceTone } from './engineVoice';

// Plays an engine design through Web Audio. `EngineVoice` is the sound graph for
// one design (it also renders offline, for checks); `engineSound` is the live
// engine in the designer: starter, throttle, revs, rev limiter.

export interface VoiceState {
  rpm: number;
  /** 0..1 */
  throttle: number;
  /** Overall level, 0..1 (the rev limiter cuts it). */
  level: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function noiseBuffer(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const b = ctx.createBuffer(1, Math.round(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function softClip(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return c;
}

/** The sound graph for one engine design. */
export class EngineVoice {
  readonly spec: EngineSoundSpec;
  readonly tone: VoiceTone;
  private readonly rpms: number[];
  private readonly sources: AudioBufferSourceNode[] = [];
  private readonly gains: GainNode[] = [];
  private readonly others: AudioScheduledSourceNode[] = [];
  private readonly muffler: BiquadFilterNode;
  private readonly out: GainNode;
  private readonly whine?: { osc: OscillatorNode; gain: GainNode };
  private readonly gear?: { osc: OscillatorNode; gain: GainNode };
  private readonly hiss: GainNode;

  constructor(ctx: BaseAudioContext, spec: EngineSoundSpec, dest: AudioNode, when = ctx.currentTime) {
    this.spec = spec;
    this.tone = voiceTone(spec);
    const t = this.tone;
    this.rpms = layerRpms(spec);

    const mix = ctx.createGain();
    this.rpms.forEach((rpm, i) => {
      const layer = makeLayer(spec, t, rpm, ctx.sampleRate, i + 1);
      const buf = ctx.createBuffer(2, layer.left.length, ctx.sampleRate);
      buf.copyToChannel(layer.left as Float32Array<ArrayBuffer>, 0);
      buf.copyToChannel(layer.right as Float32Array<ArrayBuffer>, 1);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(mix);
      // Start each loop at a different point so their cycles never line up.
      src.start(when, (i * 0.137) % (buf.duration * 0.9));
      this.sources.push(src);
      this.gains.push(g);
      this.rpms[i] = layer.rpm;
    });

    // Exhaust: resonances that stay put while the revs change, then the muffler.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 28;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = t.bodyHz;
    body.Q.value = 1.1;
    body.gain.value = 9;
    const pipe = ctx.createBiquadFilter();
    pipe.type = 'peaking';
    pipe.frequency.value = t.pipeHz;
    pipe.Q.value = 1.8;
    pipe.gain.value = 5;
    const rasp = ctx.createBiquadFilter();
    rasp.type = 'peaking';
    rasp.frequency.value = t.raspHz;
    rasp.Q.value = 0.8;
    rasp.gain.value = t.raspDb;
    this.muffler = ctx.createBiquadFilter();
    this.muffler.type = 'lowpass';
    this.muffler.frequency.value = t.muffleHz;
    this.muffler.Q.value = 0.6;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClip(1.6);
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    mix.connect(hp).connect(body).connect(pipe).connect(rasp).connect(this.muffler).connect(shaper).connect(this.out);
    this.out.connect(dest);

    // Intake roar: air rushing in, louder with the throttle open.
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.7;
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    noise.connect(bp).connect(this.hiss).connect(this.out);
    noise.start(when);
    this.others.push(noise);

    // A Roots blower whines in step with the crank.
    if (spec.supercharged) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3000;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(lp).connect(gain).connect(this.out);
      osc.start(when);
      this.others.push(osc);
      this.whine = { osc, gain };
    }
    // Overhead camshafts are driven by gears or chains that sing at speed.
    if (spec.valvetrain === 'ohc' || spec.valvetrain === 'dohc') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(this.out);
      osc.start(when);
      this.others.push(osc);
      this.gear = { osc, gain };
    }
  }

  /** Moves the sound to `st`, gliding from the previous state, starting at time `t`. */
  set(t: number, st: VoiceState) {
    const s = this.spec;
    const tc = 0.015;
    const rpm = Math.max(30, st.rpm);
    const mix = layerMix(this.rpms, rpm);
    this.sources.forEach((src, i) => src.playbackRate.setTargetAtTime(rpm / this.rpms[i], t, tc));
    this.gains.forEach((g, i) => g.gain.setTargetAtTime(mix[i], t, tc));
    const up = clamp((rpm - s.idle) / Math.max(1, s.redline - s.idle), 0, 1.2);
    const load = clamp(st.throttle, 0, 1);
    // Idle stays audible (a slow single-cylinder is mostly silence between its bangs).
    const level = st.level * (0.4 + 0.6 * load) * (0.6 + 0.4 * Math.min(1, up));
    this.out.gain.setTargetAtTime(level * 0.9, t, tc);
    this.muffler.frequency.setTargetAtTime(this.tone.muffleHz * (0.5 + 0.5 * load) * (0.75 + 0.5 * Math.min(1, up)), t, tc);
    this.hiss.gain.setTargetAtTime(0.05 * load * (0.3 + 0.7 * Math.min(1, up)), t, tc);
    if (this.whine) {
      this.whine.osc.frequency.setTargetAtTime((rpm / 60) * 8.4, t, tc);
      this.whine.gain.gain.setTargetAtTime(0.06 * Math.pow(Math.min(1, up), 1.5) * (0.3 + 0.7 * load), t, tc);
    }
    if (this.gear) {
      this.gear.osc.frequency.setTargetAtTime((rpm / 60) * 21, t, tc);
      this.gear.gain.gain.setTargetAtTime(0.012 * Math.min(1, up), t, tc);
    }
  }

  /** Fades out and releases the graph. */
  dispose(t: number, fade = 0.2) {
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, fade / 4);
    for (const s of [...this.sources, ...this.others]) {
      try {
        s.stop(t + fade + 0.1);
      } catch {
        /* already stopped */
      }
    }
  }
}

const VOLUME_KEY = 'carfactycoon.engineVolume';

export function savedVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.6;
  } catch {
    return 0.6;
  }
}

type Phase = 'off' | 'cranking' | 'running';

/** The engine on the designer's test stand. One per page. */
class EngineSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voice: EngineVoice | null = null;
  private spec: EngineSoundSpec | null = null;
  private specKey = '';
  private starter: { osc: OscillatorNode; gain: GainNode } | null = null;
  private phase: Phase = 'off';
  private raf = 0;
  private last = 0;
  private crankT = 0;
  private cutUntil = 0;
  private throttleTarget = 0;
  private throttleNow = 0;
  private volume = savedVolume();
  private listeners = new Set<() => void>();
  rpm = 0;

  get running() {
    return this.phase !== 'off';
  }
  get throttle() {
    return this.throttleNow;
  }
  get design() {
    return this.spec;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }

  /** Keeps the design in step with the designer; a running engine changes its voice on the fly. */
  setSpec(spec: EngineSoundSpec) {
    const key = JSON.stringify(spec);
    if (key === this.specKey) return;
    this.specKey = key;
    this.spec = spec;
    if (this.ctx && this.voice && this.phase !== 'off') {
      const t = this.ctx.currentTime;
      this.voice.dispose(t, 0.15);
      this.voice = new EngineVoice(this.ctx, spec, this.master!, t);
    }
  }

  setThrottle(v: number) {
    this.throttleTarget = clamp(v, 0, 1);
  }

  setVolume(v: number) {
    this.volume = clamp(v, 0, 1);
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      /* storage unavailable */
    }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  /** Cranks the engine. Must be called from a click (browsers only allow sound after one). */
  async start() {
    if (!this.spec || this.phase !== 'off') return;
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx({ latencyHint: 'interactive' });
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.ratio.value = 4;
        this.master = this.ctx.createGain();
        this.master.connect(comp).connect(this.ctx.destination);
      }
      await this.ctx.resume();
    } catch {
      // No sound here (blocked or unsupported): the engine simply stays off.
      return;
    }
    if (!this.spec || this.phase !== 'off') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.master!.gain.setValueAtTime(this.volume, t);
    this.voice = new EngineVoice(ctx, this.spec, this.master!, t);
    this.phase = 'cranking';
    this.crankT = 0;
    this.rpm = 0;
    this.throttleNow = 0;
    // An electric starter whirs; a hand crank is heaved round in silence.
    if (this.spec.electricStart) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55, t);
      osc.frequency.linearRampToValueAtTime(95, t + 0.35);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.05);
      osc.connect(lp).connect(gain).connect(this.master!);
      osc.start(t);
      this.starter = { osc, gain };
    }
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
    this.emit();
  }

  stop() {
    if (this.phase === 'off') return;
    this.phase = 'off';
    cancelAnimationFrame(this.raf);
    const t = this.ctx?.currentTime ?? 0;
    this.voice?.dispose(t, 0.35);
    this.voice = null;
    this.stopStarter(t);
    this.rpm = 0;
    this.throttleTarget = 0;
    this.throttleNow = 0;
    this.emit();
  }

  private stopStarter(t: number) {
    if (!this.starter) return;
    this.starter.gain.gain.setTargetAtTime(0, t, 0.03);
    this.starter.osc.stop(t + 0.2);
    this.starter = null;
  }

  private tick = (now: number) => {
    if (this.phase === 'off' || !this.ctx || !this.voice || !this.spec) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const s = this.spec;
    const inertia = this.voice.tone.inertia;
    this.throttleNow += (this.throttleTarget - this.throttleNow) * (1 - Math.exp(-dt / 0.06));
    const t = this.ctx.currentTime;
    let level = 1;

    if (this.phase === 'cranking') {
      this.crankT += dt;
      const crank = s.electricStart ? 170 : 110;
      const duration = s.electricStart ? 0.9 : 1.2;
      // Each compression stroke slows the crank, then it swings through.
      const phase = ((this.crankT * crank) / 60) * Math.PI * Math.max(1, s.cylinders / 2);
      this.rpm = crank * (1 + 0.25 * Math.sin(phase));
      level = 0.45;
      if (this.crankT >= duration) {
        this.phase = 'running';
        this.rpm = s.idle * 1.5; // it catches and flares
        this.stopStarter(t);
      }
    } else {
      const target = s.idle + this.throttleNow * (s.redline * 1.03 - s.idle);
      const tau = (target > this.rpm ? 0.45 : 0.8) * inertia;
      this.rpm += (target - this.rpm) * (1 - Math.exp(-dt / tau));
      // An old engine hunts a little at idle.
      if (this.throttleNow < 0.05) this.rpm *= 1 + Math.sin(now / (s.year < 1925 ? 260 : 400)) * (s.year < 1925 ? 0.004 : 0.0015);
      // Rev limiter: the ignition cuts out and the revs drop back.
      if (this.rpm >= s.redline && now > this.cutUntil) {
        this.cutUntil = now + 70;
        this.rpm *= 0.965;
      }
      if (now < this.cutUntil) level = 0.12;
    }

    this.voice.set(t + 0.005, { rpm: this.rpm, throttle: this.phase === 'cranking' ? 0.3 : this.throttleNow, level });
    this.raf = requestAnimationFrame(this.tick);
  };
}

export const engineSound = new EngineSound();

if (typeof document !== 'undefined') {
  // Never keep an engine running in a tab nobody is looking at.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') engineSound.stop();
  });
}
