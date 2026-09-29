import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { paySponsor, sponsorReward, sponsorWait, yearBonus, yearBonusOpen } from '../../core/sponsor';
import { t } from '../../i18n';
import { AD_POLICY } from '../adPolicy';
import { ads } from '../ads';
import { money } from '../format';
import { store, useGameState } from '../store';
import { Button } from './ui';
import { tx } from '../i18n';

// The advertisements the player sees in the app: a sponsor who pays for a short advertisement
// (asked for, or offered at the year's end), and a classified advertisement in the newspaper.
// Nothing here shows in the browser game (no backend, see src/ui/ads.ts).

async function watchFor(year?: number) {
  const ok = await ads.watch(year === undefined ? 'rewarded' : 'yearEnd');
  if (!ok) {
    store.showToast(t('Reklam yarıda kaldı; sponsor ödemedi.'), 'info');
    return;
  }
  const paid = store.act((s) => paySponsor(s, year));
  if (paid) store.showToast(t('Sponsor desteği: kasaya {cash} girdi.', { cash: money(paid) }), 'good');
}

/** The player may ask for a paid advertisement now. */
function useSponsor() {
  const s = useGameState();
  const open = !s.gameOver && sponsorWait(s) === 0 && ads.ready('rewarded');
  return { open, amount: sponsorReward(s) };
}

/** Top bar: a small button while a sponsor is waiting. */
export function SponsorChip() {
  const { open, amount } = useSponsor();
  if (!open) return null;
  return (
    <button type="button" className="sponsor-chip" onClick={() => void watchFor()} title={t('Kısa bir reklam izle, sponsor kasaya para koysun')}>
      📺 +{money(amount)}
    </button>
  );
}

/** In the cash warnings: the sponsor as one more way out. */
export function SponsorButton() {
  const { open, amount } = useSponsor();
  if (!open) return null;
  return <Button onClick={() => void watchFor()}>📺 {t('Reklam izle, sponsor {cash} versin', { cash: money(amount) })}</Button>;
}

/**
 * The year-end offer in the year card. It counts down and starts by itself now and then (the player
 * can say no before it starts); otherwise, and for players who bought "remove ads", it waits for a tap.
 */
export function YearOffer({ year }: { year: number }) {
  const s = useGameState();
  const [declined, setDeclined] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const available = !declined && yearBonusOpen(s, year) && ads.ready('yearEnd');
  // Decide once per year whether this offer counts down.
  useEffect(() => {
    setDeclined(false);
    setCount(null);
  }, [year]);
  useEffect(() => {
    if (!available || count !== null) return;
    const now = Date.now();
    if (ads.forced && ads.clock.canAutoYearOffer(now)) {
      ads.clock.yearOffered(now);
      setCount(AD_POLICY.countdown);
    }
  }, [available]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (count === null || !available) return;
    if (count <= 0) {
      setCount(null);
      void watchFor(year);
      return;
    }
    const timer = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, available, year]);
  if (!available) return null;
  const amount = yearBonus(s, year);
  const bill = s.company.taxBill?.year === year ? s.company.taxBill.amount : 0;
  return (
    <div className="year-offer">
      <div>
        🎁{' '}
        {bill > 0 && amount >= bill * 0.5
          ? tx('<b>Yıl sonu primi</b>: kısa bir reklam izle, sponsor kasaya <b>{cash}</b> koysun (bu yılın vergisinin yarısı).', { cash: money(amount) })
          : tx('<b>Yıl sonu primi</b>: kısa bir reklam izle, sponsor kasaya <b>{cash}</b> koysun.', { cash: money(amount) })}
      </div>
      <div className="year-offer-actions">
        {count !== null ? (
          <span className="muted small">{t('Reklam {n} sn içinde başlıyor', { n: count })}</span>
        ) : (
          <Button small kind="primary" onClick={() => void watchFor(year)}>
            📺 {t('İzle')}
          </Button>
        )}
        <Button
          small
          kind="ghost"
          onClick={() => {
            setCount(null);
            setDeclined(true);
          }}
        >
          {t('Hayır, teşekkürler')}
        </Button>
      </div>
    </div>
  );
}

/**
 * The newspaper's advertisement: a strip at the foot of the reader that the app draws over with a
 * period-style classified advertisement (a native view, it cannot scroll with the page).
 */
export function PaperAdSlot() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const paper = ads.forced ? ads.backend?.paper : undefined;
  const ready = !!paper?.ready();
  const fake = !!ads.backend?.fake;
  useLayoutEffect(() => {
    if (!paper || (!ready && !shown)) return;
    let alive = true;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      void paper.show({ left: r.left, top: r.top, width: r.width, height: r.height }).then((ok) => alive && setShown(ok));
    };
    place();
    window.addEventListener('resize', place);
    return () => {
      alive = false;
      window.removeEventListener('resize', place);
    };
  }, [paper, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // The paper closes: take the advertisement away.
  useEffect(() => () => paper?.hide(), [paper]);
  if (!paper || (!ready && !shown)) return null;
  return (
    <div className="paper-adslot" ref={ref} aria-label={t('Reklam')}>
      {fake && (
        <div className="paper-adslot-fake">
          <small>{t('REKLAM')}</small>
          {tx('<b>Test ilanı</b> · uygulamada burada gerçek bir reklam görünür')}
        </div>
      )}
    </div>
  );
}

/** Settings: remove the advertisements, get a purchase back, the consent choices. */
export function AdSettings() {
  useGameState();
  const b = ads.backend;
  const [busy, setBusy] = useState(false);
  if (!b) return null;
  const price = b.shop.price();
  const buy = async () => {
    setBusy(true);
    const r = await b.shop.buy();
    setBusy(false);
    if (r === 'bought') store.showToast(t('Teşekkürler! Reklamlar kaldırıldı.'), 'good');
    else if (r === 'failed') store.showToast(t('Satın alma tamamlanamadı. Google Play bağlantısını kontrol edip yeniden dene.'), 'bad');
  };
  const restore = async () => {
    setBusy(true);
    const owned = await b.shop.restore();
    setBusy(false);
    store.showToast(owned ? t('Satın alman geri yüklendi: reklamlar kapalı.') : t('Bu Google hesabında bir satın alma bulunamadı.'), owned ? 'good' : 'info');
  };
  return (
    <>
      {ads.noAds ? (
        <p className="tone-good">✓ {t('Reklamlar kaldırıldı. Desteğin için teşekkürler!')}</p>
      ) : (
        <p>
          <Button kind="primary" disabled={busy} onClick={() => void buy()}>
            {price ? t('Reklamları kaldır ({price})', { price }) : t('Reklamları kaldır')}
          </Button>
        </p>
      )}
      <p className="muted small">
        {t(
          'Tek seferlik satın alma. Geçiş reklamları, yıl sonunda kendiliğinden başlayan reklam ve gazete ilanı kalkar. Sponsor parası için reklamı istersen yine izleyebilirsin.',
        )}
      </p>
      <p>
        <Button small kind="ghost" disabled={busy} onClick={() => void restore()}>
          {t('Satın alımı geri yükle')}
        </Button>
        {b.privacy.required() && (
          <Button small kind="ghost" onClick={() => void b.privacy.show()}>
            {t('Reklam gizlilik seçenekleri')}
          </Button>
        )}
      </p>
    </>
  );
}
