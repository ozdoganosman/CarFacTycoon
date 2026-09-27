import { SAVE_VERSION } from './game';
import type { GameState } from './types';

const KEY = 'carfactycoon.save.v1';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const s = JSON.parse(json) as GameState;
  if (!s || typeof s !== 'object' || typeof s.week !== 'number' || !s.company) throw new Error('Geçersiz kayıt dosyası');
  if (s.version !== SAVE_VERSION) throw new Error('Bu kayıt oyunun farklı bir sürümüne ait');
  return s;
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
