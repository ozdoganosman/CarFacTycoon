import { AdClock } from './adPolicy';
import { store } from './store';

// Advertisements and the "remove ads" purchase, as the game sees them. Only the Android app has a
// real backend (src/native/ads.ts, AdMob and Google Play Billing); the browser game has none and
// shows no advertisement. `?fakeads` in the address (or carfactycoon.fakeAds=1) stands in for the
// app when trying the screens in a browser.

export type FullAd = 'rewarded' | 'yearEnd' | 'interstitial';

/** A rectangle in CSS pixels of the page, where the newspaper's advertisement goes. */
export interface Slot {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AdBackend {
  fake?: boolean;
  /** Loaded and ready to show. */
  ready(kind: FullAd): boolean;
  /** Shows it; true once the reward was earned (for an interstitial: once it was shown). */
  show(kind: FullAd): Promise<boolean>;
  /** The advertisement in the newspaper, drawn by the app over the slot. */
  paper: { ready(): boolean; show(slot: Slot): Promise<boolean>; hide(): void };
  /** Google Play: the one-time "remove ads" product. */
  shop: { price(): string | null; buy(): Promise<'bought' | 'cancelled' | 'failed'>; restore(): Promise<boolean> };
  /** The consent choices (Europe and wherever the law asks for them). */
  privacy: { required(): boolean; show(): Promise<void> };
}

const NO_ADS_KEY = 'carfactycoon.noAds';

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

class Ads {
  backend: AdBackend | null = null;
  /** The player bought "remove ads": no advertisement starts by itself any more. */
  noAds = readFlag(NO_ADS_KEY);
  readonly clock = new AdClock(Date.now());
  /** A full-screen advertisement is on screen. */
  busy = false;

  setBackend(b: AdBackend | null) {
    this.backend = b;
    store.notify();
  }

  /** Something loaded or changed: redraw. */
  changed() {
    store.notify();
  }

  setNoAds(v: boolean) {
    this.noAds = v;
    try {
      if (v) localStorage.setItem(NO_ADS_KEY, '1');
      else localStorage.removeItem(NO_ADS_KEY);
    } catch {
      /* storage unavailable: it holds for this session */
    }
    if (v) this.backend?.paper.hide();
    store.notify();
  }

  ready(kind: FullAd) {
    return !this.busy && !!this.backend?.ready(kind);
  }

  /** Advertisements that start by themselves (interstitials, the newspaper's, the year-end countdown). */
  get forced() {
    return !!this.backend && !this.noAds;
  }

  /** The player asked for it (or accepted the year-end offer): the clock stops while it plays. */
  async watch(kind: 'rewarded' | 'yearEnd'): Promise<boolean> {
    if (!this.ready(kind)) return false;
    return this.play(kind);
  }

  /** A natural break in the game: maybe an interstitial, within the limits in adPolicy.ts. */
  async breakpoint(): Promise<void> {
    if (!this.forced || !this.ready('interstitial') || !this.clock.canInterstitial(Date.now())) return;
    await this.play('interstitial');
  }

  private async play(kind: FullAd): Promise<boolean> {
    const b = this.backend;
    if (!b) return false;
    this.busy = true;
    const resume = store.pauseFor();
    store.notify();
    try {
      return await b.show(kind);
    } catch {
      return false;
    } finally {
      this.busy = false;
      this.clock.shown(Date.now());
      resume();
      store.notify();
    }
  }
}

export const ads = new Ads();

/** Stand-in for the app in a browser: a grey card for two seconds, and the reward. */
export function fakeBackend(): AdBackend {
  const show = (kind: FullAd) =>
    new Promise<boolean>((resolve) => {
      const el = document.createElement('div');
      el.className = 'fake-ad';
      el.textContent = kind === 'interstitial' ? 'Test reklamı (geçiş)' : 'Test reklamı (ödüllü)';
      document.body.appendChild(el);
      setTimeout(() => {
        el.remove();
        resolve(true);
      }, 2000);
    });
  return {
    fake: true,
    ready: () => true,
    show,
    paper: { ready: () => true, show: async () => true, hide: () => {} },
    shop: {
      price: () => '₺99,99',
      buy: async () => {
        ads.setNoAds(true);
        return 'bought';
      },
      restore: async () => ads.noAds,
    },
    privacy: { required: () => true, show: async () => {} },
  };
}

export function useFakeAds() {
  try {
    return new URLSearchParams(location.search).has('fakeads') || readFlag('carfactycoon.fakeAds');
  } catch {
    return false;
  }
}
