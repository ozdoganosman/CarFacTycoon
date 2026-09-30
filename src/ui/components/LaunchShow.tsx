import { useEffect, useState } from 'react';
import * as A from '../../core/actions';
import { mainMarket } from '../../core/feedback';
import { modelScores, referencePrice, rivalScores, segmentMarket } from '../../core/market';
import { accelMetric, eraReference } from '../../core/scoring';
import { yearFloat } from '../../core/time';
import { MARKETS } from '../../data/markets';
import { RIVALS } from '../../data/rivals';
import { ATTRS, ATTR_NAMES, segmentDef } from '../../data/segments';
import type { AttrKey, CarStats, GameState, LaunchReport, MarketId } from '../../core/types';
import { t } from '../../i18n';
import { ads } from '../ads';
import { store } from '../store';
import { dec, kmh, litres, money, num, pct, secs } from '../format';
import { Button, ScoreBar } from './ui';
import { CarSVG } from '../viz/CarSVG';

type Stage = 'reveal' | 'reviews' | 'rivals';

function verdict(avg: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (avg >= 8) return { label: t('Övgü yağmuru'), tone: 'good' };
  if (avg >= 6.5) return { label: t('Olumlu karşılandı'), tone: 'good' };
  if (avg >= 5) return { label: t('Karışık tepkiler'), tone: 'warn' };
  return { label: t('Hayal kırıklığı'), tone: 'bad' };
}

function crowd(avg: number, hype: number): string {
  if (avg >= 7.5) return t('Kalabalık standın önünden ayrılmıyor; gazeteciler not almaya yetişemiyor.');
  if (avg >= 6) return hype > 5 ? t('Ziyaretçiler aracın etrafını sarıyor.') : t('Ziyaretçiler ilgiyle inceliyor.');
  if (avg >= 4.5) return t('Birkaç meraklı durup bakıyor, sonra yoluna devam ediyor.');
  return t('Gazeteciler hızla bir sonraki standa geçiyor.');
}

