import { useState } from 'react';
import * as A from '../../core/actions';
import { AUTO_HOLD_TEXT } from '../../core/autocap';
import { materialUnitCost } from '../../core/game';
import { lineReport } from '../../core/factory';
import { consumerPrice, demandAtPrice, modelScores, priceNow, segmentMarket } from '../../core/market';
import { scoreStats } from '../../core/scoring';
import { AREA_NAMES, SEVERITY_NAMES, defectText } from '../../core/testing';
import { formatDate, formatShort, yearFloat } from '../../core/time';
import { MARKETS } from '../../data/markets';
import { RIVALS } from '../../data/rivals';
import { segmentDef } from '../../data/segments';
import { priceLevel } from '../../data/economy';
import type { CarModel, MarketId } from '../../core/types';
import { store, useGameState } from '../store';
import { customerLetters } from '../../core/letters';
import { money, num, pct } from '../format';
import { Badge, Button, Empty, NumberInput, Panel, Slider, Stat, Table, Toggle, ScoreBar, Info } from '../components/ui';
import { StatsPanel } from '../components/StatsPanel';
import { CarSVG } from '../viz/CarSVG';
import { LineChart } from '../viz/LineChart';
import { weeklySold } from './HQ';

export function ModelView({ modelId }: { modelId: string }) {
  const s = useGameState();
  const m = s.models.find((x) => x.id === modelId)!;
  const yf = yearFloat(s.week);
  const active = m.status === 'active';
  const [market, setMarket] = useState<MarketId>(m.markets.includes(s.company.hq) ? s.company.hq : m.markets[0] ?? s.company.hq);
  const [draftPrice, setDraftPrice] = useState(Math.round(priceNow(m, s.week)));
  const lines = s.lines.filter((l) => l.modelId === m.id);
  const cap = lines.reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
  const demand = Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
  const history = m.history.slice(-104);
  const age = (s.week - m.refreshWeek) / 52;
  const hasFacelift = s.projects.some((p) => p.replacesModelId === m.id);
  const { scores } = modelScores(s, m);

  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <button type="button" className="link small" onClick={() => store.go({ id: 'models' })}>
            ← Modeller
          </button>
          <h1>
            {m.name} {m.generation > 1 && <span className="muted">({m.generation}. kuşak)</span>}
          </h1>
          <p className="muted">
            {segmentDef(m.segment).icon} {segmentDef(m.segment).name} · çıkış {formatDate(m.launchWeek)}
            {m.faceliftCount ? ` · ${m.faceliftCount} makyaj` : ''} · {active ? `${age.toFixed(1)} yaşında` : 'üretimden kalktı'}
          </p>
        </div>
        {active && (
          <div className="head-actions">
            <Button
              disabled={hasFacelift}
              title="Kısa bir proje: tasarım, donanım ve ayar güncellemesi"
              onClick={() => {
                const r = store.act((st) => A.startFacelift(st, m.id));
                if (r?.ok) store.go({ id: 'project', projectId: r.id });
                else if (r) store.showToast(r.error, 'bad');
              }}
            >
              Makyaj yap
            </Button>
            <Button
              disabled={hasFacelift}
              onClick={() => {
                const r = store.act((st) =>
                  A.startProject(st, { name: m.name, segment: m.segment, targetPrice: priceNow(m, st.week), replacesModelId: m.id, platformId: st.company.modelsLaunched >= 2 ? m.platformId : undefined }),
                );
                if (r?.ok) store.go({ id: 'project', projectId: r.id });
                else if (r) store.showToast(r.error, 'bad');
              }}
            >
              Yeni kuşak tasarla
            </Button>
            <Button
              kind="danger"
              onClick={async () => {
                const ok = await store.ask({
                  title: `${m.name} üretimden kaldırılsın mı?`,
                  body: 'Kalan stok bayilerde indirimle satılır ve hatlar boşa çıkar.',
                  confirm: 'Üretimden kaldır',
                  danger: true,
                });
                if (ok) store.act((st) => A.retireModel(st, m.id));
              }}
            >
              Üretimden kaldır
            </Button>
          </div>
        )}
      </div>

      <div className="stats-row">
        <Stat label="Haftalık satış" value={weeklySold(m).toFixed(1)} sub={`talep ${demand.toFixed(1)}`} />
        <Stat label="Stok" value={num(m.inventory)} tone={m.inventory > demand * 12 && m.inventory > 10 ? 'warn' : undefined} />
        <Stat label="Toplam satış" value={num(m.unitsSold)} sub={money(m.revenueTotal)} />
        <Stat label="Dergi ortalaması" value={m.reviewScore.toFixed(1)} sub="/ 10" />
        <Stat label="Güvenilirlik (alıcı gözünde)" value={Math.round(scores.reliability)} sub="sınıf ort. 50" tone={scores.reliability < 40 ? 'bad' : undefined} />
      </div>

      <div className="grid-2">
        <Panel title="Satışlar">
          <LineChart
            series={[
              { id: 'sold', name: 'Satılan', color: 'var(--series-1)', points: history.map((h) => ({ x: h.week, y: h.sold })) },
              { id: 'built', name: 'Üretilen', color: 'var(--series-2)', points: history.map((h) => ({ x: h.week, y: h.built })), dashed: true },
            ]}
            height={200}
            xFormat={(w) => formatShort(Math.round(w))}
            yFormat={(v) => v.toFixed(v < 10 ? 1 : 0)}
            yLabel="Araç / hafta"
            ariaLabel={`${m.name} haftalık satış ve üretim grafiği`}
          />
          {active && (
            <>
              <Toggle
                checked={!!m.autoCapacity}
                onChange={(v) => store.act((st) => A.setModelAutoCapacity(st, m.id, v))}
                label="Talebi otomatik karşıla"
                sub={
                  <>
                    Açıkken fabrika, alıcılar beklediği sürece darboğaza istasyon ekler, hattı genişletir ya da yeni hat kurar; talep düşerse üretimi kısar, uzun süre boş kalan
                    hattı satar. Kasada her zaman birkaç haftalık gider kadar yedek bırakır.
                    {(m.autoSpent ?? 0) !== 0 && (
                      <>
                        {' '}
                        <b>Bu model için şimdiye kadar net {money(m.autoSpent ?? 0)} harcadı.</b> Harcamalar Finans’ta ayrı satırda görünür.
                      </>
                    )}
                    {m.autoCapacity && m.autoHold && (
                      <span className="tone-warn">
                        {' '}
                        Alıcılar bekliyor ama büyütmüyor: {AUTO_HOLD_TEXT[m.autoHold]}.{m.autoHint && <b> Çıkış yolu: {m.autoHint}.</b>}
                      </span>
                    )}
                  </>
                }
              />
              <Slider
                label="Üretim hızı"
                value={Math.round(m.productionRate * 100)}
                min={0}
                max={100}
                step={5}
                disabled={!!m.autoCapacity}
                onChange={(v) => store.act((st) => A.setProductionRate(st, m.id, v / 100))}
                format={(v) => `%${v} · ${((cap * v) / 100).toFixed(1)} araç/hafta`}
                hint="Talep düşükse üretimi kıs: stok bekletmek para bağlar ve depolama masrafı çıkarır."
              />
              <p className="small">
                Hatlar: {lines.length ? lines.map((l) => l.name).join(', ') : <span className="tone-bad">hiçbir hatta üretilmiyor</span>}{' '}
                <Button small kind="ghost" onClick={() => store.go({ id: 'factory' })}>
                  Fabrika
                </Button>
              </p>
            </>
          )}
        </Panel>

        {active ? (
          <Panel title="Fiyat ve pazarlar">
            <div className="price-row">
              <NumberInput label="Fabrika çıkış fiyatı" prefix="$" value={draftPrice} min={1} step={10} onChange={setDraftPrice} />
              <Button kind="primary" small onClick={() => store.act((st) => A.setModelPrice(st, m.id, draftPrice))}>
                Uygula
              </Button>
            </div>
            <p className="muted small">
              Şu anki fiyat {money(priceNow(m, s.week))} · birim malzeme {money(materialUnitCost(s, m))}
            </p>
            {(s.week - m.launchWeek) / 52 < 3 && m.priceCeiling !== undefined && draftPrice > m.priceCeiling * priceLevel(yearFloat(s.week)) * (1 + A.HIKE_TOLERANCE) && (
              <p className="small tone-warn">
                Bu, lansmandan beri en yüksek fiyatına göre %{Math.round(A.HIKE_TOLERANCE * 100)}’den büyük bir zam (enflasyon hariç). Basın bunu fark eder: dergiler puanı yeniden
                yazar, lansman heyecanı söner, itibar düşer.
              </p>
            )}
            <Toggle
              checked={m.indexPrice}
              onChange={(v) => store.act(() => void (m.indexPrice = v))}
              label="Fiyatı enflasyona endeksle"
              sub="Açıkken fiyat genel fiyat seviyesiyle birlikte güncellenir."
            />
            {MARKETS.map((mk) => {
              const open = s.markets[mk.id].unlocked;
              const on = m.markets.includes(mk.id);
              const cp = consumerPrice(draftPrice, mk.id, mk.id !== s.company.hq, m.stats, yf);
              const d = open ? demandAtPrice(s, m, mk.id, draftPrice) : 0;
              return (
                <Toggle
                  key={mk.id}
                  checked={on}
                  disabled={!open}
                  onChange={(v) => store.act((st) => A.setModelMarkets(st, m.id, v ? [...m.markets, mk.id] : m.markets.filter((x) => x !== mk.id)))}
                  label={`${mk.flag} ${mk.name}`}
                  sub={open ? `Alıcıya ${money(cp.total)} · bu fiyatla talep ~${d.toFixed(1)}/hafta` : 'Henüz açılmadı'}
                />
              );
            })}
          </Panel>
        ) : (
          <Panel title="Model geçmişi">
            <p>
              {formatDate(m.launchWeek)} – {m.retiredWeek !== undefined ? formatDate(m.retiredWeek) : ''} arasında {num(m.unitsSold)} araç satıldı.
            </p>
          </Panel>
        )}
      </div>

      {active && m.markets.length > 0 && <Competition modelId={m.id} market={market} setMarket={setMarket} />}

      <div className="grid-2">
        <Panel title="Araç">
          <CarSVG body={m.design.body} size={m.design.size} year={yearFloat(m.refreshWeek)} cylinders={m.design.engine.cylinders} styling={m.design.styling} />
          <StatsPanel s={s} design={m.design} segment={m.segment} yf={yf} bonus={m.bonus} scores={scores} compact />
          <p className="muted small">Puanlar bugünün sınıf ortalamasına göre. Model yaşlandıkça rakipler gelişir ve puanlar düşer.</p>
        </Panel>
        <div>
          <Panel title="Dergiler">
            {m.reviews.length ? (
              <div className="reviews reviews-compact">
                {m.reviews.map((r) => (
                  <article key={r.magazine} className="review">
                    <header>
                      <span className="review-mag">{r.magazine}</span>
                      <span className="review-score">{r.score.toFixed(1)}</span>
                    </header>
                    <p>“{r.quote}”</p>
                  </article>
                ))}
              </div>
            ) : (
              <Empty>Değerlendirme yok.</Empty>
            )}
          </Panel>
          {m.status === 'active' && m.unitsSold > 0 && (
            <Panel title="Müşteri mektupları">
              <OwnerLetters s={s} m={m} />
            </Panel>
          )}
          <Panel title="Sahadaki kalite">
            <div className="quote">
              <div>
                <span>Test süresi</span>
                <b>{m.testWeeks} hafta</b>
              </div>
              <div>
                <span>Sahadaki arızalar</span>
                <b>{num(m.fieldFailures)}</b>
              </div>
              <div>
                <span>Garanti masrafı</span>
                <b>{money(m.warrantyCost)}</b>
              </div>
              <div>
                <span>
                  Güvenilirlik: alıcı gözünde / gerçekte
                  <Info>
                    <p>İkisi de aynı ölçekte: 50 sınıfın ortalaması.</p>
                    <p>Alıcılar arabayı önce ününe göre tartar; sahada arıza gördükçe ya da yıllarca sorunsuz kullandıkça görüşleri mühendislerin ölçtüğü gerçek değere yaklaşır. Arızalar ve geri çağırmalar algıyı ayrıca düşürür.</p>
                  </Info>
                </span>
                <b>
                  {Math.round(scores.reliability)} / {Math.round(scoreStats(m.stats, yf, m.segment).reliability)}
                </b>
              </div>
            </div>
            {m.defects.filter((d) => d.surfaced).length > 0 && (
              <ul className="defects">
                {m.defects
                  .filter((d) => d.surfaced)
                  .map((d) => (
                    <li key={d.id}>
                      <Badge tone={d.fixed ? 'good' : d.ignored ? 'bad' : 'warn'}>{d.fixed ? 'Giderildi' : d.ignored ? 'Gizlendi' : 'Açık'}</Badge> {SEVERITY_NAMES[d.severity]}{' '}
                      {AREA_NAMES[d.area].toLowerCase()} kusuru: {defectText(d).toLowerCase()}
                    </li>
                  ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Competition({ modelId, market, setMarket }: { modelId: string; market: MarketId; setMarket: (m: MarketId) => void }) {
  const s = useGameState();
  const m = s.models.find((x) => x.id === modelId)!;
  const sm = segmentMarket(s, market, m.segment);
  const rows = [...sm.offers].sort((a, b) => b.weight - a.weight);
  const others = sm.othersWeight / sm.totalWeight;
  const mine = rows.find((o) => o.id === m.id);
  return (
    <Panel
      title={`Neden bu kadar satıyor? ${segmentDef(m.segment).name} pazarı`}
      actions={
        <div className="seg-toggle">
          {m.markets.map((mk) => (
            <button key={mk} type="button" className={`chip ${market === mk ? 'is-on' : ''}`} onClick={() => setMarket(mk)}>
              {MARKETS.find((x) => x.id === mk)!.flag} {MARKETS.find((x) => x.id === mk)!.name}
            </button>
          ))}
        </div>
      }
    >
      <p className="muted small">
        Alıcılar her aracı çekiciliğine (tasarım puanları × segmentin gizli önceliklerine), fiyatına, markaya ve yaşına göre tartar: iki yıldan sonra her araç eskir. Bayi ağın ve bilinirliğin, aracını kaç
        alıcının görebileceğini belirler. Segment toplamı: {sm.demand.toFixed(0)} araç/hafta.
      </p>
      {mine && (
        <div className="why">
          <div>
            <span>Çekicilik</span>
            <ScoreBar value={mine.appeal} />
          </div>
          <div>
            <span>Fiyat etkisi</span>
            <b className={mine.priceTerm < 0 ? 'tone-bad' : 'tone-good'}>{mine.priceTerm.toFixed(1)}</b>
          </div>
          <div>
            <span>Marka</span>
            <b className={mine.brand < 0 ? 'tone-bad' : 'tone-good'}>{mine.brand.toFixed(1)}</b>
          </div>
          <div>
            <span>Lansman heyecanı</span>
            <b>+{mine.hype.toFixed(1)}</b>
          </div>
          <div title="İki yıldan sonra her yıl alıcı gözünde eskir; makyaj ya da yeni kuşak tazeler.">
            <span>Yaş</span>
            <b className={mine.age < 0 ? 'tone-bad' : ''}>{mine.age.toFixed(1)}</b>
          </div>
          {(mine.exclusive ?? 0) < 0 && (
            <div title="Lüks ve spor arabayı alıcı farklı olmak için alır: sınıfın dörtte birinden fazlası aynı modeli sürünce çekiciliği azalır.">
              <span>Herkeste var</span>
              <b className="tone-bad">{(mine.exclusive ?? 0).toFixed(1)}</b>
            </div>
          )}
          <div>
            <span>Erişim</span>
            <b>{pct(mine.reach, 0)}</b>
          </div>
        </div>
      )}
      <Table
        head={['Model', 'Üretici', 'Çekicilik', 'Alıcı fiyatı', 'Fiyat', 'Marka', 'Yaş', 'Erişim', 'Pay']}
        align={['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
        className="compact"
        rows={[
          ...rows.map((o) => [
            o.kind === 'player' ? <b key="n">{o.name}</b> : o.name,
            o.kind === 'player' ? s.company.name : RIVALS.find((r) => r.id === o.companyId)?.name ?? '',
            o.appeal.toFixed(0),
            money(o.price),
            o.priceTerm.toFixed(1),
            o.brand.toFixed(1),
            o.age.toFixed(1),
            pct(o.reach, 0),
            pct(o.weight / sm.totalWeight),
          ]),
          ['Küçük üreticiler', '—', '—', '—', '—', '—', '—', '—', pct(others)],
        ]}
      />
    </Panel>
  );
}

/** This month's letters from owners: what real buyers of the car say. */
function OwnerLetters({ s, m }: { s: ReturnType<typeof useGameState>; m: CarModel }) {
  const letters = customerLetters(s, m, 3);
  return (
    <div className="letters">
      {letters.map((l, i) => (
        <blockquote key={i} className={`letter letter-${l.tone}`}>
          <div className="letter-stars" aria-label={`${l.stars} yıldız`}>
            {'★'.repeat(l.stars)}
            <span className="letter-stars-off">{'★'.repeat(5 - l.stars)}</span>
          </div>
          <p>“{l.text}”</p>
          <footer>
            — {l.name}, {l.role}, {l.place}
          </footer>
        </blockquote>
      ))}
      <p className="muted small">Mektuplar her ay yenilenir; alıcıların neyi fark ettiğini gösterir.</p>
    </div>
  );
}
