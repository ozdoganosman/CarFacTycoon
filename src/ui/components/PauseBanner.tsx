import { guideStep } from '../../core/guide';
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
  // On the way to the first car the guide says it (GuideBar).
  if (!ready.length || s.gameOver || guideStep(s)) return null;
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
