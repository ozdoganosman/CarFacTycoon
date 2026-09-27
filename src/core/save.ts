import { SAVE_VERSION } from './game';
import { ensureRivals } from './rivals';
import { ensureResearch } from './research';
import { yearFloat } from './time';
import type { GameState } from './types';

const KEY = 'carfactycoon.save.v1';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const s = JSON.parse(json) as GameState;
  if (!s || typeof s !== 'object' || typeof s.week !== 'number' || !s.company) throw new Error('Geçersiz kayıt dosyası');
  if (s.version !== SAVE_VERSION) throw new Error('Bu kayıt oyunun farklı bir sürümüne ait');
  migrate(s);
  return s;
}

/** Bring a save from an older build of the same version up to date. */
function migrate(s: GameState) {
  ensureRivals(s);
  s.errors ??= [];
  s.decisions ??= [];
  // The quality focus arrived later.
  for (const p of s.projects) {
    p.dev.points.quality ??= 0;
    p.dev.focus.quality ??= 0;
  }
  // Research arrived later: older companies already know everything that exists.
  ensureResearch(s, yearFloat(s.week));
  // The full engine designer became the default; saves that never chose a mode get it too.
  if (!s.settings.modeChosen) s.settings.engineerMode = true;
}

/** Browser storage can be unavailable (private mode, blocked site data); never let that break the game. */
export function saveLocal(state: GameState): boolean {
  try {
    localStorage.setItem(KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function hasLocalSave(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
