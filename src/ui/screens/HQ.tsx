import * as N from '../../core/network';
import { CLASS_GAP_WARN, classGap, priceNow } from '../../core/market';
import { stateDef } from '../../data/states';
import { cityDef } from '../../data/cities';
import { engineersBusy, idleEngineers, idleReason } from '../../core/game';
import { engineerSalary } from '../../data/economy';
import { racingOutlook, racingPaused } from '../../core/racing';
import { lineReport } from '../../core/factory';
import { formatDate, formatShort, weekOfYear, yearFloat, yearOf } from '../../core/time';
import { boardOutlook, boardVeto } from '../../core/shares';
import { queueHold, researchDef, researchDefs, rivalAdoption, techState } from '../../core/research';
import { segmentDef } from '../../data/segments';
import type { CarModel, GameState, LogCategory } from '../../core/types';
import { useState } from 'react';
import { store, useGameState } from '../store';
import { dec, money, num, pct, pctOf, recentProfit, signedMoney } from '../format';
import { Badge, Button, Empty, Panel, Progress, Stat, Table } from '../components/ui';
import { LineChart } from '../viz/LineChart';
import { NewsArchive } from '../components/Newspaper';
import { PHASE_LABEL, projectProgress } from './Projects';
import { askCoverService, askSearchNeighbours } from './Markets';
import { TeamPanel } from '../components/TeamPanel';
import { devWeeksLeft } from '../../core/budget';
import { t, msg, list } from '../../i18n';

export function weeklySold(m: CarModel, weeks = 4) {
  const h = m.history.slice(-weeks);
  return h.length ? h.reduce((a, x) => a + x.sold, 0) / h.length : 0;
}

/** A to-do line: what to look at, and maybe a button that does it at once. */
interface Step {
  text: string;
  go?: () => void;
  fix?: { label: string; run: () => void };
}

