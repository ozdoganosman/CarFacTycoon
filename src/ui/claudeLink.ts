import { serialize } from '../core/save';
import { formatDate } from '../core/time';
import type { GameState } from '../core/types';

// Sends the player's game to Claude through the page's shared database (the
// claude.ai "db" capability). Claude reads the `playtests` collection to study
// how the game is played and which errors happened. Once the player allows it,
// the running game keeps its own document up to date; the menu button adds a
// separate snapshot with a note. Outside claude.ai there is no database and the
// caller falls back to copying the save code.

interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
}
interface Db {
  doc(path: string): DocRef;
}
type PermissionState = 'granted' | 'prompt' | 'denied' | 'unavailable';
interface Permissions {
  state(name: string): Promise<PermissionState>;
  request(names?: readonly string[]): Promise<Record<string, PermissionState>>;
}
interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

const runtime = () => (window as unknown as { claude?: ClaudeRuntime }).claude;

let dbPromise: Promise<Db | null> | null = null;

/** The page's database, or null where it cannot run (outside claude.ai, not granted). */
export function claudeDb(): Promise<Db | null> {
  if (!dbPromise) {
    const r = runtime();
    dbPromise =
      r && typeof r.use === 'function'
        ? r.use('db').then(
            (db) => (db as Db | null) ?? null,
            () => null,
          )
        : Promise.resolve(null);
  }
  return dbPromise;
}

async function permissions(): Promise<Permissions | null> {
  const r = runtime();
  if (!r || typeof r.use !== 'function') return null;
  try {
    return ((await r.use('permissions')) as Permissions | null) ?? null;
  } catch {
    return null;
  }
}

async function gzipBase64(text: string): Promise<string | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } catch {
    return null;
  }
}

/** A few lines Claude can read at a glance before opening the full save. */
function summary(s: GameState) {
  return {
    company: s.company.name,
    hq: s.company.hq,
    date: formatDate(s.week),
    week: s.week,
    cash: Math.round(s.company.cash),
    reputation: Math.round(s.company.reputation),
    engineers: s.company.engineers,
    skill: Math.round(s.company.skill),
    lines: s.lines.length,
    models: s.models.map((m) => ({ name: m.name, segment: m.segment, status: m.status, price: Math.round(m.price), sold: Math.round(m.unitsSold), review: m.reviewScore })),
    projects: s.projects.map((p) => ({ name: p.name, segment: p.segment, phase: p.phase })),
    lastYears: s.years.slice(-3).map((y) => ({ year: y.year, units: Math.round(y.unitsSold), revenue: Math.round(y.revenue), profit: Math.round(y.profit) })),
    decisions: s.decisions?.length ?? 0,
    errors: (s.errors ?? []).slice(-3).map((e) => `${formatDate(e.week)} ${e.at}: ${e.message}`),
    gameOver: s.gameOver ?? null,
  };
}

const isRetryable = (e: unknown) => (e as { code?: string })?.code === 'unavailable';

async function write(ref: DocRef, data: Record<string, unknown>) {
  try {
    await ref.set(data);
  } catch (e) {
    if (!isRetryable(e)) throw e;
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 800));
    await ref.set(data);
  }
}

export function sendErrorText(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'quota_exceeded') return 'Gönderim kutusu doldu. Claude’a söyle, eskilerini temizlesin.';
  if (code === 'not_granted' || code === 'revoked' || code === 'invalid_argument') return 'Bu sayfada Claude’a gönderme izni yok.';
  if (code === 'resource_exhausted') return 'Çok sık gönderildi, biraz sonra yeniden denenecek.';
  return 'Gönderilemedi, biraz sonra yeniden denenecek.';
}

/**
 * Save the whole game (gzip + base64, split into pieces under 256 KiB) plus a
 * short summary and the player's note under `playtests/<id>`. Pieces go first,
 * so a visible playtest is always complete; readers use the first `chunks`
 * pieces only.
 */
