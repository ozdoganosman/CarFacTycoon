// Where the public build (GitHub Pages, itch.io, a shared HTML file) sends the playtests
// its players agree to share: a Google Apps Script web app that files them in the
// developer's Google Drive (see tools/playtest-collector). Empty: the build collects nothing.
//
// Set at build time with VITE_PLAYTEST_URL, or here once the web app is deployed.
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbwOEdCVTJsjm33KmUD8FveA4A2hk8oUxjZzrrI8AevBKBBz6hSeueOVm6YMDx3PENVv/exec';

export const COLLECTOR_URL: string = import.meta.env.VITE_PLAYTEST_URL?.trim() || DEFAULT_URL;

const PLAYER_KEY = 'carfactycoon.player';

/** A random, anonymous id for this browser, so one player's games can be told apart. */
export function playerId(): string {
  try {
    let id = localStorage.getItem(PLAYER_KEY);
    if (!id) {
      id = `o${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
      localStorage.setItem(PLAYER_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

/** Largest playtest the collector takes (the save is gzipped first; a long game is ~300 KB). */
export const MAX_BODY = 2_500_000;

/**
 * Posts one playtest. Apps Script answers through a redirect that a page may not
 * read, so this is a fire-and-forget `no-cors` request with a CORS-safe content
 * type: it fails only when the network does.
 */
export async function postPlaytest(url: string, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ app: 'carfactycoon', player: playerId(), ...payload });
  if (body.length > MAX_BODY) throw Object.assign(new Error('Playtest too large'), { code: 'too_big' });
  await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
}
