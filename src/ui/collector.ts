// Where the public build (GitHub Pages, itch.io, a shared HTML file) sends the playtests
// its players agree to share: the developer's Supabase database, through one function
// (`submit_playtest`) that may only add or refresh a playtest — the page's key cannot read
// anything back. Empty URL: the build collects nothing.
//
// Both can be replaced at build time with VITE_SUPABASE_URL and VITE_SUPABASE_KEY.
const DEFAULT_URL = 'https://kgndjrokogypjqhdfvdh.supabase.co';
// A publishable key: made to sit in pages. What it may do is set by the database's rules.
const DEFAULT_KEY = 'sb_publishable_jdvXdXwnym92SmPKz5BGMg_EfGDjY12';

export const SUPABASE_URL: string = (import.meta.env.VITE_SUPABASE_URL?.trim() || DEFAULT_URL).replace(/\/+$/, '');
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY?.trim() || DEFAULT_KEY;

/** The endpoint playtests are posted to, or '' when this build collects none. */
export const COLLECTOR_URL: string = SUPABASE_URL && SUPABASE_KEY ? `${SUPABASE_URL}/rest/v1/rpc/submit_playtest` : '';

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

/** Posts one playtest; a game's copy (same id, same player) is replaced, not duplicated. */
export async function postPlaytest(url: string, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ p: { player: playerId(), ...payload } });
  if (body.length > MAX_BODY) throw Object.assign(new Error('Playtest too large'), { code: 'too_big' });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body,
    keepalive: body.length < 60_000,
  });
  if (!res.ok) throw Object.assign(new Error(`Collector answered ${res.status}`), { code: 'rejected', status: res.status });
}
