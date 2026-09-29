import { useMemo, useState } from 'react';
import { FIRSTS, MOVE_NAMES, ledSegments, salesRank } from '../../core/rivalMoves';
import { rivalDef } from '../../core/rivals';
import {
  FLOAT_STEPS,
  MAX_FLOAT,
  PAYOUT_STEPS,
  ULTIMATUM_AT,
  WARNING_AT,
  boardOutlook,
  boardVeto,
  buyBack,
  buybackCost,
  canGoPublic,
  freeFloat,
  goPublic,
  issueProceeds,
  issueShares,
  marketCap,
  moodName,
  setPayout,
  stockMood,
} from '../../core/shares';
import { formatDate, yearFloat, yearOf } from '../../core/time';
import type { GameState, RivalMove } from '../../core/types';
import { segmentDef } from '../../data/segments';
import { store } from '../store';
import { money } from '../format';
import { Button, Choice, Empty, Info, Panel, Progress, Stat, Table } from './ui';

const signedPct = (v: number) => `${v >= 0 ? '+' : '−'}%${Math.abs(Math.round(v * 1000) / 10)}`;

/** Selling shares, the board's targets and its patience. */
export function SharesPanel({ s }: { s: GameState }) {
  const yf = yearFloat(s.week);
  const mood = stockMood(yf);
  const [float, setFloat] = useState(0.2);
  const sh = s.shares;
  if (!sh) {
    const can = canGoPublic(s);
    return (
      <Panel
        title={
          <>
            Borsa ve yönetim kurulu
            <Info>
              <p>Şirketin bir kısmını borsada satarak sermaye toplarsın; kontrol hep sende kalır (en fazla %{Math.round(MAX_FLOAT * 100)} satılabilir).</p>
              <p>
                Karşılığında her yıl yönetim kuruluna hesap verirsin. Ciro pazardan hızlı büyümeli (çok iyi bir yıldan sonra beklenti yükselir); hissedarlar kârın yarısını
                ve her yıl biraz daha fazla temettü ister. Temettü oranı %20 başlar: yükseltmek senin işin ve kasadan gerçek para çıkarır.
              </p>
              <p>
                Kurulun hafızası kısadır: iyi yılların kredisi her yıl yarıya iner. Güven {WARNING_AT}’ın altına inerse kurul yarışı, rakip satın almayı ve yeni hat
                kurmayı veto eder; {ULTIMATUM_AT}’in altında son uyarı gelir, sonra da tutmazsa görevden alınırsın ve oyun biter.
              </p>
              <p>Oyun sonu puanında şirket değerinin yalnızca senin payın sayılır. Borsanın havası fiyatı belirler: 1928’de satmak, 1932’de geri almak ucuzdur.</p>
            </Info>
          </>
        }
      >
        <p className="muted small">
          Sermaye için hisse sat: kasaya büyük para girer, ama her yıl büyüme ve temettü hedefleri gelir. Borsa şu an <b>{moodName(mood)}</b> (×{mood.toFixed(2)}).
        </p>
        {!can.ok ? (
          <p className="note">{can.why}</p>
        ) : (
          <>
            <Choice
              compact
              value={float}
              onChange={setFloat}
              options={FLOAT_STEPS.map((p) => ({ value: p, label: `%${Math.round(p * 100)}`, sub: money(issueProceeds(s, p)) }))}
            />
            <p>
              <Button
                kind="primary"
                onClick={() =>
                  store
                    .ask({
                      title: 'Halka arz edilsin mi?',
                      body: `Şirketin %${Math.round(float * 100)}’i satılır, kasaya ${money(issueProceeds(s, float))} girer (bankacıların payı düşülmüş). Bundan sonra her yıl yönetim kuruluna hesap verirsin. Hisseleri sonradan geri alabilirsin ama primli.`,
                      confirm: 'Halka arz et',
                    })
                    .then((yes) => yes && store.try((st) => goPublic(st, float), 'Şirket borsada'))
                }
              >
                Halka arz et
              </Button>
            </p>
          </>
        )}
      </Panel>
    );
  }
  const out = boardOutlook(s)!;
  const veto = boardVeto(s);
  const tone = sh.confidence < ULTIMATUM_AT ? 'bad' : sh.confidence < WARNING_AT ? 'warn' : 'good';
  const cap = marketCap(s);
  const step = 0.05;
  const free = freeFloat(s);
  const backAll = buybackCost(s, free);
  return (
    <Panel title="Borsa ve yönetim kurulu">
      <div className="stats-row">
        <Stat label="Dışarıdaki pay" value={`%${Math.round(sh.float * 100)}`} sub={`senin payın %${Math.round((1 - sh.float) * 100)}`} />
        <Stat label="Piyasa değeri" value={money(cap)} sub={`borsa ${moodName(mood)}`} />
        <Stat label="Ödenen temettü" value={money(sh.dividends)} />
      </div>
      <p className="small">
        Yönetim kurulunun güveni <b className={`tone-${tone}`}>{Math.round(sh.confidence)}/100</b>
        {sh.ultimatum && <b className="tone-bad"> · son uyarı: bu yıl hedefler tutmazsa görevden alınırsın</b>}
      </p>
      <Progress value={sh.confidence} max={100} tone={tone} />
      {out.judged ? (
        <ul className="small">
          <li className={out.projected >= out.needed ? 'tone-good' : 'tone-bad'}>
            Ciro hedefi {signedPct(sh.target.growth)}: yıl sonunda en az <b>{money(out.needed)}</b> (geçen yıl {money(out.prev)}). Bu hızla yıl sonu tahmini{' '}
            <b>{money(out.projected)}</b>.
          </li>
          <li className={out.dividend >= sh.target.dividend * 0.98 ? 'tone-good' : 'tone-bad'}>
            Temettü hedefi <b>{money(sh.target.dividend)}</b>. Bu oranla tahmini temettü <b>{money(out.dividend)}</b> (yıllık kâr tahmini {money(out.profit)}).
          </li>
        </ul>
      ) : (
        <p className="small muted">Yönetim kurulu seni ilk kez {sh.target.year} sonunda değerlendirecek.</p>
      )}
      {veto && <p className="note tone-bad">{veto}</p>}
      <p className="small">
        Temettü oranı (kârın dış hissedarlara düşen payından ne kadarı dağıtılır). Kurul kârın yarısını ve geçen yıldan biraz fazlasını bekliyor
        {sh.seat ? '; rakip yönetimde olduğu için daha da fazlasını' : ''}:
      </p>
      <Choice
        compact
        value={sh.payout}
        onChange={(v) => store.act((st) => setPayout(st, v))}
        options={PAYOUT_STEPS.map((p) => ({ value: p, label: `%${Math.round(p * 100)}` }))}
      />
      {sh.raider && (
        <p className="note">
          {rivalDef(sh.raider.company).name} şirketin %{Math.round(sh.raider.stake * 100)}’ini elinde tutuyor
          {sh.seat ? ' ve yönetim kurulunda oturuyor: hedefler daha sıkı.' : '.'}
        </p>
      )}
      <p className="small muted">
        Geri alım piyasa fiyatının %10 fazlasına olur ve hisselerin satıldığı fiyatın (yılda %6 faiziyle) altına inmez
        {sh.ultimatum ? '; son uyarı altındayken bunun da %50 fazlası' : ''}.
      </p>
      <div className="row board-actions">
        <Button
          small
          disabled={free <= 0.001 || s.company.cash < buybackCost(s, Math.min(step, free))}
          onClick={() => store.try((st) => buyBack(st, step), 'Hisseler geri alındı')}
        >
          %{Math.round(Math.min(step, free) * 100)} geri al ({money(buybackCost(s, Math.min(step, free)))})
        </Button>
        <Button
          small
          disabled={free <= 0.001 || s.company.cash < backAll}
          onClick={() =>
            store
              .ask({
                title: 'Bütün hisseler geri alınsın mı?',
                body: `Piyasadaki %${Math.round(free * 100)} ${money(backAll)} karşılığında geri alınır.${sh.raider ? ' Rakibin bloğu satılık değil.' : ' Yönetim kurulu dağılır, şirket yeniden tamamen senin olur.'}`,
                confirm: `${money(backAll)} öde`,
                danger: true,
              })
              .then((yes) => yes && store.try((st) => buyBack(st, 1), 'Hisseler geri alındı'))
          }
        >
          Hepsini geri al ({money(backAll)})
        </Button>
        <Button small disabled={sh.float + step > MAX_FLOAT + 1e-6} onClick={() => store.try((st) => issueShares(st, step), 'Yeni hisse satıldı')}>
          %5 yeni hisse sat (+{money(issueProceeds(s, step))})
        </Button>
      </div>
      {sh.history.length > 0 && (
        <Table
          head={['Yıl', 'Ciro', 'Temettü', 'Güven']}
          align={['l', 'r', 'r', 'r']}
          rows={[...sh.history]
            .reverse()
            .slice(0, 8)
            .map((b) => [
              <span key="y" className={b.met ? 'tone-good' : 'tone-bad'}>
                {b.met ? '✓' : '✗'} {b.year}
              </span>,
              <span key="g">
                {signedPct(b.growth)} <span className="muted small">/ {signedPct(b.targetGrowth)}</span>
              </span>,
              <span key="d">
                {money(b.dividend)} <span className="muted small">/ {money(b.targetDividend)}</span>
              </span>,
              Math.round(b.confidence),
            ])}
        />
      )}
    </Panel>
  );
}