function nextSteps(s: GameState): Step[] {
  const out: Step[] = [];
  /** A network that eats half the revenue: said near the top, it can sink the company. */
  let heavy: Step | undefined;
  if (!s.projects.length && !s.models.some((m) => m.status === 'active')) {
    out.push({ text: t('İlk aracını tasarla: yeni bir proje başlat.'), go: () => store.go({ id: 'projects' }) });
  }
  for (const p of s.projects) {
    if (p.phase === 'design') out.push({ text: t('{name}: tasarımı bitir ve geliştirmeyi başlat.', { name: p.name }), go: () => store.go({ id: 'project', projectId: p.id }) });
    // A long development with a small team: say how much sooner more engineers would finish it.
    const left = devWeeksLeft(s, p);
    const faster = devWeeksLeft(s, p, 5);
    if (left >= 26 && faster <= left * 0.75)
      out.push({
        text: t('{name} geliştirmesi ~{left} hafta sürecek; 5 mühendis daha alırsan ~{n} hafta. Mühendisleri bu sayfadaki “Mühendislik ekibi” kutusundan al.', {
          name: p.name,
          left,
          n: faster,
        }),
      });
    if (p.phase === 'development' && p.dev.done >= p.dev.required) out.push({ text: t('{name}: geliştirme bitti, teste geç.', { name: p.name }), go: () => store.go({ id: 'project', projectId: p.id }) });
    if (p.phase === 'production' && p.productionReadyWeek === undefined) out.push({ text: t('{name}: tedarikçileri ve üretim hattını seç.', { name: p.name }), go: () => store.go({ id: 'project', projectId: p.id }) });
    if (p.phase === 'ready') out.push({ text: t('{name}: lansman zamanı!', { name: p.name }), go: () => store.go({ id: 'project', projectId: p.id }) });
  }
  for (const m of s.models.filter((x) => x.status === 'active')) {
    const lines = s.lines.filter((l) => l.modelId === m.id);
    // With no line and nothing left in stock the model only occupies the list: offer to retire it.
    if (!lines.length && m.inventory < 1)
      out.push({ text: t('{name} artık üretilmiyor ve stoku bitti. Üretimden kaldır ya da bir hatta ata.', { name: m.name }), go: () => store.go({ id: 'model', modelId: m.id }) });
    else if (!lines.length) out.push({ text: t('{name} hiçbir hatta üretilmiyor; stoktan satılıyor.', { name: m.name }), go: () => store.go({ id: 'factory' }) });
    const demand = Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
    const cap = lines.reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0) * m.productionRate;
    if (lines.length && demand > cap * 1.25 && m.inventory < cap) out.push({ text: t('{name} için talep üretimi aşıyor. Darboğazı çöz ya da hat ekle.', { name: m.name }), go: () => store.go({ id: 'factory' }) });
    if (m.inventory > Math.max(8, demand * 12)) out.push({ text: t('{name} stokları birikiyor. Fiyatı ya da üretim hızını düşür.', { name: m.name }), go: () => store.go({ id: 'model', modelId: m.id }) });
    // A price far above its class with buyers staying away (an old index, a hopeful launch price).
    const gap = classGap(priceNow(m, s.week), m.segment, yearFloat(s.week));
    if (gap > CLASS_GAP_WARN && lines.length && demand < 0.8 * cap)
      out.push({ text: t('{name} fiyatı sınıfın {gap} üstünde ve hatlar boş kalıyor. Fiyatı gözden geçir.', { name: m.name, gap: pct(gap, 0) }), go: () => store.go({ id: 'model', modelId: m.id }) });
    if ((s.week - m.refreshWeek) / 52 > 3)
      out.push({
        text: t('{name} {n} yaşında ve her yıl eskiyor; makyaj ya da yeni kuşak düşün.', { name: m.name, n: Math.floor((s.week - m.refreshWeek) / 52) }),
        go: () => store.go({ id: 'model', modelId: m.id }),
      });
  }
  // The network: grow while it is small, look after the cars on the road, keep its cost in check.
  if (s.models.some((m) => m.status === 'active')) {
    const yf = yearFloat(s.week);
    const toMap = () => store.go({ id: 'markets' });
    const open = N.openStates(s).length;
    const active = N.activeSearches(s);
    const free = N.maxSearches(s) - active;
    const next = N.nextSearches(s, yf);
    // Nudge when no search runs, or when several could run at once and do not.
    if (next.length && (active === 0 || free >= 2)) {
      const p = { n: open, max: N.maxSearches(s), active };
      out.push({
        text:
          open === 1
            ? t('Arabaların yalnızca fabrikanın eyaletinde satılıyor. Haritadan komşu bir eyalette bayi ara.')
            : active === 0
              ? t('Şu an hiçbir eyalette bayi aranmıyor ({n} eyalette satış var). Haritadan yeni bir eyalete açıl.', p)
              : t('Aynı anda {max} eyalette bayi aranabilir, şu an {active} arama sürüyor ({n} eyalette satış var). Yeni eyaletlere açıl.', p),
        go: toMap,
        fix: { label: t('Komşularda bayi ara'), run: () => askSearchNeighbours(s) },
      });
    }
    const target = N.serviceTarget(s);
    const poor = N.underServed(s, yf, 0.7).slice(0, 3);
    if (poor.length) {
      const plan = N.servicePlan(s, yf);
      const p = { parc: num(N.totalParc(s)), shops: num(N.totalService(s)), n: plan.count, states: list(poor.map((id) => stateDef(id).name)), target: pct(target, 0) };
      const auto = s.network?.autoService;
      out.push({
        text:
          target < 1
            ? auto
              ? t('Servis yetmiyor: {parc} araban için {shops} servis atölyesi var, {target} servis hedefi için ~{n} tane daha gerekiyor. En kötüleri: {states}. Otomatik servis kasa yettikçe açıyor.', p)
              : t('Servis yetmiyor: {parc} araban için {shops} servis atölyesi var, {target} servis hedefi için ~{n} tane daha gerekiyor. En kötüleri: {states}. Sahipler bekliyor, arabalar erken hurdaya çıkıyor.', p)
            : auto
              ? t('Servis yetmiyor: {parc} araban için {shops} servis atölyesi var, ~{n} tane daha gerekiyor. En kötüleri: {states}. Otomatik servis kasa yettikçe açıyor.', p)
              : t('Servis yetmiyor: {parc} araban için {shops} servis atölyesi var, ~{n} tane daha gerekiyor. En kötüleri: {states}. Sahipler bekliyor, arabalar erken hurdaya çıkıyor.', p),
        go: toMap,
        fix: plan.count ? { label: t('Servisi yetir'), run: () => askCoverService(s) } : undefined,
      });
    }
    // The network's cost less what its shops take in for parts and repairs.
    const cost = N.networkWeekly(s, yf);
    const parts = N.partsWeekly(s, yf);
    const books = s.finance.slice(-52);
    const yearRevenue = books.reduce((a, f) => a + f.revenue, 0);
    const revenue = s.finance.slice(-13).reduce((a, f) => a + f.revenue, 0) / 13;
    const bill = { cost: money(cost * 52), parts: money(parts * 52) };
    if (books.length >= 26 && yearRevenue > 0 && (cost - parts) * 52 > yearRevenue * 0.5) {
      // Half of what the company takes in goes to the network: a lower service target is the quickest cut.
      const lower = N.SERVICE_TARGETS.find((v) => v < target);
      const q = { ...bill, share: pctOf(((cost - parts) * 52) / yearRevenue), target: pct(lower ?? target, 0) };
      heavy = {
        text:
          lower !== undefined
            ? t('Bayi ve servis ağı yılda {cost} tutuyor, parça ve tamir {parts} getiriyor: net gideri son bir yılın cirosunun {share}. Şirket bu yükü uzun taşıyamaz: servis hedefini {target} yapmak atölyeleri ve genel gideri azaltır.', q)
            : t('Bayi ve servis ağı yılda {cost} tutuyor, parça ve tamir {parts} getiriyor: net gideri son bir yılın cirosunun {share}. Servis hedefi zaten en düşükte ({target}): az satan bayileri kapat.', q),
        go: toMap,
        fix: lower !== undefined ? { label: t('Servis hedefi {target}', q), run: () => store.act((st) => N.setServiceTarget(st, lower)) } : undefined,
      };
    } else if (revenue > 0 && cost - parts > revenue * 0.12)
      out.push({
        text:
          parts > 0
            ? t('Bayi ve servis ağı yılda {cost} tutuyor, parça ve tamir {parts} getiriyor: net gideri satış gelirinin {share}. Az satan bayileri kapatmayı düşün.', { ...bill, share: pctOf((cost - parts) / revenue) })
            : t('Bayi ve servis ağının gideri satış gelirinin {share}’i: az satan bayileri kapatmayı düşün.', { share: pct(cost / revenue, 0) }),
        go: toMap,
      });
  }
  // The board: say it early when this year's targets are slipping.
  const board = boardOutlook(s);
  if (s.shares && board?.judged && weekOfYear(s.week) >= 13) {
    const short = [board.growthOk ? '' : t('ciro'), board.dividendOk ? '' : t('temettü')].filter(Boolean);
    if (short.length) {
      const p = { year: s.shares.target.year, what: list(short), trust: Math.round(s.shares.confidence) };
      out.push({
        text: s.shares.ultimatum
          ? t('Yönetim kurulunun {year} hedefleri tutmayacak gibi ({what}). Güven {trust}/100: son uyarı.', p)
          : t('Yönetim kurulunun {year} hedefleri tutmayacak gibi ({what}). Güven {trust}/100.', p),
        go: () => store.go({ id: 'company' }),
      });
    }
  }
  const veto = boardVeto(s);
  if (veto) out.push({ text: veto, go: () => store.go({ id: 'company' }) });
  // Research standing idle while rivals already build with technology the company has not learned.
  const r = s.research;
  const hold = queueHold(s, yearFloat(s.week));
  if (r && r.active.length === 0 && hold?.reason === 'cash')
    out.push({
      text: t('Ar-Ge sırası bekliyor: {tech}, serbest kasanın yarısından pahalı (sıra fabrikanın parasına dokunmaz). Elle başlatabilir ya da kasanın birikmesini bekleyebilirsin.', {
        tech: t(researchDef(hold.id)?.name ?? ''),
      }),
      go: () => store.go({ id: 'research' }),
    });
  else if (r && r.active.length === 0 && !r.queue?.length && s.models.length) {
    const yf = yearFloat(s.week);
    const adoption = rivalAdoption(s);
    const behind = researchDefs().filter((d) => techState(s, d.id, yf) === 'available' && (adoption[d.id] ?? 0) >= 0.25);
    if (behind.length)
      out.push({
        text: t('Ar-Ge boşta. Rakiplerin çoğu kullanıyor, sen bilmiyorsun: {techs}.', {
          techs: behind
            .slice(0, 3)
            .map((d) => t(d.name))
            .join(', '),
        }),
        go: () => store.go({ id: 'research' }),
      });
  }
  // A racing team burning money with a car that cannot win.
  const rt = s.racing;
  if (rt?.level && !racingPaused(s.company.hq, yearFloat(s.week))) {
    const o = racingOutlook(s, rt.level);
    if (o && (o.podium < 0.2 || (rt.dry ?? 0) >= 2))
      out.push({
        text: t('Yarış takımı {model} ile yarışıyor ({n} yaşında, ilk üç şansı {podium}): bütçe boşa gidiyor. Daha güçlü bir araba çıkar ya da takımı küçült.', {
          model: o.model,
          n: Math.floor(o.age),
          podium: pct(o.podium, 0),
        }),
        go: () => store.go({ id: 'company' }),
      });
  }
  // Engineers on salary with nothing to do.
  const idle = idleEngineers(s);
  if (idle > 0 && s.models.length)
    out.push({
      text: t('{n} mühendis boşta ({reason}) ama haftada {pay} maaş alıyor: yeni bir proje ya da Ar-Ge başlat, gerekirse bir kısmını çıkar.', {
        n: idle,
        reason: idleReason(s),
        pay: money(idle * engineerSalary(yearFloat(s.week))),
      }),
      go: () => store.go({ id: 'research' }),
    });
  if (heavy) out.unshift(heavy);
  if (s.company.cash < 0) out.unshift({ text: t('Kasa ekside! Kredi al ya da masrafları kıs.'), go: () => store.go({ id: 'finance' }) });
  return out.slice(0, 6);
}

