import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { t } from '../i18n';
import { closeTopmost } from '../ui/back';
import { store } from '../ui/store';

// The Android app around the game: the back button, what happens when the app goes
// to the background, the splash screen and a light tap under the finger.
// Loaded only inside the app (see main.tsx).

/** Where the back button goes from a screen (project → projects, model → models, others → HQ). */
function previousScreen() {
  const id = store.screen.id;
  if (id === 'project') return { id: 'projects' } as const;
  if (id === 'model') return { id: 'models' } as const;
  return id === 'hq' ? null : ({ id: 'hq' } as const);
}

let asking = false;

/** The Android back button: close what is open, else go back a screen, else offer to quit. */
export async function handleBack() {
  // A question on screen: back means "no".
  if (store.question) return store.question.resolve(false);
  if (closeTopmost()) return;
  if (store.newsOpen) return store.closeNews();
  // A decision the game is waiting for stays until it is answered.
  if (document.querySelector('.modal-backdrop')) return;
  if (!store.state) return App.exitApp();
  const back = previousScreen();
  if (back) return store.go(back);
  if (asking) return;
  asking = true;
  const quit = await store.ask({
    title: t('Oyundan çıkılsın mı?'),
    body: t('Oyunun kaydedildi; açtığında kaldığın yerden sürer.'),
    confirm: t('Çık'),
  });
  asking = false;
  if (quit) {
    store.save();
    await App.exitApp();
  }
}

/** A short tap under the finger on buttons that move the game on. */
function hapticTaps() {
  document.addEventListener(
    'click',
    (e) => {
      const b = (e.target as HTMLElement | null)?.closest?.('button');
      if (!b || b.disabled) return;
      if (b.matches('.btn-primary, .nav-item, .speed-btn')) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    },
    true,
  );
}

export function initNative() {
  document.documentElement.classList.add('native');
  void App.addListener('backButton', () => void handleBack());
  // In the background the clock stops and the game is saved; the player starts it again.
  void App.addListener('pause', () => {
    if (!store.state) return;
    store.setSpeed(0);
    store.save();
  });
  hapticTaps();
  // Advertisements and the "remove ads" purchase (after the consent question where the law asks for it).
  void import('./ads').then((m) => m.initAds()).catch(() => {});
  // The first frame is on screen: let the splash go.
  requestAnimationFrame(() => void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {}));
}
