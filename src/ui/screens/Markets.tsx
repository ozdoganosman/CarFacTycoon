import { useState } from 'react';
import * as A from '../../core/actions';
import { dealerUpgradeCost, dealerUpkeep } from '../../core/game';
import { playerReach, rivalPriceNow } from '../../core/market';
import { yearFloat, yearOf } from '../../core/time';
import { MARKETS, activeTax, dealerCoverage, marketSize, segmentShares, tariff, MAX_DEALER_LEVEL } from '../../data/markets';
import { RIVALS } from '../../data/rivals';
import { ATTRS, ATTR_NAMES, MARKET_TASTE, SEGMENTS, segmentDef } from '../../data/segments';
import type { MarketId } from '../../core/types';
import { store, useGameState } from '../store';
import { money, num, pct } from '../format';
import { Badge, Button, NumberInput, Panel, Table } from '../components/ui';
import { Importance } from '../components/StatsPanel';
import { LineChart } from '../viz/LineChart';

export function Markets() {
  const s = useGameState();
  const [m, setM] = useState<MarketId>(s.company.hq);
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Pazarlar</h1>
        <div className="seg-toggle">
          {MARKETS.map((mk) => (
            <button key={mk.id} type="button" className={`chip ${m === mk.id ? 'is-on' : ''}`} onClick={() => setM(mk.id)}>
              {mk.flag} {mk.name}
            </button>
          ))}
        </div>
      </div>
      <MarketPanel market={m} />
      <Knowledge />
    </div>
  );
}

