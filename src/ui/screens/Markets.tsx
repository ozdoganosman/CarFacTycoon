import { useState } from 'react';
import * as A from '../../core/actions';
import * as N from '../../core/network';
import { rivalPriceNow } from '../../core/market';
import { yearFloat, yearOf } from '../../core/time';
import { cityDef } from '../../data/cities';
import { marketSize, segmentShares } from '../../data/markets';
import { RIVALS } from '../../data/rivals';
import { ATTRS, ATTR_NAMES, MARKET_TASTE, SEGMENTS, segmentDef } from '../../data/segments';
import { REGION_NAMES, STATE_IDS, stateDef, statePop, stateWeights, type StateId } from '../../data/states';
import type { GameState } from '../../core/types';
import { store, useGameState } from '../store';
import { money, num, pct } from '../format';
import { Badge, Button, NumberInput, Panel, Table } from '../components/ui';
import { Importance } from '../components/StatsPanel';
import { LineChart } from '../viz/LineChart';
import { UsMap, type MapMarker, type MapTone, type UsMapProps } from '../viz/UsMap';
import { t, msg } from '../../i18n';

export function Markets() {
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>{t('Pazar ve bayi ağı')}</h1>
      </div>
      <NetworkPanel />
      <MarketPanel />
      <Knowledge />
    </div>
  );
}

// ---------------- the map ----------------

type Overlay = 'network' | 'demand' | 'sales' | 'share' | 'parc' | 'service';
const OVERLAYS: { id: Overlay; label: string }[] = [
  { id: 'network', label: msg('Ağ') },
  { id: 'demand', label: msg('Talep') },
  { id: 'sales', label: msg('Satış') },
  { id: 'share', label: msg('Pazar payı') },
  { id: 'parc', label: msg('Yoldaki araç') },
  { id: 'service', label: msg('Servis') },
];

/** Sepia washes of the period, light to dark. */
const RAMP = ['#f1e8d2', '#e6cf9f', '#d4a869', '#b67a42', '#8a4b25', '#5e2d14'];
const SERVICE = [
  { at: 0.95, color: '#7fa892', label: msg('Yeterli') },
  { at: 0.8, color: '#bcc587', label: msg('Hafif sıkışık') },
  { at: 0.6, color: '#e2c46a', label: msg('Kuyruk var') },
  { at: 0.4, color: '#d98c4a', label: msg('Uzun bekleme') },
  { at: 0, color: '#b3402a', label: msg('Servis yok gibi') },
];
const ramp = (f: number) => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(f * (RAMP.length - 1))))];
const serviceColor = (q: number) => SERVICE.find((x) => q >= x.at)!.color;

/** Last year's sales in a state (this year's in the first year). */
const soldIn = (s: GameState, id: StateId) => {
  const n = s.network?.states[id];
  return n ? n.soldLastYear || n.soldYear : 0;
};

/** Our share of a state's car buyers last year. */
function shareIn(s: GameState, id: StateId, yf: number) {
  const buyers = marketSize('usa', yf - 1) * stateWeights(yf - 1)[id];
  return buyers > 0 ? soldIn(s, id) / buyers : 0;
}

