import { useMemo, useState } from 'react';
import { FIRSTS, MOVE_NAMES, ledSegments, salesRank } from '../../core/rivalMoves';
import { rivalDef } from '../../core/rivals';
import {
  FLOAT_STEPS,
  MAX_FLOAT,
  PAYOUT_STEPS,
  ULTIMATUM_AT,
  VETO_AT,
  WARNING_AT,
  boardOutlook,
  boardVeto,
  buyBack,
  buybackCost,
  buybackPremium,
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
import { lower, t } from '../../i18n';
import { store } from '../store';
import { dec, money, pct } from '../format';
import { Button, Choice, Empty, Info, Panel, Progress, Stat, Table } from './ui';
import { tx } from '../i18n';
import { Icon } from './Icon';

const signedPct = (v: number) => {
  const tenths = Math.abs(Math.round(v * 1000));
  return `${v >= 0 ? '+' : '−'}${pct(tenths / 1000, tenths % 10 ? 1 : 0)}`;
};

/** How the board judges the company: shown before the listing and on the board panel. */
function BoardRules() {
  return (
    <Info>
      <p>{t('Şirketin bir kısmını borsada satarak sermaye toplarsın; kontrol hep sende kalır (en fazla {share} satılabilir).', { share: pct(MAX_FLOAT, 0) })}</p>
      <p>
        {t(
          'Karşılığında her yıl yönetim kuruluna hesap verirsin. Ciro pazardan hızlı büyümeli (çok iyi bir yıldan sonra beklenti yükselir); hissedarlar kârın yarısını ve her yıl biraz daha fazla temettü ister. Temettü oranı %20 başlar: yükseltmek senin işin ve kasadan gerçek para çıkarır.',
        )}
      </p>
      <p>
        {t(
          'Büyüme hedefinde kâr da sayılır: ciro hedefin altında kalsa bile kâr en az hedef kadar büyüdüyse kurul yılı başarılı sayar. Pazar daralırken kurul ciro hedefini düşürür, temettü hedefini de aynı oranda. Hisse geri alınca ya da yeni hisse satınca o yılın temettü hedefi dışarıdaki paya göre yeniden hesaplanır.',
        )}
      </p>
      <p>
        {t(
          'Kurulun hafızası kısadır: iyi yılların kredisi her yıl yarıya iner. Ama adım adım sertleşir: güven {warn}’ın üstündeyken tek bir kötü yıl en fazla uyarı getirir. Güven {veto}’in altına inerse kurul yarışı, rakip satın almayı ve yeni hat kurmayı veto eder; {last}’in altında son uyarı gelir, sonra da tutmazsa görevden alınırsın ve oyun biter.',
          { warn: WARNING_AT, veto: VETO_AT, last: ULTIMATUM_AT },
        )}
      </p>
      <p>{t('Oyun sonu puanında şirket değerinin yalnızca senin payın sayılır. Borsanın havası fiyatı belirler: 1928’de satmak, 1932’de geri almak ucuzdur.')}</p>
    </Info>
  );
}

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
            {t('Borsa ve yönetim kurulu')}
            <BoardRules />
          </>
        }
      >
        <p className="muted small">
          {tx('Sermaye için hisse sat: kasaya büyük para girer, ama her yıl büyüme ve temettü hedefleri gelir. Borsa şu an <b>{mood}</b> (×{x}).', {
            mood: moodName(mood),
            x: dec(mood, 2),
          })}
        </p>
        {!can.ok ? (
          <p className="note">{can.why}</p>
        ) : (
          <>
            <Choice
              compact
              value={float}
              onChange={setFloat}
              options={FLOAT_STEPS.map((p) => ({ value: p, label: pct(p, 0), sub: money(issueProceeds(s, p)) }))}
            />
            <p>
              <Button
                kind="primary"
                onClick={() =>
                  store
                    .ask({
                      title: t('Halka arz edilsin mi?'),
                      body: t(
                        'Şirketin {share}’i satılır, kasaya {cash} girer (bankacıların payı düşülmüş). Bundan sonra her yıl yönetim kuruluna hesap verirsin. Hisseleri sonradan geri alabilirsin ama primli.',
                        { share: pct(float, 0), cash: money(issueProceeds(s, float)) },
                      ),
                      confirm: t('Halka arz et'),
                    })
                    .then((yes) => yes && store.try((st) => goPublic(st, float), t('Şirket borsada')))
                }
              >
                {t('Halka arz et')}
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
  const slice = Math.min(step, free);
  return (
    <Panel
      title={
        <>
          {t('Borsa ve yönetim kurulu')}
          <BoardRules />
        </>
      }
      className="board-panel"
    >
      <div className="stats-row">
        <Stat label={t('Dışarıdaki pay')} value={pct(sh.float, 0)} sub={t('senin payın {share}', { share: pct(1 - sh.float, 0) })} />
        <Stat label={t('Piyasa değeri')} value={money(cap)} sub={t('borsa {mood}', { mood: moodName(mood) })} />
        <Stat label={t('Ödenen temettü')} value={money(sh.dividends)} />
      </div>
      <p className="small">
        {tx('Yönetim kurulunun güveni <tone>{v}/100</tone>', { v: Math.round(sh.confidence) }, { tone: (c, k) => <b key={k} className={`tone-${tone}`}>{c}</b> })}
        {sh.ultimatum && <b className="tone-bad"> · {t('son uyarı: bu yıl hedefler tutmazsa görevden alınırsın')}</b>}
      </p>
      <Progress value={sh.confidence} max={100} tone={tone} />
      {out.judged ? (
        <ul className="small">
          <li className={out.growthOk ? 'tone-good' : 'tone-bad'}>
            {tx('Ciro hedefi {growth}: yıl sonunda en az <b>{needed}</b> (geçen yıl {prev}). Bu hızla yıl sonu tahmini <b>{projected}</b>.', {
              growth: signedPct(sh.target.growth),
              needed: money(out.needed),
              prev: money(out.prev),
              projected: money(out.projected),
            })}
            {out.neededProfit !== undefined && (
              <>
                {' '}
                {tx('Kâr da sayılır: yıl kârı en az <b>{needed}</b> olursa (geçen yıl {prev}) büyüme hedefi tutar. Kâr tahmini <b>{projected}</b>.', {
                  needed: money(out.neededProfit),
                  prev: money(out.prevProfit),
                  projected: money(out.profit),
                })}
              </>
            )}
          </li>
          <li className={out.dividendOk ? 'tone-good' : 'tone-bad'}>
            {tx('Temettü hedefi <b>{target}</b>. Bu oranla tahmini temettü <b>{dividend}</b> (yıllık kâr tahmini {profit}).', {
              target: money(out.targetDividend),
              dividend: money(out.dividend),
              profit: money(out.profit),
            })}
            {out.targetDividend < sh.target.dividend * 0.98 ? (
              <span className="muted">
                {' '}
                {t('Kurul {set} istiyordu, ama yılın kârının dörtte üçünden fazlasını istemez.', { set: money(sh.target.dividend) })}
              </span>
            ) : (
              sh.target.growth < 0 && (
                <span className="muted"> {t('Pazar daraldığı için kurul temettü hedefini de ciro hedefi kadar ({cut}) düşürdü.', { cut: pct(-sh.target.growth, 0) })}</span>
              )
            )}
          </li>
        </ul>
      ) : (
        <p className="small muted">{t('Yönetim kurulu seni ilk kez {year} sonunda değerlendirecek.', { year: sh.target.year })}</p>
      )}
      {veto && <p className="note tone-bad">{veto}</p>}
      <p className="small">
        {sh.seat
          ? t(
              'Temettü oranı (kârın dış hissedarlara düşen payından ne kadarı dağıtılır). Kurul kârın yarısını ve geçen yıldan biraz fazlasını bekliyor; rakip yönetimde olduğu için daha da fazlasını:',
            )
          : t('Temettü oranı (kârın dış hissedarlara düşen payından ne kadarı dağıtılır). Kurul kârın yarısını ve geçen yıldan biraz fazlasını bekliyor:')}
      </p>
      <Choice
        compact
        value={sh.payout}
        onChange={(v) => store.act((st) => setPayout(st, v))}
        options={PAYOUT_STEPS.map((p) => ({ value: p, label: pct(p, 0) }))}
      />
      {sh.raider && (
        <p className="note">
          {sh.seat
            ? t('{name} şirketin {share}’ini elinde tutuyor ve yönetim kurulunda oturuyor: hedefler daha sıkı.', {
                name: rivalDef(sh.raider.company).name,
                share: pct(sh.raider.stake, 0),
              })
            : t('{name} şirketin {share}’ini elinde tutuyor.', { name: rivalDef(sh.raider.company).name, share: pct(sh.raider.stake, 0) })}
        </p>
      )}
      <p className="small muted">
        {sh.ultimatum
          ? t('Geri alım piyasa fiyatının %10 fazlasına olur ve hisselerin satıldığı fiyatın (yılda %6 faiziyle) altına inmez; son uyarı altındayken bunun da %50 fazlası.')
          : t('Geri alım piyasa fiyatının %10 fazlasına olur ve hisselerin satıldığı fiyatın (yılda %6 faiziyle) altına inmez.')}{' '}
        {t('Alım fiyatı yükseltir: aynı yıl içinde geri alınan her %5, fiyatı yaklaşık %5 artırır.')}
        {free > 0.001 && <> {t('Sıradaki dilim piyasa fiyatının {premium} üstünde.', { premium: pct(buybackPremium(s, slice), 0) })}</>}
      </p>
      <div className="row board-actions">
        <Button
          small
          disabled={free <= 0.001 || s.company.cash < buybackCost(s, slice)}
          onClick={() => store.try((st) => buyBack(st, step), t('Hisseler geri alındı'))}
        >
          {t('{share} geri al ({cash})', { share: pct(slice, 0), cash: money(buybackCost(s, slice)) })}
        </Button>
        <Button
          small
          disabled={free <= 0.001 || s.company.cash < backAll}
          onClick={() =>
            store
              .ask({
                title: t('Bütün hisseler geri alınsın mı?'),
                body: sh.raider
                  ? t('Piyasadaki {share} {cash} karşılığında geri alınır. Rakibin bloğu satılık değil.', { share: pct(free, 0), cash: money(backAll) })
                  : t('Piyasadaki {share} {cash} karşılığında geri alınır. Yönetim kurulu dağılır, şirket yeniden tamamen senin olur.', {
                      share: pct(free, 0),
                      cash: money(backAll),
                    }),
                confirm: t('{cash} öde', { cash: money(backAll) }),
                danger: true,
              })
              .then((yes) => yes && store.try((st) => buyBack(st, 1), t('Hisseler geri alındı')))
          }
        >
          {t('Hepsini geri al ({cash})', { cash: money(backAll) })}
        </Button>
        <Button small disabled={sh.float + step > MAX_FLOAT + 1e-6} onClick={() => store.try((st) => issueShares(st, step), t('Yeni hisse satıldı'))}>
          {t('%5 yeni hisse sat (+{cash})', { cash: money(issueProceeds(s, step)) })}
        </Button>
      </div>
      {sh.history.length > 0 && (
        <Table
          head={[t('Yıl'), t('Ciro'), t('Temettü'), t('Güven')]}
          align={['l', 'r', 'r', 'r']}
          rows={[...sh.history]
            .reverse()
            .slice(0, 8)
            .map((b) => [
              <span key="y" className={b.met ? 'tone-good' : 'tone-bad'}>
                <Icon name={b.met ? 'check' : 'cross'} /> {b.year}
              </span>,
              <span key="g">
                {signedPct(b.growth)} <span className="muted small">/ {signedPct(b.targetGrowth)}</span>
                {b.profitGrowth !== undefined && b.growth < b.targetGrowth - 0.01 && b.profitGrowth >= b.targetGrowth - 0.01 && (
                  <span className="muted small"> · {t('kâr {growth}', { growth: signedPct(b.profitGrowth) })}</span>
                )}
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
  const seg = m.segment ? lower(t(segmentDef(m.segment).name)) : '';
  switch (m.kind) {
    case 'priceWar':
      return t('{name}, {seg} sınıfında fiyatlarını %15 indirdi.', { name, seg });
    case 'techLeap':
      return m.first
        ? t('{name}, {seg} sınıfının ilk {tech} arabasını çıkardı: {model}.', { name, seg, tech: t(FIRSTS[m.first].name), model: m.model ?? '' })
        : m.model
          ? t('{name}, {seg} sınıfına {model} ile saldırdı.', { name, seg, model: m.model })
          : t('{name}, {seg} sınıfına yeni bir model ile saldırdı.', { name, seg });
    case 'merger':
      return m.partner ? t('{name}, {partner} şirketini yuttu.', { name, partner: rivalDef(m.partner).name }) : t('{name}, bir rakibi şirketini yuttu.', { name });
    case 'bid':
      return t('{name} şirketimizden hisse almak istedi.', { name });
    case 'raid':
      return t('{name} borsadan hissemizi topladı.', { name });
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
          {t('Rakip hamleleri')}
          <Info>
            <p>{t('Büyük üreticiler küçük bir yeni markayı umursamaz. Ama bir sınıfta onlardan fazla alıcı çekmeye ya da ülkede en çok satan olmaya başladığında karşılık verirler.')}</p>
            <p>{t('Fiyat savaşı, sana karşı yapılmış yeni bir model, iki rakibin birleşmesi ve şirketinden hisse almaya kalkmak. En fazla yılda bir hamle gelir.')}</p>
          </Info>
        </>
      }
    >
      <p className="small">
        {rank < 99 ? tx('Ulusal sıran geçen yıl: <b>{rank}.</b>', { rank }) : tx('Ulusal sıran geçen yıl: <b>—</b>')}
        {led.length > 0 ? (
          <>
            {' '}
            · {tx('Önde olduğun sınıflar: <b>{segs}</b>. Rakipler bunu fark etti.', { segs: led.map((x) => lower(t(segmentDef(x).name))).join(', ') })}
          </>
        ) : wars.length || (moves[0] && s.week - moves[0].week < 52) ? (
          <span className="muted"> · {t('Şu an hiçbir sınıfta önde değilsin, ama rakiplerin son hamleleri sürüyor.')}</span>
        ) : (
          <span className="muted"> · {t('Hiçbir sınıfta önde değilsin: büyük üreticiler seni henüz ciddiye almıyor.')}</span>
        )}
      </p>
      {wars.length > 0 && (
        <p className="note small">
          {t('Süren fiyat savaşı: {wars}, bitişi {date}.', {
            wars: [...new Set(wars.map((w) => `${rivalDef(w.companyId).name} (${lower(t(segmentDef(w.segment).name))})`))].join(', '),
            date: formatDate(Math.max(...wars.map((w) => w.priceCut!.until))),
          })}
        </p>
      )}
      {moves.length ? (
        <ul className="small moves-list">
          {moves.map((m, i) => (
            <li key={i}>
              <span className="muted">{formatDate(m.week)}</span> · <b>{t(MOVE_NAMES[m.kind])}</b>: {moveText(m)}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{t('Henüz bir karşılık gelmedi.')}</Empty>
      )}
    </Panel>
  );
}
