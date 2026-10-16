import { formatDate } from '../../core/time';
import { timeLocked } from '../../core/guide';
import { msg, t } from '../../i18n';
import { store, useGameState, type Speed } from '../store';
import { money, recentProfit, signedMoney } from '../format';
import { Icon, type IconName } from './Icon';
import { SponsorChip } from './Sponsor';
import { useTweened } from '../anim';

const SPEEDS: { s: Speed; icon: IconName; title: string }[] = [
  { s: 0, icon: 'pause', title: msg('Duraklat (boşluk)') },
  { s: 1, icon: 'play', title: msg('Normal hız (1)') },
  { s: 2, icon: 'fast', title: msg('Hızlı (2)') },
  { s: 3, icon: 'fastest', title: msg('Çok hızlı (3)') },
];

export function TopBar() {
  const s = useGameState();
  const weekly = recentProfit(s, 4);
  // A stopped clock shows on the date itself (a tap starts it again), not as a banner over every screen.
  const paused = store.speed === 0 && !s.gameOver;
  // The till runs to its new figure and glows green or red for a moment.
  const cash = useTweened(s.company.cash);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <Icon name="settings" size={20} />
        </span>
        <span className="brand-name">{s.company.name}</span>
      </div>
      {paused ? (
        <button
          type="button"
          className="topbar-date is-paused"
          onClick={() => store.setSpeed(store.lastSpeed)}
          title={`${t('Zaman akmadan mühendisler çalışmaz, testler ilerlemez, fabrika üretmez.')} ${t('Devam etmek için dokun.')}`}
        >
          {formatDate(s.week)}
          <span className="pause-mark">{t('Duraklatıldı')}</span>
        </button>
      ) : (
        <div className="topbar-date" aria-live="polite">
          {formatDate(s.week)}
        </div>
      )}
      <div className="topbar-kpis">
        <div className="kpi" title={t('Kasadaki para')}>
          <span>{t('Kasa')}</span>
          <b className={`${s.company.cash < 0 ? 'tone-bad' : ''} ${cash.trend ? `is-${cash.trend}` : ''}`}>{money(cash.value)}</b>
        </div>
        <SponsorChip />
        <div className="kpi" title={t('Son 4 haftanın ortalama haftalık kârı (yatırımlar hariç)')}>
          <span>{t('Haftalık')}</span>
          <b className={weekly < 0 ? 'tone-bad' : 'tone-good'}>{signedMoney(weekly)}</b>
        </div>
        <div className="kpi kpi-hide-sm" title={t('Marka itibarı (0-100)')}>
          <span>{t('İtibar')}</span>
          <b>{Math.round(s.company.reputation)}</b>
        </div>
      </div>
      <div className="speed" role="group" aria-label={t('Oyun hızı')} data-guide="speed">
        {SPEEDS.map((x) => (
          <button
            key={x.s}
            type="button"
            className={`speed-btn ${store.speed === x.s ? 'is-on' : ''} ${paused && !timeLocked(s) && x.s === store.lastSpeed ? 'is-hint' : ''}`}
            onClick={() => store.setSpeed(x.s)}
            title={t(x.title)}
            aria-pressed={store.speed === x.s}
            disabled={!!s.gameOver}
          >
            <Icon name={x.icon} size={x.s === 3 ? 20 : 16} />
          </button>
        ))}
      </div>
    </header>
  );
}