export function LaunchShow({ s, modelId, venue, facelift }: { s: GameState; modelId: string; venue: string; facelift?: boolean }) {
  const m = s.models.find((x) => x.id === modelId);
  const [stage, setStage] = useState<Stage>('reveal');
  const [shown, setShown] = useState(0);
  const [showCrowd, setShowCrowd] = useState(false);
  const [market, setMarket] = useState<MarketId>(m ? mainMarket(s, m) : s.company.hq);

  useEffect(() => {
    const timer = setTimeout(() => setShowCrowd(true), 1400);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (stage !== 'reviews' || !m || shown >= m.reviews.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 400 : 1100);
    return () => clearTimeout(timer);
  }, [stage, shown, m]);

  if (!m) return null;
  const close = () => store.act(A.dismissModal);
  const v = verdict(m.reviewScore);
  const allShown = shown >= m.reviews.length;

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide launch" role="dialog" aria-modal="true" aria-labelledby="launch-title">
        <div className="launch-venue">{venue}</div>
        <h2 id="launch-title">
          {facelift ? t('{name} (makyajlı)', { name: m.name }) : m.name} <span className="muted small">· {t(segmentDef(m.segment).name)}</span>
        </h2>

        {stage === 'reveal' && (
          <>
            <div className="launch-stage">
              <div className="launch-spot" />
              <CarSVG body={m.design.body} size={m.design.size} year={yearFloat(s.week)} cylinders={m.design.engine.cylinders} styling={m.design.styling} className="launch-car" />
              <div className="curtain curtain-l" />
              <div className="curtain curtain-r" />
            </div>
            <p className={`launch-crowd ${showCrowd ? 'is-in' : ''}`}>{crowd(m.reviewScore, m.hype)}</p>
            <div className="modal-actions">
              <Button kind="primary" onClick={() => setStage('reviews')}>
                {t('Dergiler ne diyor?')} →
              </Button>
            </div>
          </>
        )}

        {stage === 'reviews' && (
          <>
            <div className="reviews">
              {m.reviews.map((r, i) => (
                <article key={r.magazine} className={`review review-reveal ${i < shown ? 'is-in' : ''}`} aria-hidden={i >= shown}>
                  <header>
                    <span className="review-mag">{r.magazine}</span>
                    <span className={`review-score ${r.score >= 7 ? 'tone-good' : r.score < 5 ? 'tone-bad' : ''}`}>{i < shown ? dec(r.score) : '?'}</span>
                  </header>
                  <p>“{r.quote}”</p>
                </article>
              ))}
            </div>
            <div className={`launch-verdict tone-${v.tone} ${allShown ? 'is-in' : ''}`}>
              <span className="launch-avg">{dec(m.reviewScore)}</span>
              <span>
                <b>{v.label}</b>
                <br />
                <span className="muted small">{t('Dergi ortalaması / 10')}</span>
              </span>
            </div>
            <div className="modal-actions">
              {!allShown && (
                <Button kind="ghost" onClick={() => setShown(m.reviews.length)}>
                  {t('Hepsini göster')}
                </Button>
              )}
              <Button kind="primary" disabled={!allShown} onClick={() => setStage('rivals')}>
                {t('Rakiplerle karşılaştır')} →
              </Button>
            </div>
          </>
        )}

        {stage === 'rivals' && (
          <>
            {m.markets.length > 1 && (
              <div className="seg-toggle">
                {m.markets.map((mk) => (
                  <button key={mk} type="button" className={`chip ${market === mk ? 'is-on' : ''}`} onClick={() => setMarket(mk)}>
                    {MARKETS.find((x) => x.id === mk)!.flag} {t(MARKETS.find((x) => x.id === mk)!.name)}
                  </button>
                ))}
              </div>
            )}
            <RivalComparison s={s} modelId={m.id} market={market} />
            <div className="modal-actions">
              <Button
                kind="ghost"
                onClick={() => {
                  store.act(A.dismissModal);
                  store.go({ id: 'model', modelId: m.id });
                }}
              >
                {t('Modele git')}
              </Button>
              <Button kind="primary" onClick={close}>
                {t('Satışlar başlasın')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function specCells(st: CarStats, yf: number, seg: Parameters<typeof eraReference>[1]) {
  const a = accelMetric(st, eraReference(yf, seg));
  return { power: t('{v} bg', { v: dec(st.engine.powerHp, 0) }), top: kmh(st.topSpeed), accel: secs(a.value), accelLabel: a.label, fuel: litres(st.fuel) };
}

/** Our car next to every rival in the segment, as buyers see them today. */
export function RivalComparison({ s, modelId, market }: { s: GameState; modelId: string; market: MarketId }) {
  const m = s.models.find((x) => x.id === modelId)!;
  const yf = yearFloat(s.week);
  const sm = segmentMarket(s, market, m.segment);
  const rows = [...sm.offers].sort((a, b) => b.weight - a.weight);
  const rank = rows.findIndex((o) => o.id === m.id) + 1;
  const mine = rows.find((o) => o.id === m.id);
  const myScores = modelScores(s, m).scores;
  const rivals = s.rivalModels.filter((r) => r.active && r.segment === m.segment && r.markets.includes(market));
  const avg = (k: AttrKey) => (rivals.length ? rivals.reduce((a, r) => a + rivalScores(s, r).scores[k], 0) / rivals.length : 50);
  const diffs = ATTRS.map((k) => ({ k, d: myScores[k] - avg(k) })).sort((a, b) => b.d - a.d);
  const strong = diffs.filter((x) => x.d > 5).slice(0, 3);
  const weak = diffs.filter((x) => x.d < -5).slice(-3).reverse();
  const accelLabel = specCells(m.stats, yf, m.segment).accelLabel;
  // The small makers are shown as the typical car of the class (the 50-point yardstick).
  const ref = eraReference(yf, m.segment);
  const named = rows.length - 1;
  return (
    <div className="rivals">
      <div className="rival-head">
        <div>
          <span className="muted small">{t('Segmentteki sıran')}</span>
          <b className="rival-rank">
            {rank ? t('{rank}.', { rank }) : '—'} <span className="muted small">/ {rows.length}</span>
          </b>
          {named === 0 && <span className="muted small">{t('Henüz büyük rakip yok')}</span>}
        </div>
        <div>
          <span className="muted small">{t('Tahmini pay')}</span>
          <b>{mine ? pct(mine.weight / sm.totalWeight) : '—'}</b>
        </div>
        <div>
          <span className="muted small">{t('Segment büyüklüğü ({market})', { market: t(MARKETS.find((x) => x.id === market)!.name) })}</span>
          <b>{t('{count} araç/yıl', { count: num(sm.demand * 52) })}</b>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table compact rival-table">
          <thead>
            <tr>
              <th>{t('Model')}</th>
              <th>{t('Çekicilik')}</th>
              <th className="al-r">{t('Pay')}</th>
              <th className="al-r">{t('Alıcı fiyatı')}</th>
              <th className="al-r">{t('Güç')}</th>
              <th className="al-r">{t('Son hız')}</th>
              <th className="al-r">{accelLabel}</th>
              <th className="al-r">{t('Tüketim')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const st = o.kind === 'player' ? (s.models.find((x) => x.id === o.id)?.stats ?? m.stats) : s.rivalModels.find((r) => r.id === o.id)!.stats;
              const c = specCells(st, yf, m.segment);
              return (
                <tr key={o.id} className={o.kind === 'player' ? 'is-mine' : ''}>
                  <td>
                    <b>{o.name}</b>
                    <br />
                    <span className="muted small">{o.kind === 'player' ? s.company.name : RIVALS.find((r) => r.id === o.companyId)?.name}</span>
                  </td>
                  <td className="rival-appeal">
                    <ScoreBar value={o.appeal} />
                    <span className="small">{dec(o.appeal, 0)}</span>
                  </td>
                  <td className="al-r">{pct(o.weight / sm.totalWeight)}</td>
                  <td className="al-r">{money(o.price)}</td>
                  <td className="al-r">{c.power}</td>
                  <td className="al-r">{c.top}</td>
                  <td className="al-r">{c.accel}</td>
                  <td className="al-r">{c.fuel}</td>
                </tr>
              );
            })}
            <tr className="rival-others">
              <td>
                <b>{t('Küçük üreticiler')}</b>
                <br />
                <span className="muted small">{t('Onlarca atölye · tipik araç')}</span>
              </td>
              <td className="rival-appeal">
                <ScoreBar value={50} />
                <span className="small">≈50</span>
              </td>
              <td className="al-r">{pct(sm.othersWeight / sm.totalWeight)}</td>
              <td className="al-r">~{money(referencePrice(market, m.segment, yf))}</td>
              <td className="al-r">{t('{v} bg', { v: dec(ref.powerHp, 0) })}</td>
              <td className="al-r">{kmh(ref.topSpeed)}</td>
              <td className="al-r">{secs(ref.accel100 ?? ref.accel50)}</td>
              <td className="al-r">{litres(ref.fuel)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="rival-verdict">
        <div>
          <h4>{rivals.length ? t('Rakiplerden iyi olduğun yerler') : t('Sınıf ortalamasından iyi olduğun yerler')}</h4>
          {strong.length ? (
            <ul>
              {strong.map((x) => (
                <li key={x.k} className="tone-good">
                  {t(ATTR_NAMES[x.k])} (+{Math.round(x.d)})
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">{t('Belirgin bir üstünlük yok.')}</p>
          )}
        </div>
        <div>
          <h4>{rivals.length ? t('Geride kaldığın yerler') : t('Ortalamanın gerisinde kaldığın yerler')}</h4>
          {weak.length ? (
            <ul>
              {weak.map((x) => (
                <li key={x.k} className="tone-bad">
                  {t(ATTR_NAMES[x.k])} ({Math.round(x.d)})
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">{t('Belirgin bir zaafın yok.')}</p>
          )}
        </div>
      </div>
      <p className="muted small rival-note">
        {t(
          'Çekicilik, alıcıların bu segmentte neye ne kadar önem verdiğine göre hesaplanır; pay ise fiyat, marka ve bayi erişimiyle birlikte belirlenir. Pay, üretebildiğin kadar satışa dönüşür.',
        )}
      </p>
    </div>
  );
}

export function LaunchReportView({ s, modelId, report: r }: { s: GameState; modelId: string; report: LaunchReport }) {
  const m = s.models.find((x) => x.id === modelId);
  if (!m) return null;
  // The launch is over: a natural break for an advertisement (src/ui/ads.ts decides).
  const close = () => {
    store.act(A.dismissModal);
    void ads.breakpoint();
  };
  // "Leader" is judged as on the Company screen (rivalMoves.ts leadsClass); older reports by rank.
  const leads = r.leads ?? r.rank === 1;
  const headline =
    r.capacity < 0.05
      ? t('Üretim durmuş')
      : leads
        ? t('Segmentinin lideri!')
        : r.rank <= 3 && r.rank > 0
          ? t('Güçlü bir başlangıç')
          : r.demand > r.capacity * 1.3
            ? t('Bayilerde kuyruk var')
            : t('Zorlu bir başlangıç');
  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <div className="launch-venue">{t('İlk ay raporu')}</div>
        <h2 id="report-title">
          {m.name}: {headline}
        </h2>
        <div className="report-grid">
          <div>
            <span>{t('İlk {n} haftada satış', { n: r.weeks })}</span>
            <b>{t('{count} araç', { count: num(r.sold) })}</b>
          </div>
          <div>
            <span>{t('Haftalık talep')}</span>
            <b>{dec(r.demand)}</b>
          </div>
          <div>
            <span>{t('Haftalık üretim')}</span>
            <b>{dec(r.capacity)}</b>
          </div>
          <div>
            <span>
              {MARKETS.find((x) => x.id === r.market)!.flag} {t('Segmentteki sıra')}
            </span>
            <b>
              {r.rank > 0 ? `${t('{rank}.', { rank: r.rank })} / ${r.offers}` : '—'}
            </b>
          </div>
          <div>
            <span>{t('Segment payı')}</span>
            <b>{pct(r.share)}</b>
          </div>
          <div>
            <span>{t('Fiyat algısı')}</span>
            <b className={r.price === 'high' ? 'tone-bad' : r.price === 'low' ? 'tone-good' : ''}>{r.price === 'high' ? t('Pahalı') : r.price === 'low' ? t('Çok uygun') : t('Makul')}</b>
          </div>
        </div>
        <div className="rival-verdict">
          <div>
            <h4>{t('{buyers} neyi sevdi?', { buyers: t(segmentDef(m.segment).buyers) })}</h4>
            {r.praise.length ? (
              <ul>
                {r.praise.map((k) => (
                  <li key={k} className="tone-good">
                    {t(ATTR_NAMES[k])}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">{t('Kimseyi heyecanlandıran bir yanı olmadı.')}</p>
            )}
          </div>
          <div>
            <h4>{t('Neden şikâyet etti?')}</h4>
            {r.complaints.length ? (
              <ul>
                {r.complaints.map((k) => (
                  <li key={k} className="tone-bad">
                    {t(ATTR_NAMES[k])}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">{t('Ciddi bir şikâyet yok.')}</p>
            )}
          </div>
        </div>
        {r.advice.length > 0 && (
          <>
            <h4>{t('Satış müdürünün notları')}</h4>
            <ul className="advice">
              {r.advice.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        )}
        <p className="muted small">{t('Bu yorumlar segment bilgisi tablona işlendi.')}</p>
        <div className="modal-actions">
          <Button
            kind="ghost"
            onClick={() => {
              store.act(A.dismissModal);
              store.go({ id: 'model', modelId: m.id });
            }}
          >
            {t('Modele git')}
          </Button>
          <Button kind="primary" onClick={close}>
            {t('Tamam')}
          </Button>
        </div>
      </div>
    </div>
  );
}
