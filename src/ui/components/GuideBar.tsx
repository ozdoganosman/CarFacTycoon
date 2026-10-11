import type { ReactNode } from 'react';
import { GUIDE_STEPS, guideStep, type GuideStep } from '../../core/guide';
import { t } from '../../i18n';
import { tx } from '../i18n';
import { store, useGameState } from '../store';
import { Icon, type IconName } from './Icon';
import { Button } from './ui';

/**
 * The way to the first car, one step at a time, at the top of every screen until it is on sale
 * (core/guide.ts). Its button takes the player to the screen of the step and points at the
 * button to press there; while the clock is the only thing missing, it starts the clock.
 */
export function GuideBar() {
  const s = useGameState();
  const g = guideStep(s);
  if (!g) return null;
  const sc = store.screen;
  const onProject = 'p' in g && sc.id === 'project' && sc.projectId === g.p.id;
  const paused = store.speed === 0;
  const { icon, text, action } = describe(g, onProject, sc.id === 'projects', paused);
  return (
    <div className="guide-bar" role="status">
      <div className="guide-head">
        <span className="guide-label">{t('İlk araban · {n}/{total}', { n: g.n, total: GUIDE_STEPS })}</span>
        <span className="guide-dots" aria-hidden>
          {Array.from({ length: GUIDE_STEPS }, (_, i) => (
            <i key={i} className={i + 1 < g.n ? 'is-done' : i + 1 === g.n ? 'is-on' : ''} />
          ))}
        </span>
        <button
          type="button"
          className="guide-close"
          aria-label={t('Rehberi kapat')}
          title={t('Rehberi kapat')}
          onClick={async () => {
            const ok = await store.ask({
              title: t('Rehber kapansın mı?'),
              body: t('Bütün ekranlar menüde açılır ve ilk araba için adım adım yol gösterilmez. Ayarlar’dan yeniden açabilirsin.'),
              confirm: t('Rehberi kapat'),
            });
            if (ok) store.act((st) => (st.settings.guided = false));
          }}
        >
          ×
        </button>
      </div>
      <div className="guide-body">
        <Icon name={icon} size={22} className="guide-icon" />
        <span className="guide-text">{text}</span>
        {action && (
          <Button kind="primary" small onClick={action.run}>
            {action.play && <Icon name="play" />} {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}

interface Described {
  icon: IconName;
  text: ReactNode;
  action?: { label: string; run: () => void; play?: boolean };
}

function describe(g: GuideStep, onProject: boolean, onProjects: boolean, paused: boolean): Described {
  const play = paused ? { label: t('Zamanı başlat'), run: () => store.setSpeed(store.lastSpeed), play: true } : undefined;
  /** Go to the project and point at the button to press there. */
  const point = (target: string, label: string) =>
    'p' in g ? { label: onProject ? t('Göster') : label, run: () => pointAt(g.p.id, target) } : undefined;
  switch (g.kind) {
    case 'newProject':
      return onProjects
        ? { icon: 'projects', text: tx('Arabanın sınıfını seç ve <b>Tasarıma başla</b>’ya bas: mühendisler ilk araban için sade bir tasarım hazırlar.') }
        : { icon: 'projects', text: tx('Şirketin ilk arabasını yap: bir proje aç ve sınıfını seç.'), action: { label: t('Proje aç'), run: () => store.go({ id: 'projects' }) } };
    case 'design':
      return {
        icon: 'projects',
        text: tx('<b>{name}</b>: tasarım hazır, istediğin gibi değiştirebilirsin. Sonra <b>Geliştirmeyi başlat</b>’a bas.', { name: g.p.name }),
        action: point('start-dev', t('Projeye git')),
      };
    case 'development':
      return g.done
        ? { icon: 'research', text: tx('<b>{name}</b>: geliştirme bitti. Prototipleri yap ve teste geç.', { name: g.p.name }), action: point('to-testing', t('Projeye git')) }
        : {
            icon: 'clock',
            text: paused
              ? tx('<b>{name}</b> geliştiriliyor: ~{n} hafta. Zaman durunca mühendisler de durur.', { name: g.p.name, n: g.weeks })
              : tx('<b>{name}</b> geliştiriliyor: ~{n} hafta. Bitince oyun durur ve seni çağırır.', { name: g.p.name, n: g.weeks }),
            action: play,
          };
    case 'testing':
      return g.done
        ? { icon: 'research', text: tx('<b>{name}</b>: testler bitti. Üretim hazırlığına geç.', { name: g.p.name }), action: point('finish-tests', t('Projeye git')) }
        : {
            icon: 'clock',
            text: tx('<b>{name}</b> test ediliyor: ~{n} hafta. Testler kusurları bulur ve arabayı ayarlar.', { name: g.p.name, n: g.weeks }),
            action: play,
          };
    case 'tooling':
      return g.ordered
        ? { icon: 'factory', text: tx('<b>{name}</b>: kalıplar hazırlanıyor, ~{n} hafta sonra araba üretime hazır.', { name: g.p.name, n: g.weeks }), action: play }
        : {
            icon: 'factory',
            text: tx('<b>{name}</b>: üretim hattını ve kalıpları seç, kalıpları sipariş et.', { name: g.p.name }),
            action: point('order-tooling', t('Projeye git')),
          };
    case 'launch':
      return {
        icon: 'rosette',
        text: tx('<b>{name}</b> hazır: fiyatını seç ve arabayı piyasaya çıkar.', { name: g.p.name }),
        action: point('launch', t('Lansmana git')),
      };
  }
}

/** Open the project and bring the button to press into view, with a short pulse. */
function pointAt(projectId: string, target: string) {
  const sc = store.screen;
  if (!(sc.id === 'project' && sc.projectId === projectId)) store.go({ id: 'project', projectId });
  // After the screen has drawn.
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-guide="${target}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('guide-pulse');
    void el.offsetWidth;
    el.classList.add('guide-pulse');
    setTimeout(() => el.classList.remove('guide-pulse'), 2600);
  }, 80);
}
