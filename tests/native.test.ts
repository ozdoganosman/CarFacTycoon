import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame } from '../src/core/game';

// The Android back button (src/native/native.ts): it closes what is open before it
// leaves a screen, never skips a decision the game waits for, and asks before quitting.

const app = vi.hoisted(() => ({ exitApp: vi.fn(async () => {}), addListener: vi.fn(async () => ({ remove: async () => {} })) }));
vi.mock('@capacitor/app', () => ({ App: app }));
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn(async () => {}) }, ImpactStyle: { Light: 'LIGHT' } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: vi.fn(async () => {}) } }));

let backdrop: object | null;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  backdrop = null;
  vi.stubGlobal('document', { querySelector: (sel: string) => (sel === '.modal-backdrop' ? backdrop : null) });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('window', {});
});

afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const { store } = await import('../src/ui/store');
  const native = await import('../src/native/native');
  const back = await import('../src/ui/back');
  store.state = newGame({ companyName: 'Test', hq: 'usa', seed: 1 });
  store.screen = { id: 'hq' };
  return { store, handleBack: native.handleBack, back };
}

describe('Android back button', () => {
  it('goes back a screen: project → projects, model → models, others → HQ', async () => {
    const { store, handleBack } = await setup();
    store.screen = { id: 'project', projectId: 'p1' };
    await handleBack();
    expect(store.screen).toEqual({ id: 'projects' });
    store.screen = { id: 'model', modelId: 'm1' };
    await handleBack();
    expect(store.screen).toEqual({ id: 'models' });
    store.screen = { id: 'factory' };
    await handleBack();
    expect(store.screen).toEqual({ id: 'hq' });
  });

  it('closes what is open first, newest first, then the newspaper', async () => {
    const { store, handleBack, back } = await setup();
    store.screen = { id: 'factory' };
    store.newsOpen = 'n1';
    const closed: string[] = [];
    // What useBackClose does while a window and then a bubble on it are open.
    back.pushBack(() => closed.push('window'));
    const bubbleClosedByTap = back.pushBack(() => closed.push('bubble'));
    bubbleClosedByTap();
    back.pushBack(() => closed.push('other bubble'));
    await handleBack();
    expect(closed).toEqual(['other bubble']);
    await handleBack();
    expect(closed).toEqual(['other bubble', 'window']);
    await handleBack();
    expect(store.newsOpen).toBeNull();
    expect(store.screen).toEqual({ id: 'factory' });
    await handleBack();
    expect(store.screen).toEqual({ id: 'hq' });
  });

  it('answers "no" to an open question instead of leaving the screen', async () => {
    const { store, handleBack } = await setup();
    store.screen = { id: 'finance' };
    const answer = store.ask({ title: 'Emin misin?', body: '', confirm: 'Evet' });
    await handleBack();
    await expect(answer).resolves.toBe(false);
    expect(store.screen).toEqual({ id: 'finance' });
  });

  it('leaves a decision the game waits for on screen', async () => {
    const { store, handleBack } = await setup();
    store.screen = { id: 'factory' };
    backdrop = {};
    await handleBack();
    expect(store.screen).toEqual({ id: 'factory' });
    expect(app.exitApp).not.toHaveBeenCalled();
  });

  it('asks before quitting from HQ, and saves when the player quits', async () => {
    const { store, handleBack } = await setup();
    const save = vi.spyOn(store, 'save').mockImplementation(() => {});
    const pending = handleBack();
    await Promise.resolve();
    expect(store.question?.title).toMatch(/çıkılsın/);
    // A second press while the question is open answers it with "no".
    await handleBack();
    await pending;
    expect(app.exitApp).not.toHaveBeenCalled();

    const again = handleBack();
    await Promise.resolve();
    store.question!.resolve(true);
    await again;
    expect(save).toHaveBeenCalled();
    expect(app.exitApp).toHaveBeenCalledTimes(1);
  });

  it('closes the app from the start menu', async () => {
    const { store, handleBack } = await setup();
    store.state = null;
    await handleBack();
    expect(app.exitApp).toHaveBeenCalledTimes(1);
  });
});