export async function sendToClaude(db: Db, s: GameState, note: string, id = `p${Date.now().toString(36)}`, auto = false): Promise<string> {
  const json = serialize(s);
  const packed = await gzipBase64(json);
  const text = packed ?? json;
  const size = packed ? 150_000 : 90_000;
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i += size) pieces.push(text.slice(i, i + size));
  for (let i = 0; i < pieces.length; i++) await write(db.doc(`playtests/${id}/chunks/${i}`), { i, data: pieces[i] });
  await write(db.doc(`playtests/${id}`), {
    sentAt: new Date().toISOString(),
    auto,
    note: note.trim().slice(0, 4000),
    encoding: packed ? 'gzip-base64' : 'json',
    chunks: pieces.length,
    saveVersion: s.version,
    summary: summary(s),
  });
  return id;
}

// ---------------- Automatic sharing ----------------

export type SyncMode = 'off' | 'disabled' | 'ask' | 'denied' | 'on' | 'sending' | 'error';
export interface SyncStatus {
  mode: SyncMode;
  lastSent?: number;
  message?: string;
}

const PREF_KEY = 'carfactycoon.share';
let status: SyncStatus = { mode: 'off' };
const listeners = new Set<() => void>();
let lastWeek = -1;
let lastErrors = 0;
let lastAt = 0;
let busy = false;

export const syncStatus = () => status;
export function onSyncStatus(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setStatus(next: SyncStatus) {
  status = next;
  for (const l of listeners) l();
}

export function sharingPreferred(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Find out whether this view can share, and whether the player still has to allow it. */
export async function initSync() {
  const db = await claudeDb();
  if (!db) return setStatus({ mode: 'off' });
  if (!sharingPreferred()) return setStatus({ mode: 'disabled' });
  const perms = await permissions();
  const state = perms ? await perms.state('db').catch((): PermissionState => 'prompt') : 'prompt';
  if (state === 'granted') setStatus({ mode: 'on' });
  else if (state === 'denied') setStatus({ mode: 'denied' });
  else if (state === 'unavailable') setStatus({ mode: 'off' });
  else setStatus({ mode: 'ask' });
}

/** The player's click: ask once, then share right away. */
export async function allowSharing(s: GameState | null) {
  try {
    localStorage.setItem(PREF_KEY, 'on');
  } catch {
    /* per-viewer preference only */
  }
  const perms = await permissions();
  if (perms) {
    const res = await perms.request(['db']).catch(() => ({}) as Record<string, PermissionState>);
    if (res.db === 'denied') return setStatus({ mode: 'denied' });
  }
  setStatus({ mode: 'on' });
  if (s) await syncNow(s);
}

export function disableSharing() {
  try {
    localStorage.setItem(PREF_KEY, 'off');
  } catch {
    /* per-viewer preference only */
  }
  setStatus({ mode: 'disabled' });
}

/** Keep the game's own document fresh: every in-game quarter (at most once a minute) and right after an error. */
export function syncTick(s: GameState, reason: 'tick' | 'hidden' = 'tick') {
  if (busy || (status.mode !== 'on' && status.mode !== 'error')) return;
  const now = Date.now();
  const errors = s.errors?.length ?? 0;
  const due =
    (errors > lastErrors && now - lastAt > 10_000) ||
    (s.week - lastWeek >= 13 && now - lastAt > 60_000) ||
    (reason === 'hidden' && s.week !== lastWeek && now - lastAt > 15_000) ||
    lastWeek < 0;
  if (due) void syncNow(s);
}

export async function syncNow(s: GameState) {
  const db = await claudeDb();
  if (!db || busy) return;
  busy = true;
  lastAt = Date.now();
  setStatus({ ...status, mode: 'sending' });
  try {
    await sendToClaude(db, s, '', `g${s.seed}`, true);
    lastWeek = s.week;
    lastErrors = s.errors?.length ?? 0;
    setStatus({ mode: 'on', lastSent: Date.now() });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    setStatus({ mode: code === 'not_granted' || code === 'revoked' ? 'denied' : 'error', lastSent: status.lastSent, message: sendErrorText(e) });
  } finally {
    busy = false;
  }
}
