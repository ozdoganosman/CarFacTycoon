import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gunzipSync } from 'zlib';
import { newGame } from '../src/core/game';
import { decide, recordError } from '../src/core/util';

// The public build's playtest collection (Supabase) and play analytics (PostHog):
// nothing leaves, and PostHog is not even loaded, before the player says yes.

const ph = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
}));
vi.mock('posthog-js', () => ({ default: ph }));

const DB = 'https://db.example';
const RPC = `${DB}/rest/v1/rpc/submit_playtest`;

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
  };
}

let posts: { url: string; init: RequestInit }[];
let answer: number;
const settle = () => new Promise((r) => setTimeout(r, 20));
const bodyOf = (i = 0) => JSON.parse(String(posts[i].init.body)).p;
const events = () => ph.capture.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', `${DB}/`);
  vi.stubEnv('VITE_SUPABASE_KEY', 'sb_publishable_test');
  posts = [];
  answer = 204;
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { origin: 'https://game.example', pathname: '/CarFacTycoon/' });
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    posts.push({ url, init });
    return new Response(null, { status: answer });
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
    await settle();
    expect(posts).toHaveLength(0);
    expect(ph.init).not.toHaveBeenCalled();

    await link.allowSharing(s);
    expect(link.syncStatus().mode).toBe('on');
    expect(posts).toHaveLength(1);
    const p = posts[0];
    expect(p.url).toBe(RPC);
    expect(p.init.method).toBe('POST');
    const headers = p.init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.apikey).toBe('sb_publishable_test');
    const body = bodyOf();
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

  it('shows a refused playtest as an error, to be tried again', async () => {
    answer = 400;
    const link = await import('../src/ui/claudeLink');
    await link.initSync();
    await link.allowSharing(newGame({ companyName: 'Test', hq: 'usa', seed: 4 }));
    expect(posts).toHaveLength(1);
    expect(link.syncStatus().mode).toBe('error');
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
    await settle();
    expect(posts).toHaveLength(0);
    expect(ph.init).not.toHaveBeenCalled();
  });

  it('sends a one-off note without turning on automatic sharing or analytics', async () => {
    const link = await import('../src/ui/claudeLink');
    await link.initSync();
    const sink = await link.playtestSink();
    expect(sink?.kind).toBe('developer');
    await link.sendPlaytest(sink!, newGame({ companyName: 'Test', hq: 'usa', seed: 3 }), '  Fabrika ekranı karışık.  ');
    expect(posts).toHaveLength(1);
    expect(bodyOf().note).toBe('Fabrika ekranı karışık.');
    expect(bodyOf().auto).toBe(false);
    expect(link.syncStatus().mode).toBe('ask');
    await settle();
    expect(ph.init).not.toHaveBeenCalled();
  });

  it('refuses a playtest too large to post', async () => {
    const { postPlaytest } = await import('../src/ui/collector');
    await expect(postPlaytest(RPC, { id: 'x', data: 'a'.repeat(3_000_000) })).rejects.toMatchObject({ code: 'too_big' });
    expect(posts).toHaveLength(0);
  });

  it('uses the built-in project when the build names none, and never from inside claude.ai', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_KEY', '');
    const { COLLECTOR_URL, SUPABASE_KEY } = await import('../src/ui/collector');
    expect(COLLECTOR_URL).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/rpc\/submit_playtest$/);
    expect(SUPABASE_KEY).toMatch(/^sb_publishable_/);
    const link = await import('../src/ui/claudeLink');
    expect((await link.playtestSink())?.kind).toBe('developer');
    // On a claude.ai page (runtime present) without a writable database: nothing goes out.
    vi.resetModules();
    vi.stubGlobal('window', { claude: { use: async () => null } });
    const inClaude = await import('../src/ui/claudeLink');
    expect(await inClaude.playtestSink()).toBeNull();
    await inClaude.initSync();
    expect(inClaude.syncStatus().mode).toBe('off');
    const analytics = await import('../src/ui/analytics');
    await analytics.startAnalytics();
    expect(ph.init).not.toHaveBeenCalled();
  });
});

