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
import { store } from '../store';
import { kmh, litres, money, num, pct, secs } from '../format';
import { Button, ScoreBar } from './ui';
import { CarSVG } from '../viz/CarSVG';

type Stage = 'reveal' | 'reviews' | 'rivals';

function verdict(avg: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (avg >= 8) return { label: 'Övgü yağmuru', tone: 'good' };
  if (avg >= 6.5) return { label: 'Olumlu karşılandı', tone: 'good' };
  if (avg >= 5) return { label: 'Karışık tepkiler', tone: 'warn' };
  return { label: 'Hayal kırıklığı', tone: 'bad' };
}

function crowd(avg: number, hype: number): string {
  if (avg >= 7.5) return 'Kalabalık standın önünden ayrılmıyor; gazeteciler not almaya yetişemiyor.';
  if (avg >= 6) return hype > 5 ? 'Ziyaretçiler aracın etrafını sarıyor.' : 'Ziyaretçiler ilgiyle inceliyor.';
  if (avg >= 4.5) return 'Birkaç meraklı durup bakıyor, sonra yoluna devam ediyor.';
  return 'Gazeteciler hızla bir sonraki standa geçiyor.';
}

export function LaunchShow({ s, modelId, venue, facelift }: { s: GameState; modelId: string; venue: string; facelift?: boolean }) {
  const m = s.models.find((x) => x.id === modelId);
  const [stage, setStage] = useState<Stage>('reveal');
  const [shown, setShown] = useState(0);
  const [showCrowd, setShowCrowd] = useState(false);
  const [market, setMarket] = useState<MarketId>(m ? mainMarket(s, m) : s.company.hq);

  useEffect(() => {
    const t = setTimeout(() => setShowCrowd(true), 1400);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (stage !== 'reviews' || !m || shown >= m.reviews.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 400 : 1100);
    return () => clearTimeout(t);
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
          {m.name}
          {facelift ? ' (makyajlı)' : ''} <span className="muted small">· {segmentDef(m.segment).name}</span>
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
                Dergiler ne diyor? →
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
                    <span className={`review-score ${r.score >= 7 ? 'tone-good' : r.score < 5 ? 'tone-bad' : ''}`}>{i < shown ? r.score.toFixed(1) : '?'}</span>
                  </header>
                  <p>“{r.quote}”</p>
                </article>
              ))}
            </div>
            <div className={`launch-verdict tone-${v.tone} ${allShown ? 'is-in' : ''}`}>
              <span className="launch-avg">{m.reviewScore.toFixed(1)}</span>
              <span>
                <b>{v.label}</b>
                <br />
                <span className="muted small">Dergi ortalaması / 10</span>
              </span>
            </div>
            <div className="modal-actions">
              {!allShown && (
                <Button kind="ghost" onClick={() => setShown(m.reviews.length)}>
                  Hepsini göster
                </Button>
              )}
              <Button kind="primary" disabled={!allShown} onClick={() => setStage('rivals')}>
                Rakiplerle karşılaştır →
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
                    {MARKETS.find((x) => x.id === mk)!.flag} {MARKETS.find((x) => x.id === mk)!.name}
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
                Modele git
              </Button>
              <Button kind="primary" onClick={close}>
                Satışlar başlasın
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
  return { power: `${st.engine.powerHp.toFixed(0)} bg`, top: kmh(st.topSpeed), accel: secs(a.value), accelLabel: a.label, fuel: litres(st.fuel) };
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
          <span className="muted small">Segmentteki sıran</span>
          <b className="rival-rank">
            {rank ? `${rank}.` : '—'} <span className="muted small">/ {rows.length}</span>
          </b>
          {named === 0 && <span className="muted small">Henüz büyük rakip yok</span>}
        </div>
        <div>
          <span className="muted small">Tahmini pay</span>
          <b>{mine ? pct(mine.weight / sm.totalWeight) : '—'}</b>
        </div>
        <div>
          <span className="muted small">
            Segment büyüklüğü ({MARKETS.find((x) => x.id === market)!.name})
          </span>
          <b>{num(sm.demand * 52)} araç/yıl</b>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table compact rival-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Çekicilik</th>
              <th className="al-r">Pay</th>
              <th className="al-r">Alıcı fiyatı</th>
              <th className="al-r">Güç</th>
              <th className="al-r">Son hız</th>
              <th className="al-r">{accelLabel}</th>
              <th className="al-r">Tüketim</th>
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
                    <span className="small">{o.appeal.toFixed(0)}</span>
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
                <b>Küçük üreticiler</b>
                <br />
                <span className="muted small">Onlarca atölye · tipik araç</span>
              </td>
              <td className="rival-appeal">
                <ScoreBar value={50} />
                <span className="small">≈50</span>
              </td>
              <td className="al-r">{pct(sm.othersWeight / sm.totalWeight)}</td>
              <td className="al-r">~{money(referencePrice(market, m.segment, yf))}</td>
              <td className="al-r">{ref.powerHp.toFixed(0)} bg</td>
              <td className="al-r">{kmh(ref.topSpeed)}</td>
              <td className="al-r">{secs(ref.accel100 ?? ref.accel50)}</td>
              <td className="al-r">{litres(ref.fuel)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="rival-verdict">
        <div>
          <h4>{rivals.length ? 'Rakiplerden iyi olduğun yerler' : 'Sınıf ortalamasından iyi olduğun yerler'}</h4>
          {strong.length ? (
            <ul>
              {strong.map((x) => (
                <li key={x.k} className="tone-good">
                  {ATTR_NAMES[x.k]} (+{Math.round(x.d)})
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Belirgin bir üstünlük yok.</p>
          )}
        </div>
        <div>
          <h4>{rivals.length ? 'Geride kaldığın yerler' : 'Ortalamanın gerisinde kaldığın yerler'}</h4>
          {weak.length ? (
            <ul>
              {weak.map((x) => (
                <li key={x.k} className="tone-bad">
                  {ATTR_NAMES[x.k]} ({Math.round(x.d)})
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Belirgin bir zaafın yok.</p>
          )}
        </div>
      </div>
      <p className="muted small rival-note">
        Çekicilik, alıcıların bu segmentte neye ne kadar önem verdiğine göre hesaplanır; pay ise fiyat, marka ve bayi erişimiyle birlikte belirlenir. Pay, üretebildiğin
        kadar satışa dönüşür.
      </p>
    </div>
  );
}

export function LaunchReportView({ s, modelId, report: r }: { s: GameState; modelId: string; report: LaunchReport }) {
  const m = s.models.find((x) => x.id === modelId);
  if (!m) return null;
  const close = () => store.act(A.dismissModal);
  const headline =
    r.capacity < 0.05
      ? 'Üretim durmuş'
      : r.rank === 1
        ? 'Segmentinin lideri!'
        : r.rank <= 3 && r.rank > 0
          ? 'Güçlü bir başlangıç'
          : r.demand > r.capacity * 1.3
            ? 'Bayilerde kuyruk var'
            : 'Zorlu bir başlangıç';
  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <div className="launch-venue">İlk ay raporu</div>
        <h2 id="report-title">
          {m.name}: {headline}
        </h2>
        <div className="report-grid">
          <div>
            <span>İlk {r.weeks} haftada satış</span>
            <b>{num(r.sold)} araç</b>
          </div>
          <div>
            <span>Haftalık talep</span>
            <b>{r.demand.toFixed(1)}</b>
          </div>
          <div>
            <span>Haftalık üretim</span>
            <b>{r.capacity.toFixed(1)}</b>
          </div>
          <div>
            <span>
              {MARKETS.find((x) => x.id === r.market)!.flag} Segmentteki sıra
            </span>
            <b>
              {r.rank > 0 ? `${r.rank}. / ${r.offers}` : '—'}
            </b>
          </div>
          <div>
            <span>Segment payı</span>
            <b>{pct(r.share)}</b>
          </div>
          <div>
            <span>Fiyat algısı</span>
            <b className={r.price === 'high' ? 'tone-bad' : r.price === 'low' ? 'tone-good' : ''}>{r.price === 'high' ? 'Pahalı' : r.price === 'low' ? 'Çok uygun' : 'Makul'}</b>
          </div>
        </div>
        <div className="rival-verdict">
          <div>
            <h4>{segmentDef(m.segment).buyers} neyi sevdi?</h4>
            {r.praise.length ? (
              <ul>
                {r.praise.map((k) => (
                  <li key={k} className="tone-good">
                    {ATTR_NAMES[k]}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Kimseyi heyecanlandıran bir yanı olmadı.</p>
            )}
          </div>
          <div>
            <h4>Neden şikâyet etti?</h4>
            {r.complaints.length ? (
              <ul>
                {r.complaints.map((k) => (
                  <li key={k} className="tone-bad">
                    {ATTR_NAMES[k]}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Ciddi bir şikâyet yok.</p>
            )}
          </div>
        </div>
        {r.advice.length > 0 && (
          <>
            <h4>Satış müdürünün notları</h4>
            <ul className="advice">
              {r.advice.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        )}
        <p className="muted small">Bu yorumlar segment bilgisi tablona işlendi.</p>
        <div className="modal-actions">
          <Button
            kind="ghost"
            onClick={() => {
              store.act(A.dismissModal);
              store.go({ id: 'model', modelId: m.id });
            }}
          >
            Modele git
          </Button>
          <Button kind="primary" onClick={close}>
            Tamam
          </Button>
        </div>
      </div>
    </div>
  );
}
