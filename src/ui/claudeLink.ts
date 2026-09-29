import { serialize } from '../core/save';
import { formatDate } from '../core/time';
import type { GameState } from '../core/types';
import { t } from '../i18n';
import { resetAnalytics, startAnalytics, stopAnalytics } from './analytics';
import { COLLECTOR_URL, forgetPlayer, newPlayerId, playerId, postPlaytest } from './collector';

// Sends the player's game where it can be studied: on claude.ai, through the
// page's shared database (the "db" capability), where Claude reads the
// `playtests` collection; in the public build, to the developer's collector (a
// Google Apps Script that files it in Google Drive), but only after the player
// says yes. Once allowed, the running game keeps its own copy up to date; the
// menu button adds a separate snapshot with a note. With neither, the caller
// falls back to copying the save code.

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
  if (code === 'quota_exceeded') return t('Gönderim kutusu doldu. Claude’a söyle, eskilerini temizlesin.');
  if (code === 'not_granted' || code === 'revoked' || code === 'invalid_argument') return t('Bu sayfada Claude’a gönderme izni yok.');
  if (code === 'resource_exhausted') return t('Çok sık gönderildi, biraz sonra yeniden denenecek.');
  if (code === 'too_big') return t('Oyun kaydı gönderilemeyecek kadar büyük.');
  return t('Gönderilemedi, biraz sonra yeniden denenecek.');
}

/** Where playtests go: Claude (claude.ai page) or the developer's collector (public build). */
export type SinkKind = 'claude' | 'developer';
export interface Sink {
  kind: SinkKind;
  put(id: string, save: { encoding: string; data: string }, meta: Record<string, unknown>): Promise<void>;
}

/**
 * On claude.ai: the whole save (gzip + base64) split into pieces under 256 KiB, then the
 * summary under `playtests/<id>`. Pieces go first, so a visible playtest is always complete;
 * readers use the first `chunks` pieces only.
 */
function dbSink(db: Db): Sink {
  return {
    kind: 'claude',
    async put(id, save, meta) {
      const size = save.encoding === 'json' ? 90_000 : 150_000;
      const pieces: string[] = [];
      for (let i = 0; i < save.data.length; i += size) pieces.push(save.data.slice(i, i + size));
      for (let i = 0; i < pieces.length; i++) await write(db.doc(`playtests/${id}/chunks/${i}`), { i, data: pieces[i] });
      await write(db.doc(`playtests/${id}`), { ...meta, encoding: save.encoding, chunks: pieces.length });
    },
  };
}

/** In the public build: one request to the collector, which files it by id (a game's copy is replaced, not duplicated). */
function collectorSink(url: string): Sink {
  return {
    kind: 'developer',
    put: (id, save, meta) => postPlaytest(url, { id, ...meta, encoding: save.encoding, data: save.data }),
  };
}

let sinkPromise: Promise<Sink | null> | null = null;

/**
 * Where this copy of the game can send playtests, if anywhere. A claude.ai page only ever uses
 * its own database (a visitor who cannot write there copies the save code instead); the
 * collector is for copies of the game hosted elsewhere.
 */
export function playtestSink(): Promise<Sink | null> {
  sinkPromise ??= runtime()
    ? claudeDb().then((db) => (db ? dbSink(db) : null))
    : Promise.resolve(COLLECTOR_URL ? collectorSink(COLLECTOR_URL) : null);
  return sinkPromise;
}

/** Save the whole game plus a short summary and the player's note. */
export async function sendPlaytest(sink: Sink, s: GameState, note: string, id = `p${Date.now().toString(36)}`, auto = false): Promise<string> {
  const json = serialize(s);
  const packed = await gzipBase64(json);
  await sink.put(
    id,
    { encoding: packed ? 'gzip-base64' : 'json', data: packed ?? json },
    { sentAt: new Date().toISOString(), auto, note: note.trim().slice(0, 4000), saveVersion: s.version, summary: summary(s) },
  );
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
/**
 * The public build's yes. Versioned: a yes given to older wording (saves only, before play
 * analytics) is asked again; a no is kept.
 */
const DEV_CONSENT = 'on:2';
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

function sharingPref(): string | null {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

export function sharingPreferred(): boolean {
  return sharingPref() !== 'off';
}

/** Find out whether this view can share, and whether the player still has to allow it. */
export async function initSync() {
  const sink = await playtestSink();
  if (!sink) return setStatus({ mode: 'off' });
  // The public build shares only after the player has said yes, in this browser.
  if (sink.kind === 'developer') {
    const pref = sharingPref();
    if (pref === DEV_CONSENT) void startAnalytics();
    return setStatus({ mode: pref === DEV_CONSENT ? 'on' : pref === 'off' ? 'disabled' : 'ask' });
  }
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
  const sink = await playtestSink();
  try {
    localStorage.setItem(PREF_KEY, sink?.kind === 'developer' ? DEV_CONSENT : 'on');
  } catch {
    /* per-viewer preference only */
  }
  const perms = sink?.kind === 'claude' ? await permissions() : null;
  if (perms) {
    const res = await perms.request(['db']).catch(() => ({}) as Record<string, PermissionState>);
    if (res.db === 'denied') return setStatus({ mode: 'denied' });
  }
  // The same yes covers how the game is played (PostHog), in the public build only.
  if (sink?.kind === 'developer') void startAnalytics();
  setStatus({ mode: 'on' });
  if (s) await syncNow(s);
}

export function disableSharing() {
  try {
    localStorage.setItem(PREF_KEY, 'off');
  } catch {
    /* per-viewer preference only */
  }
  stopAnalytics();
  setStatus({ mode: 'disabled' });
}

/**
 * The public build's "delete my data": sharing stops, everything this player sent is
 * deleted, and a new player id is used from now on. Returns how many games went.
 */
export async function forgetMe(): Promise<{ deleted: number; player: string }> {
  const player = playerId();
  disableSharing();
  resetAnalytics();
  // A copy on its way now would arrive after the deletion: let it land first.
  for (let i = 0; busy && i < 100; i++) await new Promise((r) => setTimeout(r, 100));
  const deleted = await forgetPlayer(player);
  newPlayerId();
  lastWeek = -1;
  return { deleted, player };
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
  const sink = await playtestSink();
  if (!sink || busy) return;
  busy = true;
  lastAt = Date.now();
  setStatus({ ...status, mode: 'sending' });
  try {
    // One copy per game; in the public build, per player too (two players can share a seed).
    await sendPlaytest(sink, s, '', sink.kind === 'developer' ? `${playerId()}-g${s.seed}` : `g${s.seed}`, true);
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