const FEED_TABS: { id: 'all' | LogCategory; label: string }[] = [
  { id: 'company', label: msg('Şirketim') },
  { id: 'buyers', label: msg('Müşteriler') },
  { id: 'rival', label: msg('Rakipler') },
  { id: 'tech', label: msg('Teknoloji') },
  { id: 'all', label: msg('Tümü') },
];

/** The news feed, by subject; the company's bad news of the last two months stays pinned on top. */
function NewsFeed() {
  const s = useGameState();
  const [tab, setTab] = useState<'all' | LogCategory>('company');
  const all = [...s.log].reverse();
  const pinned = all.filter((l) => (l.cat ?? 'company') === 'company' && l.tone === 'bad' && s.week - l.week <= 8).slice(0, 3);
  const list = all.filter((l) => !pinned.includes(l) && (tab === 'all' || (l.cat ?? 'company') === tab)).slice(0, 14);
  return (
    <Panel title={t('Haberler ve raporlar')}>
      <div className="tabs feed-tabs" role="tablist">
        {FEED_TABS.map((ft) => (
          <button key={ft.id} type="button" role="tab" aria-selected={tab === ft.id} className={`tab ${tab === ft.id ? 'is-on' : ''}`} onClick={() => setTab(ft.id)}>
            {t(ft.label)}
          </button>
        ))}
      </div>
      <ul className="news">
        {pinned.map((l, i) => (
          <li key={`p${i}`} className="news-bad is-pinned">
            <span className="news-date">📌 {formatDate(l.week)}</span>
            <span>{l.text}</span>
          </li>
        ))}
        {list.map((l, i) => (
          <li key={i} className={`news-${l.tone}`}>
            <span className="news-date">{formatDate(l.week)}</span>
            <span>{l.text}</span>
          </li>
        ))}
        {!list.length && !pinned.length && <li className="muted">{t('Bu başlıkta haber yok.')}</li>}
      </ul>
    </Panel>
  );
}

