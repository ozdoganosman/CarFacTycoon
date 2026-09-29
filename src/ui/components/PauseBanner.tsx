import { isBlockingModal } from '../../core/util';
import { t } from '../../i18n';
import { tx } from '../i18n';
import { store, useGameState } from '../store';
import { Button } from './ui';

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
        ▶ {t('Devam et (boşluk)')}
      </Button>
    </div>
  );
}