function tones(s: GameState, overlay: Overlay, yf: number): { tone: UsMapProps['tone']; legend?: UsMapProps['legend'] } {
  const tone: Partial<Record<StateId, MapTone>> = {};
  if (overlay === 'network') {
    for (const id of STATE_IDS) if (!N.isOpen(s, id)) tone[id] = { fill: '#e9e1cc', hatch: true, dim: true };
    return {
      tone,
      legend: {
        title: t('AĞ'),
        stops: [
          { color: '#b3402a', label: t('Bayi (sayısı)') },
          { color: '#3f7f6f', label: t('Servis atölyesi') },
          { color: '#e9e1cc', label: t('Henüz satış yok') },
        ],
      },
    };
  }
  if (overlay === 'service') {
    for (const id of STATE_IDS) {
      const parc = s.network?.states[id]?.parc ?? 0;
      tone[id] = parc < 1 ? { fill: '#e9e1cc', hatch: !N.isOpen(s, id), dim: true } : { fill: serviceColor(N.serviceQuality(s, id, yf)) };
    }
    return { tone, legend: { title: t('SERVİS'), stops: SERVICE.map((x) => ({ color: x.color, label: t(x.label) })) } };
  }
  const value = (id: StateId): number =>
    overlay === 'demand' ? stateWeights(yf)[id] : overlay === 'sales' ? soldIn(s, id) : overlay === 'share' ? shareIn(s, id, yf) : s.network?.states[id]?.parc ?? 0;
  const vals = STATE_IDS.map(value);
  const max = Math.max(...vals, 1e-9);
  // Sales and cars on the road spread over orders of magnitude: a log scale reads better.
  const log = overlay === 'sales' || overlay === 'parc';
  const scale = (v: number) => (v <= 0 ? 0 : log ? Math.log1p(v) / Math.log1p(max) : v / max);
  STATE_IDS.forEach((id, i) => {
    tone[id] = vals[i] <= 0 ? { fill: RAMP[0], hatch: !N.isOpen(s, id), dim: !N.isOpen(s, id) } : { fill: ramp(0.15 + 0.85 * scale(vals[i])) };
  });
  const fmt = (v: number) => (overlay === 'demand' || overlay === 'share' ? pct(v, overlay === 'share' ? 1 : 1) : num(v));
  const title = { demand: t('ÜLKE TALEBİNDEN PAY'), sales: t('GEÇEN YIL SATIŞ'), share: t('PAZAR PAYIN'), parc: t('YOLDAKİ ARAÇLARIN') }[overlay];
  const at = (f: number) => (log ? Math.expm1(f * Math.log1p(max)) : f * max);
  return {
    tone,
    legend: {
      title,
      stops: [1, 0.66, 0.33, 0].map((f) => ({ color: f === 0 ? RAMP[0] : ramp(0.15 + 0.85 * f), label: f === 0 ? t('Yok') : fmt(at(f)) })),
    },
  };
}

function NetworkPanel() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const [overlay, setOverlay] = useState<Overlay>('network');
  const [sel, setSel] = useState<StateId>(N.homeState(s));
  const frontier = new Set(N.frontier(s));
  const markers: Partial<Record<StateId, MapMarker>> = {};
  for (const id of STATE_IDS) {
    const n = s.network?.states[id];
    markers[id] = { dealers: n?.dealers ?? 0, service: n?.service ?? 0, searching: !!n?.search, frontier: overlay === 'network' && frontier.has(id) };
  }
  const { tone, legend } = tones(s, overlay, yf);
  const scrapped = STATE_IDS.reduce((a, id) => a + (s.network?.states[id]?.scrapped ?? 0), 0);
  const freightYear = STATE_IDS.reduce((a, id) => a + (s.network?.states[id]?.freightYear ?? 0), 0);
  return (
    <Panel title={t('Bayi ve servis haritası')}>
      <div className="net-summary">
        <div>
          <span className="muted small">{t('Satış yapılan eyalet')}</span>
          <b>{N.openStates(s).length} / 48</b>
        </div>
        <div>
          <span className="muted small">{t('Bayi')}</span>
          <b>{N.totalDealers(s)}</b>
        </div>
        <div>
          <span className="muted small">{t('Servis atölyesi')}</span>
          <b>{N.totalService(s)}</b>
        </div>
        <div>
          <span className="muted small">{t('Yoldaki araçların')}</span>
          <b>{num(N.totalParc(s))}</b>
        </div>
        <div>
          <span className="muted small">{t('Hurdaya çıkan')}</span>
          <b>{num(scrapped)}</b>
        </div>
        <div>
          <span className="muted small">{t('Servis memnuniyeti')}</span>
          <b>{pct(N.serviceSatisfaction(s, yf), 0)}</b>
        </div>
        <div>
          <span className="muted small">{t('Ağ gideri')}</span>
          <b>{t('{cost}/yıl', { cost: money(N.networkWeekly(s, yf) * 52) })}</b>
        </div>
        <div>
          <span className="muted small">{t('Nakliye (bu yıl)')}</span>
          <b>{money(freightYear)}</b>
        </div>
      </div>
      <div className="seg-toggle" role="group" aria-label={t('Harita görünümü')}>
        {OVERLAYS.map((o) => (
          <button key={o.id} type="button" className={`chip ${overlay === o.id ? 'is-on' : ''}`} onClick={() => setOverlay(o.id)}>
            {t(o.label)}
          </button>
        ))}
      </div>
      <div className="net-layout">
        <UsMap
          tone={tone}
          markers={markers}
          selected={sel}
          onSelect={setSel}
          home={cityDef(s.company.city).id}
          title={t('BİRLEŞİK DEVLETLER')}
          subtitle={t('Bayi ve Servis Haritası')}
          company={s.company.name}
          year={yearOf(s.week)}
          legend={legend}
        />
        <StateCard id={sel} />
      </div>
      <StateList onPick={setSel} />
    </Panel>
  );
}