describe('play analytics', () => {
  it('starts with the yes, under the same player id, and stops with a no', async () => {
    const link = await import('../src/ui/claudeLink');
    const { playerId } = await import('../src/ui/collector');
    await link.initSync();
    await link.allowSharing(null);
    await settle();
    expect(ph.init).toHaveBeenCalledTimes(1);
    const [key, config] = ph.init.mock.calls[0];
    expect(key).toMatch(/^phc_/);
    expect(config.api_host).toBe('https://eu.i.posthog.com');
    expect(config.bootstrap.distinctID).toBe(playerId());

    link.disableSharing();
    expect(ph.opt_out_capturing).toHaveBeenCalled();
    expect(ph.stopSessionRecording).toHaveBeenCalled();
  });

  it('starts on its own for a player who said yes before, but asks again after a yes to older wording', async () => {
    const link = await import('../src/ui/claudeLink');
    await link.initSync();
    await link.allowSharing(null);
    await settle();
    expect(ph.init).toHaveBeenCalledTimes(1);

    vi.resetModules();
    ph.init.mockClear();
    const again = await import('../src/ui/claudeLink');
    await again.initSync();
    await settle();
    expect(again.syncStatus().mode).toBe('on');
    expect(ph.init).toHaveBeenCalledTimes(1);

    // A yes from before analytics existed covered saves only.
    localStorage.setItem('carfactycoon.share', 'on');
    vi.resetModules();
    ph.init.mockClear();
    const old = await import('../src/ui/claudeLink');
    await old.initSync();
    await settle();
    expect(old.syncStatus().mode).toBe('ask');
    expect(ph.init).not.toHaveBeenCalled();
  });

  it('reports screens, decisions, years and errors once each, and nothing after a no', async () => {
    const a = await import('../src/ui/analytics');
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 7 });

    a.trackScreen('hq');
    a.observeGame(s);
    expect(ph.capture).not.toHaveBeenCalled();

    // It starts from where the player is: the screen and game seen before the yes.
    await a.startAnalytics();
    expect(events()).toEqual(['$pageview', 'game_started']);
    a.trackScreen('hq');
    a.trackScreen('factory');
    expect(ph.capture.mock.calls.filter((c) => c[0] === '$pageview').map((c) => c[1].$current_url)).toEqual([
      'https://game.example/CarFacTycoon/#hq',
      'https://game.example/CarFacTycoon/#factory',
    ]);

    ph.capture.mockClear();
    a.observeGame(s);
    expect(ph.capture).not.toHaveBeenCalled();

    decide(s, 'price:m1', 'Fiyat 450 $');
    decide(s, 'hire', '2 mühendis');
    recordError(s, 'tick', new Error('boom'));
    s.week += 52;
    a.observeGame(s);
    a.observeGame(s);
    expect(events()).toEqual(['decision', 'decision', 'year_end', 'game_error']);
    expect(ph.capture.mock.calls[0][1]).toMatchObject({ kind: 'price', text: 'Fiyat 450 $' });

    // The log is trimmed at 600 entries: what comes after is still seen.
    ph.capture.mockClear();
    for (let i = 0; i < 700; i++) {
      s.week++;
      decide(s, `k${i}`, `${i}`);
      a.observeGame(s);
    }
    expect(s.decisions).toHaveLength(600);
    expect(events().filter((e) => e === 'decision')).toHaveLength(700);
    s.week++;
    decide(s, 'last', 'son');
    ph.capture.mockClear();
    a.observeGame(s);
    expect(ph.capture.mock.calls.map((c) => c[1].key)).toEqual(['last']);

    a.stopAnalytics();
    ph.capture.mockClear();
    decide(s, 'after', 'sonra');
    a.observeGame(s);
    a.trackScreen('models');
    expect(ph.capture).not.toHaveBeenCalled();
  });
});
