import { formatDate } from '../../core/time';
import { msg, t } from '../../i18n';
import { store, useGameState, type Speed } from '../store';
import { money, recentProfit, signedMoney } from '../format';
import { SponsorChip } from './Sponsor';

const SPEEDS: { s: Speed; label: string; title: string }[] = [
  { s: 0, label: '❚❚', title: msg('Duraklat (boşluk)') },
  { s: 1, label: '▶', title: msg('Normal hız (1)') },
  { s: 2, label: '▶▶', title: msg('Hızlı (2)') },
  { s: 3, label: '▶▶▶', title: msg('Çok hızlı (3)') },
];

export function TopBar() {
  const s = useGameState();
  const weekly = recentProfit(s, 4);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ⚙
        </span>
        <span className="brand-name">{s.company.name}</span>
      </div>
      <div className="topbar-date" aria-live="polite">
        {formatDate(s.week)}
      </div>
      <div className="topbar-kpis">
        <div className="kpi" title={t('Kasadaki para')}>
          <span>{t('Kasa')}</span>
          <b className={s.company.cash < 0 ? 'tone-bad' : ''}>{money(s.company.cash)}</b>
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
      <div className="speed" role="group" aria-label={t('Oyun hızı')}>
        {SPEEDS.map((x) => (
          <button
            key={x.s}
            type="button"
            className={`speed-btn ${store.speed === x.s ? 'is-on' : ''}`}
            onClick={() => store.setSpeed(x.s)}
            title={t(x.title)}
            aria-pressed={store.speed === x.s}
            disabled={!!s.gameOver}
          >
            {x.label}
          </button>
        ))}
      </div>
    </header>
  );
}