function MarketPanel({ market }: { market: MarketId }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const def = MARKETS.find((x) => x.id === market)!;
  const ms = s.markets[market];
  const isHome = market === s.company.hq;
  const shares = segmentShares(market, yf);
  const size = marketSize(market, yf);
  const lastYear = s.years[s.years.length - 1];
  const tax = activeTax(market, yf);
  const history = [
    ...Array.from({ length: Math.floor(yf) - 1900 + 1 }, (_, i) => ({ x: 1900 + i, y: marketSize(market, 1900 + i) })),
    { x: yf, y: size },
  ];
  const taste = MARKET_TASTE[market];
  const rivals = s.rivalModels.filter((r) => r.active && r.markets.includes(market));
  const [ad, setAd] = useState(ms.adBudget);
  return (
    <>
      <Panel title={`${def.flag} ${def.name}`}>
        <p>{def.desc}</p>
        <div className="stats-row">
          <div className="stat">
            <div className="stat-label">Yıllık pazar ({yearOf(s.week)})</div>
            <div className="stat-value">{num(size)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Geçen yıl payın</div>
            <div className="stat-value">{lastYear ? pct(lastYear.shareByMarket[market], 2) : '—'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Gümrük (ithal)</div>
            <div className="stat-value">{isHome ? 'Yurt içi' : pct(tariff(market, yf), 0)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Araç vergisi</div>
            <div className="stat-value small">{tax ? tax.label : 'Yok'}</div>
          </div>
        </div>
        <p className="small">
          Alıcıların zevki:{' '}
          {Object.entries(taste)
            .map(([k, v]) => `${ATTR_NAMES[k as keyof typeof ATTR_NAMES].toLowerCase()} ${v! > 1 ? '↑' : '↓'}`)
            .join(', ')}
        </p>
        <div className="grid-2">
          <LineChart
            title="Yıllık yeni araç satışı"
            series={[{ id: 'size', name: 'Pazar', color: 'var(--series-1)', points: history, area: true }]}
            height={170}
            xFormat={(v) => `${Math.round(v)}`}
            yFormat={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)} mn` : v >= 1000 ? `${Math.round(v / 1000)} bin` : `${Math.round(v)}`)}
            ariaLabel={`${def.name} pazar büyüklüğü`}
          />
          <div className="seg-shares">
            <h4>Segment payları</h4>
            {SEGMENTS.filter((x) => shares[x.id] > 0.001).map((x) => (
              <div key={x.id} className="share-row">
                <span>
                  {x.icon} {x.name}
                </span>
                <div className="share-bar">
                  <div style={{ width: `${shares[x.id] * 100}%` }} />
                </div>
                <span className="muted small">{num((size * shares[x.id]) / 1)}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <div className="grid-2">
        <Panel title="Bayi ağı ve pazarlama">
          {!ms.unlocked ? (
            <p className="muted">Bu pazar ilk modelini çıkardıktan sonra ihracata açılır.</p>
          ) : (
            <>
              <div className="dealer">
                <div>
                  <span className="muted small">Bayi seviyesi</span>
                  <b>
                    {ms.dealerLevel} / {MAX_DEALER_LEVEL}
                  </b>
                </div>
                <div>
                  <span className="muted small">Alıcılara erişim</span>
                  <b>{pct(dealerCoverage(ms.dealerLevel, isHome), 0)}</b>
                </div>
                <div>
                  <span className="muted small">Bilinirlik</span>
                  <b>{pct(ms.awareness, 0)}</b>
                </div>
                <div>
                  <span className="muted small">Toplam erişim</span>
                  <b>{pct(playerReach(s, market), 0)}</b>
                </div>
              </div>
              <p className="muted small">
                Bayiler satıştan %12 komisyon alır ve sabit bir işletme gideri vardır ({money(dealerUpkeep(s, market))}/hafta). Bayi olmadan yalnızca fabrikadan satış yapabilirsin.
              </p>
              {ms.dealerLevel < MAX_DEALER_LEVEL && (
                <Button kind="primary" onClick={() => store.try((st) => A.upgradeDealers(st, market), 'Bayi ağı büyüdü')}>
                  Bayi ağını büyüt ({money(dealerUpgradeCost(s, market))})
                </Button>
              )}
              <div className="price-row">
                <NumberInput label="Haftalık reklam bütçesi" prefix="$" value={ad} min={0} step={10} onChange={setAd} />
                <Button small onClick={() => store.act((st) => A.setAdBudget(st, market, ad))}>
                  Uygula
                </Button>
              </div>
              <p className="muted small">Reklam bilinirliği artırır; etkisi azalan getirilidir. Satılan her araç da bilinirliği artırır.</p>
            </>
          )}
        </Panel>
        <Panel title="Rakip modeller">
          <Table
            head={['Model', 'Üretici', 'Segment', 'Fiyat']}
            align={['l', 'l', 'l', 'r']}
            className="compact"
            rows={rivals
              .sort((a, b) => a.segment.localeCompare(b.segment))
              .map((r) => [r.name, RIVALS.find((x) => x.id === r.companyId)?.name ?? '', `${segmentDef(r.segment).icon} ${segmentDef(r.segment).name}`, money(rivalPriceNow(r, s.week))])}
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
    <Panel title="Segment bilgisi: alıcılar neye önem veriyor?">
      <p className="muted small">
        Tablo, dergi yorumları ve müşteri geri bildirimleriyle zamanla dolar. ● sayısı önemi gösterir; “?” henüz bilinmiyor demek. Pazar araştırması tüm satırı hemen açar.
      </p>
      <div className="table-wrap">
        <table className="table knowledge">
          <thead>
            <tr>
              <th>Segment</th>
              {ATTRS.map((k) => (
                <th key={k} className="al-c">
                  {ATTR_NAMES[k]}
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
                    {seg.icon} {seg.name}
                  </td>
                  {ATTRS.map((k) => (
                    <td key={k} className="al-c">
                      <Importance s={s} segment={seg.id} attr={k} />
                    </td>
                  ))}
                  <td className="al-r">
                    {known ? (
                      <Badge tone="good">Biliniyor</Badge>
                    ) : seg.year <= yf ? (
                      <Button small onClick={() => store.try((st) => A.marketResearch(st, seg.id))}>
                        Araştır ({money(cost)})
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
