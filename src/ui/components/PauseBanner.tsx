import { isBlockingModal } from '../../core/util';
import { t } from '../../i18n';
import { tx } from '../i18n';
import { store, useGameState } from '../store';
import { Button } from './ui';
import { Icon } from './Icon';

/**
 * A finished car waiting for its launch, on every screen but its own: pop-ups and the year report come
 * and go, and one car waited more than a year behind them.
 */
export function LaunchReadyBanner() {
  const s = useGameState();
  const sc = store.screen;
  const ready = s.projects.filter((p) => p.phase === 'ready' && !(sc.id === 'project' && sc.projectId === p.id));
  if (!ready.length || s.gameOver) return null;
  return (
    <>
      {ready.map((p) => {
        const weeks = Math.max(0, s.week - (p.productionReadyWeek ?? s.week));
        return (
          <div key={p.id} className="pause-banner launch-ready" role="status">
            <Icon name="rosette" size={22} className="banner-icon" />
            <span>
              {weeks > 0
                ? tx('<b>{name} hazır</b> ve {n} haftadır lansman bekliyor: bu sürede maaşlar ödeniyor ama araba satılmıyor.', { name: p.name, n: weeks })
                : tx('<b>{name} hazır:</b> fiyatı seçip lansmanı yap.', { name: p.name })}
            </span>
            <Button kind="primary" small onClick={() => store.go({ id: 'project', projectId: p.id })}>
              {t('Lansmana git')}
            </Button>
          </div>
        );
      })}
    </>
  );
}

/** Reminds the player that nothing happens while the clock is stopped. */
export function PauseBanner() {
  const s = useGameState();
  if (store.speed !== 0 || s.modals.some(isBlockingModal) || s.gameOver) return null;
  const waiting =
    s.projects.some((p) => p.phase === 'development' || p.phase === 'testing' || (p.phase === 'production' && p.productionReadyWeek !== undefined)) ||
    s.models.some((m) => m.status === 'active');
  if (!waiting) return null;
  return (
    <div className="pause-banner" role="status">
      <span>{tx('<b>Oyun duraklatıldı.</b> Zaman akmadan mühendisler çalışmaz, testler ilerlemez, fabrika üretmez.')}</span>
      <Button kind="primary" small onClick={() => store.setSpeed(store.lastSpeed)}>
        <Icon name="play" /> {t('Devam et (boşluk)')}
      </Button>
    </div>
  );
}