function statusOf(s: GameState, id: StateId): { text: string; tone: 'good' | 'warn' | 'info' | 'bad' } {
  const n = s.network?.states[id];
  if (n?.search) return { text: t('Bayi aranıyor · {n} hafta', { n: n.search.until - s.week }), tone: 'warn' };
  if (id === N.homeState(s)) return { text: t('Fabrikanın eyaleti'), tone: 'good' };
  if (N.isOpen(s, id)) return { text: t('Satış yapılıyor'), tone: 'good' };
  if (N.frontier(s).includes(id)) return { text: t('Komşu: bayi aranabilir'), tone: 'info' };
  return { text: t('Henüz uzak'), tone: 'bad' };
}

function StateCard({ id }: { id: StateId }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const def = stateDef(id);
  const n = s.network?.states[id];
  const open = N.isOpen(s, id);
  const st = statusOf(s, id);
  const q = N.serviceQuality(s, id, yf);
  const cap = N.serviceCapacity(s, id, yf);
  const can = N.canSearch(s, id);
  const addDealer = N.marginalWeekly(s, 1, 0, yf) * 52;
  const addShop = N.marginalWeekly(s, 0, 1, yf) * 52;
  return (
    <div className="state-card">
      <h3>{def.name}</h3>
      <div className="muted small">
        {t(REGION_NAMES[def.region])}
        {def.statehood && yf < def.statehood ? ` · ${t('{year}’e kadar toprak (territory)', { year: def.statehood })}` : ''} · <Badge tone={st.tone}>{st.text}</Badge>
      </div>
      <div className="kv">
        <span>{t('Nüfus')}</span>
        <b>{t('{v} mn', { v: (statePop(id, yf) / 1000).toFixed(1) })}</b>
        <span>{t('Ülkedeki araç talebinden payı')}</span>
        <b>{pct(stateWeights(yf)[id], 1)}</b>
        <span>{t('Satışın (geçen yıl · bu yıl)')}</span>
        <b>
          {num(n?.soldLastYear ?? 0)} · {num(n?.soldYear ?? 0)}
        </b>
        {open && (
          <>
            <span>{t('Pazar payın')}</span>
            <b>{pct(shareIn(s, id, yf), 1)}</b>
            <span>{t('Bayi kapsaması')}</span>
            <b>{pct(N.coverage(s, id, yf), 0)}</b>
            <span>{t('Bilinirlik')}</span>
            <b>{pct(n?.awareness ?? 0, 0)}</b>
          </>
        )}
        <span>{t('Nakliye (araç başına)')}</span>
        <b>{N.freightPerCar(s, id, yf) > 0 ? money(N.freightPerCar(s, id, yf)) : t('Yok (fabrika burada)')}</b>
        <span>{t('Yoldaki araçların · ort. yaş')}</span>
        <b>
          {num(n?.parc ?? 0)} · {t('{v} yıl', { v: (n?.parcAge ?? 0).toFixed(1) })}
        </b>
        <span>{t('Hurdaya çıkan')}</span>
        <b>{num(n?.scrapped ?? 0)}</b>
        <span>{t('Bayi · servis atölyesi')}</span>
        <b>
          {n?.dealers ?? 0}
          {id === N.homeState(s) ? ` ${t('(+ fabrika)')}` : ''} · {n?.service ?? 0}
        </b>
      </div>
      {(n?.parc ?? 0) > 0 && (
        <>
          <div className="muted small">
            {t('Servis: {cap} araçlık kapasite, {parc} araç', { cap: num(cap), parc: num(n!.parc) })}
          </div>
          <div className="svc-bar" aria-label={t('Servis yeterliliği {q}', { q: pct(q, 0) })}>
            <div style={{ width: `${Math.max(4, q * 100)}%`, background: serviceColor(q) }} />
          </div>
        </>
      )}
      {n?.firstDealer && <p className="muted small">{t('İlk bayi: {dealer}', { dealer: n.firstDealer })}</p>}
      <div className="actions">
        {n?.search ? null : can.ok ? (
          <Button kind="primary" small onClick={() => store.try((st) => N.startDealerSearch(st, id), t('{state}: bayi aranıyor', { state: def.name }))}>
            {open
              ? t('Yeni bayi ara ({cost} · {n} hafta · şans {chance})', {
                  cost: money(N.searchCost(s, id, yf)),
                  n: N.searchWeeks(s, id),
                  chance: pct(N.searchChance(s, id), 0),
                })
              : t('Bayi ara ({cost} · {n} hafta · şans {chance})', {
                  cost: money(N.searchCost(s, id, yf)),
                  n: N.searchWeeks(s, id),
                  chance: pct(N.searchChance(s, id), 0),
                })}
          </Button>
        ) : (
          !open && <span className="muted small">{can.why}</span>
        )}
        {open && (
          <Button small onClick={() => store.try((st) => N.openServiceShop(st, id), t('{state}: servis atölyesi açıldı', { state: def.name }))}>
            {t('Servis aç ({cost})', { cost: money(N.serviceShopCost(yf)) })}
          </Button>
        )}
        {(n?.dealers ?? 0) > 0 && (
          <Button
            small
            kind="ghost"
            onClick={async () => {
              const last = n!.dealers === 1 && id !== N.homeState(s);
              const ok = await store.ask({
                title: t('{state}: bir bayi kapatılsın mı?', { state: def.name }),
                body: last ? t('Bu, eyaletteki son bayin: kapatırsan orada satış durur. Yoldaki arabalar servis ister.') : t('Kapsama azalır, ağ gideri düşer.'),
                confirm: t('Kapat'),
                danger: true,
              });
              if (ok) store.try((st) => N.closeDealer(st, id));
            }}
          >
            {t('Bayi kapat')}
          </Button>
        )}
        {(n?.service ?? 0) > 0 && (
          <Button small kind="ghost" onClick={() => store.try((st) => N.closeServiceShop(st, id))}>
            {t('Servis kapat')}
          </Button>
        )}
      </div>
      <p className="muted small">
        {t('Ağ büyüdükçe genel gideri orantısız artar (bölge müdürlükleri, parça depoları): bir bayi daha yılda ~{dealer}, bir servis atölyesi ~{shop} ekler.', {
          dealer: money(addDealer),
          shop: money(addShop),
        })}
      </p>
    </div>
  );
}