export function HQ() {
  const s = useGameState();
  const year = yearOf(s.week);
  const thisYear = s.models.reduce((a, m) => a + m.history.filter((h) => yearOf(h.week) === year).reduce((b, h) => b + h.sold, 0), 0);
  const weekly = recentProfit(s, 4);
  const active = s.models.filter((m) => m.status === 'active');
  const steps = nextSteps(s);
  const weeks = Math.min(104, s.week);
  const series = active.slice(0, 4).map((m, i) => {
    const pts = m.history.slice(-weeks).map((h) => ({ x: h.week, y: h.sold }));
    return { id: m.id, name: m.name, color: `var(--series-${i + 1})`, points: pts };
  });

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>{t('Merkez')}</h1>
        <p className="muted">{formatDate(s.week)} · {cityDef(s.company.city).name}</p>
      </div>
      <div className="stats-row">
        <Stat
          label={t('Kasa')}
          value={money(s.company.cash)}
          tone={s.company.cash < 0 ? 'bad' : undefined}
          sub={s.company.loan > 0 ? t('Kredi: {loan}', { loan: money(s.company.loan) }) : undefined}
        />
        <Stat label={t('Haftalık kâr')} value={signedMoney(weekly)} tone={weekly < 0 ? 'bad' : 'good'} sub={t('son 4 hafta ort.')} />
        <Stat label={t('{year} satışı', { year })} value={num(thisYear)} sub={t('araç')} />
        <Stat label={t('İtibar')} value={Math.round(s.company.reputation)} sub="/ 100" />
        <Stat
          label={t('Mühendis')}
          value={`${engineersBusy(s)}/${s.company.engineers}`}
          tone={idleEngineers(s) > 0 && s.models.length ? 'bad' : undefined}
          sub={idleEngineers(s) > 0 ? t('{n} kişi boşta', { n: idleEngineers(s) }) : t('projede · beceri {skill}', { skill: Math.round(s.company.skill) })}
        />
      </div>

      <div className="grid-2">
        <Panel title={t('Yapılacaklar')}>
          {steps.length ? (
            <ul className="todo">
              {steps.map((step, i) => (
                <li key={i}>
                  <span>{step.text}</span>
                  {(step.fix || step.go) && (
                    <span className="todo-actions">
                      {step.fix && (
                        <Button small kind="primary" onClick={step.fix.run}>
                          {step.fix.label}
                        </Button>
                      )}
                      {step.go && (
                        <Button small onClick={step.go}>
                          {t('Git')}
                        </Button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t('Her şey yolunda. Zamanı ilerlet (boşluk tuşu) ya da yeni bir proje düşün.')}</Empty>
          )}
        </Panel>

        <div className="hq-side">
        <Panel title={t('Projeler')} actions={<Button small onClick={() => store.go({ id: 'projects' })}>{t('Tümü')}</Button>}>
          {s.projects.length ? (
            <div className="mini-list">
              {s.projects.map((p) => (
                <button key={p.id} type="button" className="mini-item" onClick={() => store.go({ id: 'project', projectId: p.id })}>
                  <div className="mini-top">
                    <b>{p.name}</b>
                    <Badge tone="info">{t(PHASE_LABEL[p.phase])}</Badge>
                  </div>
                  <Progress value={projectProgress(s, p)} />
                </button>
              ))}
            </div>
          ) : (
            <Empty>
              {t('Aktif proje yok.')}{' '}
              <Button small kind="primary" onClick={() => store.go({ id: 'projects' })}>
                {t('Yeni proje')}
              </Button>
            </Empty>
          )}
        </Panel>
        <TeamPanel compact />
        </div>
      </div>

      <Panel title={t('Satıştaki modeller')} actions={<Button small onClick={() => store.go({ id: 'models' })}>{t('Ayrıntılar')}</Button>}>
        {active.length ? (
          <>
            <Table
              head={[t('Model'), t('Segment'), t('Haftalık satış'), t('Stok'), t('Fiyat'), t('Dergi')]}
              align={['l', 'l', 'r', 'r', 'r', 'r']}
              rows={active.map((m) => [
                <button key="n" type="button" className="link" onClick={() => store.go({ id: 'model', modelId: m.id })}>
                  {m.name}
                </button>,
                t(segmentDef(m.segment).name),
                dec(weeklySold(m), 1),
                num(m.inventory),
                money(m.price),
                dec(m.reviewScore, 1),
              ])}
            />
            <LineChart
              series={series}
              height={180}
              xFormat={(w) => formatShort(Math.round(w))}
              yFormat={(v) => dec(v, v < 10 ? 1 : 0)}
              yLabel={t('Haftalık satış (araç)')}
              ariaLabel={t('Modellerin haftalık satış grafiği')}
            />
          </>
        ) : (
          <Empty>{t('Henüz satışta bir modelin yok.')}</Empty>
        )}
      </Panel>

      <Panel title={t('Gazete arşivi')}>
        <NewsArchive />
      </Panel>
      <NewsFeed />
    </div>
  );
}