function moveText(m: RivalMove): string {
  const name = rivalDef(m.company).name;
  const seg = m.segment ? segmentDef(m.segment).name.toLowerCase() : '';
  switch (m.kind) {
    case 'priceWar':
      return `${name}, ${seg} sınıfında fiyatlarını %15 indirdi.`;
    case 'techLeap':
      return m.first
        ? `${name}, ${seg} sınıfının ilk ${FIRSTS[m.first].name} arabasını çıkardı: ${m.model ?? ''}.`
        : `${name}, ${seg} sınıfına ${m.model ?? 'yeni bir model'} ile saldırdı.`;
    case 'merger':
      return `${name}, ${m.partner ? rivalDef(m.partner).name : 'bir rakibi'} şirketini yuttu.`;
    case 'bid':
      return `${name} şirketimizden hisse almak istedi.`;
    case 'raid':
      return `${name} borsadan hissemizi topladı.`;
  }
}

/** Where we lead and how the big makers answered. */
export function RivalMovesPanel({ s }: { s: GameState }) {
  // Worked out once a month (the whole market is priced for it).
  const month = Math.floor(s.week / 4);
  const year = yearOf(s.week);
  const led = useMemo(() => ledSegments(s), [s, month]);
  const rank = useMemo(() => salesRank(s), [s, year]);
  const moves = [...(s.rivalMoves?.history ?? [])].reverse().slice(0, 8);
  const wars = s.rivalModels.filter((m) => m.active && m.priceCut && s.week < m.priceCut.until);
  return (
    <Panel
      title={
        <>
          Rakip hamleleri
          <Info>
            <p>Büyük üreticiler küçük bir yeni markayı umursamaz. Ama bir sınıfta onlardan fazla alıcı çekmeye ya da ülkede en çok satan olmaya başladığında karşılık verirler.</p>
            <p>Fiyat savaşı, sana karşı yapılmış yeni bir model, iki rakibin birleşmesi ve şirketinden hisse almaya kalkmak. En fazla yılda bir hamle gelir.</p>
          </Info>
        </>
      }
    >
      <p className="small">
        Ulusal sıran geçen yıl: <b>{rank < 99 ? `${rank}.` : '—'}</b>
        {led.length > 0 ? (
          <>
            {' '}
            · Önde olduğun sınıflar: <b>{led.map((x) => segmentDef(x).name.toLowerCase()).join(', ')}</b>. Rakipler bunu fark etti.
          </>
        ) : wars.length || (moves[0] && s.week - moves[0].week < 52) ? (
          <span className="muted"> · Şu an hiçbir sınıfta önde değilsin, ama rakiplerin son hamleleri sürüyor.</span>
        ) : (
          <span className="muted"> · Hiçbir sınıfta önde değilsin: büyük üreticiler seni henüz ciddiye almıyor.</span>
        )}
      </p>
      {wars.length > 0 && (
        <p className="note small">
          Süren fiyat savaşı: {[...new Set(wars.map((w) => `${rivalDef(w.companyId).name} (${segmentDef(w.segment).name.toLowerCase()})`))].join(', ')}, bitişi{' '}
          {formatDate(Math.max(...wars.map((w) => w.priceCut!.until)))}.
        </p>
      )}
      {moves.length ? (
        <ul className="small moves-list">
          {moves.map((m, i) => (
            <li key={i}>
              <span className="muted">{formatDate(m.week)}</span> · <b>{MOVE_NAMES[m.kind]}</b>: {moveText(m)}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Henüz bir karşılık gelmedi.</Empty>
      )}
    </Panel>
  );
}