function StateList({ onPick }: { onPick: (id: StateId) => void }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const [all, setAll] = useState(false);
  const frontier = new Set(N.frontier(s));
  const w = stateWeights(yf);
  const ids = STATE_IDS.filter((id) => all || N.isOpen(s, id) || frontier.has(id) || s.network?.states[id]?.search).sort((a, b) => w[b] - w[a]);
  return (
    <>
      <div className="row-between" style={{ marginTop: 12 }}>
        <h4 style={{ margin: 0 }}>{t('Eyaletler')}</h4>
        <button type="button" className="link-btn small" onClick={() => setAll(!all)}>
          {all ? t('Yalnızca satış yapılan ve komşu eyaletler') : t('Bütün eyaletler')}
        </button>
      </div>
      <Table
        className="compact"
        head={[t('Eyalet'), t('Durum'), t('Talep'), t('Satış'), t('Yoldaki'), t('Servis'), t('Bayi·Servis')]}
        align={['l', 'l', 'r', 'r', 'r', 'r', 'r']}
        rows={ids.map((id) => {
          const n = s.network?.states[id];
          const st = statusOf(s, id);
          return [
            <button key="n" type="button" className="link-btn" onClick={() => onPick(id)}>
              {stateDef(id).name}
            </button>,
            <span key="s" className="state-row-status">
              <Badge tone={st.tone}>{st.text}</Badge>
            </span>,
            pct(w[id], 1),
            num(soldIn(s, id)),
            num(n?.parc ?? 0),
            (n?.parc ?? 0) > 0 ? pct(N.serviceQuality(s, id, yf), 0) : '—',
            `${n?.dealers ?? 0}·${n?.service ?? 0}`,
          ];
        })}
      />
    </>
  );
}

// ---------------- the American market ----------------

