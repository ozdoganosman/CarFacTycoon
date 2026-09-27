import type { GameState } from './types';

/** mulberry32: tiny, fast, good-enough PRNG. Returns the next state and a float in [0,1). */
export function mulberry(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [next, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

/** Random float in [0,1) drawn from (and advancing) the game's saved RNG state. */
export function rand(state: GameState): number {
  const [next, value] = mulberry(state.rng);
  state.rng = next;
  return value;
}

export type Rng = () => number;

/** Stand-alone deterministic generator (for AI designs etc.). */
export function makeRng(seed: number): Rng {
  let s = seed | 0;
  return () => {
    const [next, value] = mulberry(s);
    s = next;
    return value;
  };
}

export function stateRng(state: GameState): Rng {
  return () => rand(state);
}

export function pick<T>(rng: Rng, list: T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

/** Poisson-distributed integer (Knuth), fine for small lambdas. */
export function poisson(rng: Rng, lambda: number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > l && k < 100);
  return k - 1;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
