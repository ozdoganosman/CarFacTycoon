import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gunzipSync } from 'zlib';
import { newGame } from '../src/core/game';

// The public build's playtest collection: nothing leaves before the player says yes.

const URL = 'https://collector.example/exec';

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
}

let posts: { url: string; init: RequestInit }[];

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_PLAYTEST_URL', URL);
  posts = [];
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    posts.push({ url, init });
    return new Response(null, { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('playtest collector', () => {
  it('asks first, sends nothing before a yes, then keeps one copy per player and game', async () => {
    const link = await import('../src/ui/claudeLink');
    const { playerId } = await import('../src/ui/collector');
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 1 });

    await link.initSync();
    expect(link.syncStatus().mode).toBe('ask');
    link.syncTick(s);
    await new Promise((r) => setTimeout(r, 20));
    expect(posts).toHaveLength(0);

    await link.allowSharing(s);
    expect(link.syncStatus().mode).toBe('on');
    expect(posts).toHaveLength(1);
    const p = posts[0];
    expect(p.url).toBe(URL);
    expect(p.init.mode).toBe('no-cors');
    expect((p.init.headers as Record<string, string>)['Content-Type']).toMatch(/^text\/plain/);
    const body = JSON.parse(String(p.init.body));
    expect(body.app).toBe('carfactycoon');
    expect(body.id).toBe(`${playerId()}-g1`);
    expect(body.player).toBe(playerId());
    expect(body.auto).toBe(true);
    expect(body.summary.company).toBe('Test');
    // The whole save travels, gzipped: it opens back into the same game.
    expect(body.encoding).toBe('gzip-base64');
    const save = JSON.parse(gunzipSync(Buffer.from(body.data, 'base64')).toString('utf8'));
    expect(save.week).toBe(s.week);
    expect(save.company.name).toBe('Test');
  });

  it('remembers a no, in this browser', async () => {
    const link = await import('../src/ui/claudeLink');
    await link.initSync();
    link.disableSharing();
    expect(link.syncStatus().mode).toBe('disabled');
    vi.resetModules();
    const again = await import('../src/ui/claudeLink');
    await again.initSync();
    expect(again.syncStatus().mode).toBe('disabled');
    again.syncTick(newGame({ companyName: 'Test', hq: 'usa', seed: 2 }));
    await new Promise((r) => setTimeout(r, 20));
    expect(posts).toHaveLength(0);
  });

  it('sends a one-off note without turning on automatic sharing', async () => {
    const link = await import('../src/ui/claudeLink');
    await link.initSync();
    const sink = await link.playtestSink();
    expect(sink?.kind).toBe('developer');
    await link.sendPlaytest(sink!, newGame({ companyName: 'Test', hq: 'usa', seed: 3 }), '  Fabrika ekranı karışık.  ');
    expect(posts).toHaveLength(1);
    const body = JSON.parse(String(posts[0].init.body));
    expect(body.note).toBe('Fabrika ekranı karışık.');
    expect(body.auto).toBe(false);
    expect(link.syncStatus().mode).toBe('ask');
  });

  it('refuses a playtest too large to post', async () => {
    const { postPlaytest } = await import('../src/ui/collector');
    await expect(postPlaytest(URL, { id: 'x', data: 'a'.repeat(3_000_000) })).rejects.toMatchObject({ code: 'too_big' });
    expect(posts).toHaveLength(0);
  });

  it('uses the built-in collector when the build names none, and never from inside claude.ai', async () => {
    vi.stubEnv('VITE_PLAYTEST_URL', '');
    const { COLLECTOR_URL } = await import('../src/ui/collector');
    expect(COLLECTOR_URL).toMatch(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/);
    const link = await import('../src/ui/claudeLink');
    expect((await link.playtestSink())?.kind).toBe('developer');
    // On a claude.ai page (runtime present) without a writable database: nothing goes out.
    vi.resetModules();
    vi.stubGlobal('window', { claude: { use: async () => null } });
    const inClaude = await import('../src/ui/claudeLink');
    expect(await inClaude.playtestSink()).toBeNull();
    await inClaude.initSync();
    expect(inClaude.syncStatus().mode).toBe('off');
  });
});