function MarketPanel() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const ms = s.markets.usa;
  const shares = segmentShares('usa', yf);
  const size = marketSize('usa', yf);
  const lastYear = s.years[s.years.length - 1];
  const history = [
    ...Array.from({ length: Math.floor(yf) - 1900 + 1 }, (_, i) => ({ x: 1900 + i, y: marketSize('usa', 1900 + i) })),
    { x: yf, y: size },
  ];
  const taste = MARKET_TASTE.usa;
  const rivals = s.rivalModels.filter((r) => r.active && r.markets.includes('usa'));
  const [ad, setAd] = useState(ms.adBudget);
  return (
    <>
      <Panel title={`🇺🇸 ${t('Amerikan pazarı')}`}>
        <div className="stats-row">
          <div className="stat">
            <div className="stat-label">{t('Yıllık pazar ({year})', { year: yearOf(s.week) })}</div>
            <div className="stat-value">{num(size)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">{t('Geçen yıl ülkedeki payın')}</div>
            <div className="stat-value">{lastYear ? pct(lastYear.shareByMarket.usa, 2) : '—'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">{t('Bilinirlik (satış yapılan eyaletler)')}</div>
            <div className="stat-value">{pct(ms.awareness, 0)}</div>
          </div>
        </div>
        <p className="small">
          {t('Alıcıların zevki: {tastes}', {
            tastes: Object.entries(taste)
              .map(([k, v]) => `${t(ATTR_NAMES[k as keyof typeof ATTR_NAMES]).toLowerCase()} ${v! > 1 ? '↑' : '↓'}`)
              .join(', '),
          })}
        </p>
        <div className="grid-2">
          <LineChart
            title={t('Yıllık yeni araç satışı')}
            series={[{ id: 'size', name: t('Pazar'), color: 'var(--series-1)', points: history, area: true }]}
            height={170}
            xFormat={(v) => `${Math.round(v)}`}
            yFormat={(v) =>
              v >= 1e6 ? t('{v} mn', { v: (v / 1e6).toFixed(1) }) : v >= 1000 ? t('{v} bin', { v: Math.round(v / 1000) }) : `${Math.round(v)}`
            }
            ariaLabel={t('Amerikan pazarının büyüklüğü')}
          />
          <div className="seg-shares">
            <h4>{t('Segment payları')}</h4>
            {SEGMENTS.filter((x) => shares[x.id] > 0.001).map((x) => (
              <div key={x.id} className="share-row">
                <span>
                  {x.icon} {t(x.name)}
                </span>
                <div className="share-bar">
                  <div style={{ width: `${shares[x.id] * 100}%` }} />
                </div>
                <span className="muted small">{num(size * shares[x.id])}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <div className="grid-2">
        <Panel title={t('Reklam')}>
          <div className="price-row">
            <NumberInput label={t('Haftalık reklam bütçesi')} prefix="$" value={ad} min={0} step={10} onChange={setAd} />
            <Button small onClick={() => store.act((st) => A.setAdBudget(st, 'usa', ad))}>
              {t('Uygula')}
            </Button>
          </div>
          <p className="muted small">
            {t(
              'Reklam, satış yaptığın bütün eyaletlerde bilinirliği artırır; etkisi azalan getirilidir. Satılan ve yolda görülen her araba da markanı tanıtır. Bayiler satıştan %12 komisyon alır.',
            )}
          </p>
        </Panel>
        <Panel title={t('Rakip modeller')}>
          <Table
            head={[t('Model'), t('Üretici'), t('Segment'), t('Fiyat')]}
            align={['l', 'l', 'l', 'r']}
            className="compact"
            rows={rivals
              .sort((a, b) => a.segment.localeCompare(b.segment))
              .map((r) => [r.name, RIVALS.find((x) => x.id === r.companyId)?.name ?? '', `${segmentDef(r.segment).icon} ${t(segmentDef(r.segment).name)}`, money(rivalPriceNow(r, s.week))])}
          />
        </Panel>
      </div>
    </>
  );
}

function Knowledge() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const cost = A.marketResearchCost(s);
  return (
    <Panel title={t('Segment bilgisi: alıcılar neye önem veriyor?')}>
      <p className="muted small">
        {t('Tablo, dergi yorumları ve müşteri geri bildirimleriyle zamanla dolar. ● sayısı önemi gösterir; “?” henüz bilinmiyor demek. Pazar araştırması tüm satırı hemen açar.')}
      </p>
      <div className="table-wrap">
        <table className="table knowledge">
          <thead>
            <tr>
              <th>{t('Segment')}</th>
              {ATTRS.map((k) => (
                <th key={k} className="al-c">
                  {t(ATTR_NAMES[k])}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {SEGMENTS.map((seg) => {
              const known = ATTRS.every((k) => (s.knowledge[seg.id][k] ?? 0) >= 2);
              return (
                <tr key={seg.id} className={seg.year > yf ? 'is-future' : ''}>
                  <td>
                    {seg.icon} {t(seg.name)}
                  </td>
                  {ATTRS.map((k) => (
                    <td key={k} className="al-c">
                      <Importance s={s} segment={seg.id} attr={k} />
                    </td>
                  ))}
                  <td className="al-r">
                    {known ? (
                      <Badge tone="good">{t('Biliniyor')}</Badge>
                    ) : seg.year <= yf ? (
                      <Button small onClick={() => store.try((st) => A.marketResearch(st, seg.id))}>
                        {t('Araştır ({cost})', { cost: money(cost) })}
                      </Button>
                    ) : (
                      <span className="muted small">{seg.year}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
