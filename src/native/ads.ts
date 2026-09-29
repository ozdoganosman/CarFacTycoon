import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents,
  RewardInterstitialAdPluginEvents,
} from '@capacitor-community/admob';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { ads, type AdBackend, type FullAd, type Slot } from '../ui/ads';

// The Android app's advertisements (AdMob) and the "remove ads" purchase (Google Play Billing).
// Ad unit ids come from the build (VITE_ADMOB_*, see .github/workflows/android.yml); without them
// Google's test units are used, which show "Test Ad" and earn nothing.

const env = import.meta.env;
const TEST = {
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  yearEnd: 'ca-app-pub-3940256099942544/5354046379',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  paper: 'ca-app-pub-3940256099942544/2247696110',
};
const UNITS = {
  rewarded: env.VITE_ADMOB_REWARDED || TEST.rewarded,
  yearEnd: env.VITE_ADMOB_REWARDED_INTERSTITIAL || TEST.yearEnd,
  interstitial: env.VITE_ADMOB_INTERSTITIAL || TEST.interstitial,
  paper: env.VITE_ADMOB_NATIVE || TEST.paper,
};
const TESTING = !env.VITE_ADMOB_REWARDED;

/** The Play Console product that removes the advertisements (a one-time, non-consumable product). */
export const REMOVE_ADS = 'remove_ads';

/** The newspaper's advertisement: AdMob's native ad drawn by the app over the page (android/.../PaperAdPlugin.java). */
interface PaperAdPlugin {
  load(o: { adUnitId: string }): Promise<void>;
  show(o: Slot & { viewportWidth: number }): Promise<void>;
  hide(): Promise<void>;
}
const PaperAd = registerPlugin<PaperAdPlugin>('PaperAd');

const loaded: Record<FullAd | 'paper', boolean> = { rewarded: false, yearEnd: false, interstitial: false, paper: false };
let canRequest = false;
let privacyRequired = false;
let price: string | null = null;

/** Load one kind; on failure try again later, a little later each time (at most every five minutes). */
async function load(kind: FullAd | 'paper', attempt = 0): Promise<void> {
  if (!canRequest || loaded[kind]) return;
  if (kind !== 'rewarded' && kind !== 'yearEnd' && ads.noAds) return;
  try {
    if (kind === 'rewarded') await AdMob.prepareRewardVideoAd({ adId: UNITS.rewarded, isTesting: TESTING });
    else if (kind === 'yearEnd') await AdMob.prepareRewardInterstitialAd({ adId: UNITS.yearEnd, isTesting: TESTING });
    else if (kind === 'interstitial') await AdMob.prepareInterstitial({ adId: UNITS.interstitial, isTesting: TESTING });
    else await PaperAd.load({ adUnitId: UNITS.paper });
    loaded[kind] = true;
    ads.changed();
  } catch {
    const wait = Math.min(300, 20 * 2 ** attempt) * 1000;
    setTimeout(() => void load(kind, attempt + 1), wait);
  }
}

const EVENTS = {
  rewarded: RewardAdPluginEvents,
  yearEnd: RewardInterstitialAdPluginEvents,
  interstitial: InterstitialAdPluginEvents,
} as const;

/**
 * Show a full-screen advertisement and wait until it is closed. The plugin's show() only returns
 * when a reward is earned, so the outcome is read from its events.
 */
function show(kind: FullAd): Promise<boolean> {
  loaded[kind] = false;
  const ev = EVENTS[kind];
  return new Promise((resolve) => {
    let earned = kind === 'interstitial';
    let over = false;
    const handles: PluginListenerHandle[] = [];
    const finish = (ok: boolean) => {
      if (over) return;
      over = true;
      for (const h of handles) void h.remove();
      resolve(ok);
      void load(kind);
    };
    const listen = <T,>(name: string, fn: (x: T) => void) =>
      (AdMob.addListener as (n: string, f: (x: T) => void) => Promise<PluginListenerHandle>)(name, fn).then((h) => handles.push(h));
    const setup = [
      listen(ev.Dismissed, () => setTimeout(() => finish(earned), 400)),
      listen(ev.FailedToShow, () => finish(false)),
      kind !== 'interstitial' ? listen((ev as typeof RewardAdPluginEvents).Rewarded, () => (earned = true)) : Promise.resolve(),
    ];
    void Promise.all(setup).then(() => {
      const shown =
        kind === 'rewarded' ? AdMob.showRewardVideoAd() : kind === 'yearEnd' ? AdMob.showRewardInterstitialAd() : AdMob.showInterstitial();
      void shown.then(
        () => {
          if (kind !== 'interstitial') earned = true;
        },
        () => finish(false),
      );
    });
  });
}

async function refreshPurchases(): Promise<boolean> {
  try {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    const owned = purchases.some((p) => p.productIdentifier === REMOVE_ADS && (p.purchaseState === undefined || p.purchaseState === '1'));
    ads.setNoAds(owned);
    return owned;
  } catch {
    // No answer from Google Play (offline): keep what we knew.
    return ads.noAds;
  }
}

const backend: AdBackend = {
  ready: (kind) => canRequest && loaded[kind],
  show,
  paper: {
    ready: () => canRequest && loaded.paper && !ads.noAds,
    show: async (slot) => {
      if (!loaded.paper) return false;
      try {
        await PaperAd.show({ ...slot, viewportWidth: window.innerWidth });
        return true;
      } catch {
        return false;
      }
    },
    hide: () => {
      if (!loaded.paper) return;
      // An advertisement is shown once; the next paper gets a fresh one.
      loaded.paper = false;
      void PaperAd.hide().finally(() => void load('paper'));
    },
  },
  shop: {
    price: () => price,
    buy: async () => {
      try {
        const t = await NativePurchases.purchaseProduct({ productIdentifier: REMOVE_ADS, productType: PURCHASE_TYPE.INAPP });
        if (t.purchaseState !== undefined && t.purchaseState !== '1') return 'failed';
        ads.setNoAds(true);
        return 'bought';
      } catch (e) {
        return /cancel/i.test(String((e as Error)?.message ?? e)) ? 'cancelled' : 'failed';
      }
    },
    restore: async () => {
      try {
        await NativePurchases.restorePurchases();
      } catch {
        /* fall through to what Google Play lists */
      }
      return refreshPurchases();
    },
  },
  privacy: {
    required: () => privacyRequired,
    show: async () => {
      await AdMob.showPrivacyOptionsForm();
      const info = await AdMob.requestConsentInfo();
      canRequest = info.canRequestAds;
    },
  },
};

export async function initAds() {
  ads.setBackend(backend);
  // Owned purchases and the price first: they need no consent.
  void refreshPurchases();
  void NativePurchases.getProduct({ productIdentifier: REMOVE_ADS, productType: PURCHASE_TYPE.INAPP }).then(
    ({ product }) => {
      price = product.priceString;
      ads.changed();
    },
    () => {},
  );
  try {
    // Google's consent message where the law asks for one (set up in AdMob → Privacy & messaging).
    let info = await AdMob.requestConsentInfo();
    if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) info = await AdMob.showConsentForm();
    privacyRequired = String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
    canRequest = info.canRequestAds;
  } catch {
    // The consent service could not be reached (offline, or no consent message set up in AdMob yet):
    // Google's ads SDK still applies any consent given before and serves limited ads without one.
    canRequest = true;
  }
  if (!canRequest) {
    ads.changed();
    return;
  }
  await AdMob.initialize({ initializeForTesting: TESTING });
  for (const k of ['rewarded', 'yearEnd', 'interstitial', 'paper'] as const) void load(k);
}
