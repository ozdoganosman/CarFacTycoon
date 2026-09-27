import { serialize } from '../core/save';
import { formatDate } from '../core/time';
import type { GameState } from '../core/types';

// Sends the player's game to Claude through the page's shared database (the
// claude.ai "db" capability). Claude reads the `playtests` collection later to
// study how the game is being played. Outside claude.ai there is no database:
// the caller falls back to copying the save code.

interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
}
interface Db {
  doc(path: string): DocRef;
}
interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

let dbPromise: Promise<Db | null> | null = null;

/** The page's database, or null where it cannot run (outside claude.ai, not granted). */
export function claudeDb(): Promise<Db | null> {
  if (!dbPromise) {
    const runtime = (window as unknown as { claude?: ClaudeRuntime }).claude;
    dbPromise =
      runtime && typeof runtime.use === 'function'
        ? runtime.use('db').then(
            (db) => (db as Db | null) ?? null,
            () => null,
          )
        : Promise.resolve(null);
  }
  return dbPromise;
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
  return 'Gönderilemedi, biraz sonra yeniden dene.';
}

/**
 * Save the whole game (gzip + base64, split into pieces under 256 KiB) plus a
 * short summary and the player's note. Pieces go first, so a visible playtest
 * is always complete.
 */
export async function sendToClaude(db: Db, s: GameState, note: string): Promise<string> {
  const json = serialize(s);
  const packed = await gzipBase64(json);
  const text = packed ?? json;
  const size = packed ? 150_000 : 90_000;
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i += size) pieces.push(text.slice(i, i + size));
  const id = `p${Date.now().toString(36)}`;
  for (let i = 0; i < pieces.length; i++) await write(db.doc(`playtests/${id}/chunks/${i}`), { i, data: pieces[i] });
  await write(db.doc(`playtests/${id}`), {
    sentAt: new Date().toISOString(),
    note: note.trim().slice(0, 4000),
    encoding: packed ? 'gzip-base64' : 'json',
    chunks: pieces.length,
    saveVersion: s.version,
    summary: summary(s),
  });
  return id;
}
