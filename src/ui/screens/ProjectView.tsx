import { useState, type ReactNode } from 'react';
import * as A from '../../core/actions';
import { credit, dealerUpkeep, gates, materialUnitCost, protoUnitCost } from '../../core/game';
import { lineReport, lineUpkeep, reservedLines, suggestedLine, turnkeyLineCost, workshopLineCost } from '../../core/factory';
import {
  MARKET_IDS,
  PRICE_OVER_FROM,
  demandAtPrice,
  lastingDemandAtPrice,
  modelAgeYears,
  referencePrice,
  segmentMarket,
  steepPriceRatio,
  weeklySegmentDemand,
} from '../../core/market';
import { AREA_NAMES, SEVERITY_NAMES, SUPPLIERS, TESTS, defectRange, defectText, expectedRemaining, inhouseParity, partsVsQuality, riskLabel, testTuning, testWeekCost, type Tuning } from '../../core/testing';
import { scoreStats } from '../../core/scoring';
import { yearFloat } from '../../core/time';
import { DEALER_COMMISSION, costIndex, engineerSalary, lineBuildWeeks, overhead, shopCost } from '../../data/economy';
import { MARKETS } from '../../data/markets';
import * as N from '../../core/network';
import { ATTRS, ATTR_NAMES } from '../../data/segments';
import { STAGES } from '../../data/stations';
import { TOOLING, toolingDef } from '../../data/tooling';
import type { ComponentKey, GameState, MarketId, Project, ProjectPhase, StageId, TestId, ToolingTier } from '../../core/types';
import { lower, msg, t } from '../../i18n';
import { store, useGameState } from '../store';
import { dec, money, num, pct as percent, pctOf, recentProfit } from '../format';
import { inYear } from '../format';
import { tx } from '../i18n';
import { pctWith } from '../../core/turkish';
import { Badge, Button, Choice, NumberInput, Panel, Progress, Slider, Toggle, SegmentLabel } from '../components/ui';
import { newEstimate } from '../../core/estimate';
import { devWeeksLeft, launchBudget } from '../../core/budget';
import { classGap, gapNames, researcherSalary } from '../../core/research';
import { BudgetLine } from '../components/BudgetLine';
import { StatsPanel, useCarStats } from '../components/StatsPanel';
import { Designer } from './Designer';
import { DevBar, FocusPanel } from './DevPanel';
import { Icon } from '../components/Icon';

const STEPS: { label: string; phases: ProjectPhase[] }[] = [
  { label: msg('Tasarım ve geliştirme'), phases: ['design', 'development'] },
  { label: msg('Test'), phases: ['testing'] },
  { label: msg('Üretim hazırlığı'), phases: ['production'] },
  { label: msg('Lansman'), phases: ['ready'] },
];

export function ProjectView({ projectId }: { projectId: string }) {
  const s = useGameState();
  const p = s.projects.find((x) => x.id === projectId)!;
  const idx = STEPS.findIndex((x) => x.phases.includes(p.phase));
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <button type="button" className="link small" onClick={() => store.go({ id: 'projects' })}>
            ← {t('Projeler')}
          </button>
          <h1>
            {p.phase === 'design' ? (
              <input className="title-input" value={p.name} maxLength={24} aria-label={t('Model adı')} onChange={(e) => store.act((st) => A.renameProject(st, p.id, e.target.value))} />
            ) : (
              p.name
            )}
          </h1>
          <p className="muted">
            <SegmentLabel id={p.segment} />
            {p.kind === 'facelift' ? ` · ${t('makyaj projesi')}` : p.replacesModelId ? ` · ${t('yeni kuşak')}` : ''}
          </p>
        </div>
        <Button
          kind="danger"
          small
          onClick={async () => {
            const ok = await store.ask({
              title: t('{name} iptal edilsin mi?', { name: p.name }),
              body: t('Bu projeye harcanan para geri gelmez.'),
              confirm: t('Projeyi iptal et'),
              danger: true,
            });
            if (ok) {
              store.act((st) => A.cancelProject(st, p.id));
              store.go({ id: 'projects' });
            }
          }}
        >
          {t('Projeyi iptal et')}
        </Button>
      </div>
      <ol className="stepper">
        {STEPS.map((st, i) => (
          <li key={st.label} className={i < idx ? 'is-done' : i === idx ? 'is-on' : ''}>
            {t(st.label)}
          </li>
        ))}
      </ol>
      <NextStep p={p} />
      {(p.phase === 'design' || p.phase === 'development') && (
        <>
          <DevBar project={p} />
          {/* The brief first: what the engineers should work on, then the car itself. */}
          <FocusPanel project={p} />
          {p.kind === 'facelift' && <FaceliftGain p={p} />}
          <Designer project={p} readOnly={p.phase === 'development'} />
        </>
      )}
      {p.phase === 'testing' && <Testing p={p} />}
      {p.phase === 'testing' && p.kind === 'facelift' && <FaceliftGain p={p} />}
      {p.phase === 'production' && <Production key={p.id} p={p} />}
      {p.phase === 'ready' && (s.lines.some((l) => l.id === p.lineId) ? <Launch key={p.id} p={p} /> : <NoLine p={p} />)}
    </div>
  );
}

/**
 * Something to decide the price with: what rivals charge, and what demand and
 * weekly profit the engineers expect at a few prices (as a range, since how
 * buyers will like the car is only known at launch).
 */
function PriceGuide(props: { p: Project; price: number; setPrice: (v: number) => void; markets: MarketId[]; cap: number; unit: number; labour: number }) {
  const { p, price, setPrice, markets, cap, unit, labour } = props;
  const s = useGameState();
  const yf = yearFloat(s.week);
  const ref = referencePrice(s.company.hq, p.segment, yf);
  const est = p.estimate;
  const avgW = est ? ATTRS.reduce((a, k) => a + est.width[k], 0) / ATTRS.length : 6;
  const spread = Math.exp((0.6 * avgW) / 7);
  const demandAt = (pr: number) => {
    const pm = A.previewModel(s, p, pr, markets);
    return markets.reduce((a, mk) => a + demandAtPrice(s, pm, mk, pr), 0);
  };
  // Once the launch buzz has faded (about half of it goes in half a year): what lines are built for, as the
  // capacity planner and automatic capacity count.
  const lastingAt = (pr: number) => {
    const pm = A.previewModel(s, p, pr, markets);
    return markets.reduce((a, mk) => a + lastingDemandAtPrice(s, pm, mk, pr), 0);
  };
  // What a car brings once the dealer's cut and the average freight are paid.
  const net = 1 - DEALER_COMMISSION - N.avgFreightPerCar(s, yf) / Math.max(1, price);
  const rivalPrices = segmentMarket(s, s.company.hq, p.segment)
    .offers.filter((o) => o.kind === 'rival')
    .map((o) => o.price)
    .sort((a, b) => a - b);
  // Without a line (or one still being built) every car the buyers want is counted.
  const noLine = cap <= 0.01;
  const segWeekly = markets.reduce((a, mk) => a + weeklySegmentDemand(mk, p.segment, yf), 0);
  const d = demandAt(price);
  const lo = d / spread;
  const hi = d * spread;
  const dl = lastingAt(price);
  // Judged on the middle estimate (the range is wide enough to cover almost any line) of the demand that
  // lasts: a line built for the launch buzz stands half empty once it has passed.
  const verdict = noLine
    ? t('Hattın kapasitesi henüz belli değil: kâr, talebin tamamı üretilir diye hesaplandı.')
    : dl > cap * 1.2
      ? t('Heyecan geçince de talep hattın {x} katı: fiyatı biraz yükseltebilir ya da kapasite ekleyebilirsin.', { x: dec(dl / Math.max(0.1, cap), 1) })
      : dl < cap * 0.8
        ? t('Heyecan geçince hat talebin {x} katını üretebilir: fiyatı düşürmeyi ya da daha küçük bir hattı düşün.', { x: dec(cap / Math.max(0.1, dl), 1) })
        : d > cap * 1.2
          ? t('İlk aylarda talep hattı aşar, ama heyecan geçince talep ve kapasite dengeli: bunun için hat ekleme.')
          : t('Orta tahmine göre talep ve kapasite dengeli.');
  const weeklyProfit = (pr: number) => (noLine ? demandAt(pr) : Math.min(demandAt(pr), cap)) * (pr * net - unit - labour);
  // The price that earns most per week with this line (demand beyond the line's output is not sold).
  let best = ref;
  let bestProfit = -Infinity;
  for (let f = 0.7; f <= 2.21; f += 0.05) {
    const pr = Math.round((ref * f) / 10) * 10;
    const pf = weeklyProfit(pr);
    if (pf > bestProfit) {
      best = pr;
      bestProfit = pf;
    }
  }
  // A small line pushes the best price up and sales down, and a car that dear cannot grow. With lines
  // enough for every buyer (the factory can add them): the price that earns most on the demand that lasts.
  let open = ref;
  let openProfit = -Infinity;
  let openDemand = 0;
  for (let f = 0.7; f <= 2.21; f += 0.05) {
    const pr = Math.round((ref * f) / 10) * 10;
    const dm = lastingAt(pr);
    const pf = dm * (pr * net - unit - labour);
    if (pf > openProfit) {
      open = pr;
      openProfit = pf;
      openDemand = dm;
    }
  }
  // Shown when the line is what holds the best price up: at that price buyers want more than it builds.
  const lineBinds = !noLine && openProfit > 0 && openDemand > cap * 1.05 && Math.abs(open - best) / best >= 0.03;
  const lineTooSmall = lineBinds && openDemand > cap * 1.5 && openProfit > bestProfit * 1.3;
  const base = [0.85, 1, 1.15, 1.3, 1.5].map((f) => Math.round((ref * f) / 10) * 10);
  const options = [...base];
  for (const x of lineBinds ? [best, open] : [best]) if (!options.some((y) => Math.abs(y - x) / x < 0.03)) options.push(x);
  options.sort((a, b) => a - b);
  const nearest = (x: number) => options.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
  const bestShown = nearest(best);
  const openShown = nearest(open);
  const steep = steepPriceRatio(p.segment, s.company.hq, yf);
  // At the share cap a price under the class brings no more buyers: those left never see the showroom.
  const atClass = demandAt(base[1]);
  const nearCap = atClass > 0.05 && demandAt(base[0]) < atClass * 1.1;
  const pct = (pr: number) => {
    const v = Math.round((pr / ref - 1) * 100);
    return v < 0 ? `−${percent(-v / 100, 0)}` : `+${percent(v / 100, 0)}`;
  };
  return (
    <div className="price-guide">
      <h4>{t('Fiyat rehberi')}</h4>
      {rivalPrices.length > 0 && (
        <p className="small">
          {t('Rakiplerin alıcı fiyatları: en ucuz {low} · ortanca {mid} · en pahalı {high}.', {
            low: money(rivalPrices[0]),
            mid: money(rivalPrices[Math.floor(rivalPrices.length / 2)]),
            high: money(rivalPrices[rivalPrices.length - 1]),
          })}
        </p>
      )}
      <p className="small">
        {segWeekly > 0
          ? tx('Bu fiyatta tahmini talep: ilk ay <b>{lo}–{hi} araç/hafta</b> (sınıfın ~{share}), heyecan geçince <b>{llo}–{lhi}</b> (~{lasting}) · hat {cap} araç/hafta.', {
              lo: dec(lo, 1),
              hi: dec(hi, 1),
              share: pctWith(d / segWeekly, 'poss'),
              llo: dec(dl / spread, 1),
              lhi: dec(dl * spread, 1),
              lasting: percent(dl / segWeekly, dl / segWeekly < 0.05 ? 1 : 0),
              cap: dec(cap, 1),
            })
          : tx('Bu fiyatta tahmini talep: ilk ay <b>{lo}–{hi} araç/hafta</b>, heyecan geçince <b>{llo}–{lhi}</b> · hat {cap} araç/hafta.', {
              lo: dec(lo, 1),
              hi: dec(hi, 1),
              llo: dec(dl / spread, 1),
              lhi: dec(dl * spread, 1),
              cap: dec(cap, 1),
            })}{' '}
        {verdict}
        {segWeekly > 0 &&
          d / segWeekly > 0.4 &&
          ` ${t('Sınıfın bu kadarını tek bir araba nadiren alır: bayiler, üretim ve rakiplerin yanıtı payı sınırlar; tahmini iyimser say.')}`}
      </p>
      {lineTooSmall && (
        <p className="note small">
          {tx(
            '<b>Hat küçük.</b> “Bu hatla en kârlı” fiyat hattın az üretmesinden yüksek çıkıyor. Hat eklersen en kârlı fiyat {price}: heyecan geçince talep ~{demand} araç/hf, ona yetecek hatlarla haftada ~{profit} brüt kâr kalır (bu hatla en iyisi {best}). Fabrika’dan hat kur ya da büyüt; “talebi otomatik karşıla” da kasa yettikçe büyütür.',
            { price: money(open), demand: dec(openDemand, 0), profit: money(openProfit), best: money(bestProfit) },
          )}
        </p>
      )}
      <table className="table compact">
        <thead>
          <tr>
            <th>{t('Fiyat')}</th>
            <th className="al-r">{t('Talep (orta)')}</th>
            <th className="al-r">{t('Haftalık brüt kâr')}</th>
          </tr>
        </thead>
        <tbody>
          {options.map((pr) => {
            const dm = demandAt(pr);
            const profit = weeklyProfit(pr);
            return (
              <tr key={pr} className={Math.abs(pr - price) < 5 ? 'is-mine' : ''}>
                <td>
                  <button type="button" className="link-btn" onClick={() => setPrice(pr)}>
                    {money(pr)}
                  </button>{' '}
                  <span className="muted small">
                    {pr === Math.round(ref / 10) * 10 ? t('sınıf fiyatı') : pct(pr)}
                    {pr === bestShown && bestProfit > 0 && <b className="tone-good"> · {noLine ? t('en kârlı') : t('bu hatla en kârlı')}</b>}
                    {lineBinds && pr === openShown && <b className="tone-good"> · {t('hat eklersen en kârlı (~{profit}/hf)', { profit: money(openProfit) })}</b>}
                    {pr > ref * steep && ` · ${t('dergiler “iddialı” der')}`}
                  </span>
                </td>
                <td className="al-r">{dec(dm, 1)}</td>
                <td className={`al-r ${profit < 0 ? 'tone-bad' : ''}`}>{money(profit)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {nearCap && (
        <p className="note small">
          {tx(
            '<b>Tavana yakınsın:</b> araba bayilerinin ulaştığı alıcılardan alabileceği payı zaten alıyor, sınıf fiyatının altına inmek satış getirmez, yalnız kâr götürür. Payı bayi ağı ve itibar büyütür.',
          )}
        </p>
      )}
      <p className="muted small">
        {t(
          'Alıcılar sınıf fiyatının {over} üstünden sonra çok daha hızlı kaçar. Dergiler fiyatı sınıfa göre tartar: sınıf fiyatının üstüne çıktıkça puan azar azar düşer, bu sınıfta {steep} üstünde “iddialı” derler; düşük puan lansman kalabalığını da küçültür. Ucuz başlayıp sonra zam yapmak işe yaramaz: lansmandan sonraki üç yılda {hike}’den büyük bir zam dergilerin yeniden yazmasına ve itibar kaybına yol açar.',
          { over: percent(PRICE_OVER_FROM, 0), steep: percent(steep - 1, 0), hike: percent(A.HIKE_TOLERANCE, 0) },
        )}
      </p>
    </div>
  );
}

/**
 * What a facelift really brings, before it is started: buyers a week now and after it (as if it were on
 * sale today, with the current brief), and how old the car looks to buyers.
 */
function FaceliftGain({ p }: { p: Project }) {
  const s = useGameState();
  const o = A.faceliftOutlook(s, p);
  const m = s.models.find((x) => x.id === p.replacesModelId);
  if (!o || !m) return null;
  // Development, the planned tests and the three-week changeover.
  const testsLeft = Math.max(0, ...TESTS.map((x) => p.tests[x.id].planned - p.tests[x.id].done));
  const weeks = devWeeksLeft(s, p) + testsLeft + 3;
  const later = modelAgeYears(m, s.week + weeks);
  const change = o.demandNow > 0.05 ? o.demandAfter / o.demandNow - 1 : 0;
  const d = { now: dec(o.demandNow, 1), after: dec(o.demandAfter, 1), pct: percent(Math.abs(change), 0) };
  return (
    <Panel title={t('Makyajın getirisi')}>
      <div className="quote">
        <div>
          <span>{t('Alıcı gözünde yaşı')}</span>
          <b>{t('{now} → {after} yıl', { now: dec(o.ageNow, 1), after: dec(o.ageAfter, 1) })}</b>
        </div>
        <div>
          <span>{t('Çekicilik (sınıf ort. 50)')}</span>
          <b>
            {dec(o.appealNow, 0)} → {dec(o.appealAfter, 0)}
          </b>
        </div>
        <div>
          <span>{t('Haftalık talep (bugünkü fiyatla)')}</span>
          <b className={change >= 0.1 ? 'tone-good' : change < 0.03 ? 'tone-bad' : 'tone-warn'}>{t('{now} → {after} araç/hf', d)}</b>
        </div>
      </div>
      <p className="small">
        {change >= 0.1
          ? tx('Bugün satışa çıksa bu makyaj talebi <good>~{pct}</good> artırır ({now} → {after} araç/hf); lansman heyecanı ilk aylarda bunun üstüne alıcı getirir.', d)
          : change >= 0.03
            ? tx('Bu makyaj talebi yalnız <warn>~{pct}</warn> artırır ({now} → {after} araç/hf). Geliştirme odağını alıcıların önem verdiği özelliklere çevirirsen getirisi artar.', d)
            : tx('<bad>Bu makyaj talebi artırmıyor</bad> ({now} → {after} araç/hf). Geliştirme odağını alıcıların önem verdiği özelliklere çevir ya da yeni kuşak düşün.', d)}{' '}
        {o.appealAfter < o.appealNow &&
          `${t('Makyaj arabanın geliştirme ve test ayarlarını korur; buna rağmen çekicilik düşüyorsa tasarımdaki değişiklikler arabayı bir yönden geriletiyor: tasarımı ve odağı gözden geçir.')} `}
        {t('Makyaj arabayı genç gösterir: bugün {now} yaşında görünüyor, makyajdan hemen sonra {after}. Satışa çıkması ~{n} hafta sürer; makyajsız o gün {later} yaşında görünecek.', {
          now: dec(o.ageNow, 1),
          after: dec(o.ageAfter, 1),
          n: weeks,
          later: dec(later, 1),
        })}
      </p>
      <p className="muted small">{t('Mühendislerin bugünkü odak ve test planıyla beklediği sonuç; lansman heyecanı hariç. Kesin tepkiyi dergiler lansmanda verir.')}</p>
    </Panel>
  );
}

/** When testing is finished, its next step sits right under the stepper, not at the bottom of the page. */
function NextStep({ p }: { p: Project }) {
  const testsDone = p.phase === 'testing' && TESTS.every((t) => p.tests[t.id].done >= p.tests[t.id].planned);
  if (!testsDone) return null;
  return (
    <div className="next-step" role="status">
      <span>{tx('<b>Test programı bitti.</b> Sırada tedarikçiler ve üretim hattı var.')}</span>
      <Button kind="primary" onClick={() => store.try((st) => A.finishTesting(st, p.id))}>
        {t('Üretim hazırlığına geç')}
      </Button>
    </div>
  );
}

function Testing({ p }: { p: Project }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const planned = Object.fromEntries(TESTS.map((t) => [t.id, p.tests[t.id].planned])) as Record<TestId, number>;
  const exp = expectedRemaining(p.defectPrior, planned);
  const startRange = defectRange(p.defectPrior);
  // What the plan costs in time and money, and what its last weeks buy.
  const unit1900 = protoUnitCost(p, yf);
  const weekCost = (t: (typeof TESTS)[number]) => testWeekCost(t, unit1900, yf);
  const weeksLeft = Math.max(0, ...TESTS.map((t) => p.tests[t.id].planned - p.tests[t.id].done));
  const testCostLeft = TESTS.reduce((a, t) => a + Math.max(0, p.tests[t.id].planned - p.tests[t.id].done) * weekCost(t), 0);
  // While the car is in testing its engineers are paid whether or not they have anything else to do.
  const fixedWeekly = s.company.engineers * engineerSalary(yf);
  const shorter = Object.fromEntries(TESTS.map((t) => [t.id, Math.max(p.tests[t.id].done, p.tests[t.id].planned - 5)])) as Record<TestId, number>;
  const shorterWeeks = Math.max(0, ...TESTS.map((t) => shorter[t.id] - p.tests[t.id].done));
  const shorterSaves = TESTS.reduce((a, t) => a + (p.tests[t.id].planned - shorter[t.id]) * weekCost(t), 0) + (weeksLeft - shorterWeeks) * fixedWeekly;
  const extraDefects = expectedRemaining(p.defectPrior, shorter) - exp;
  const risk = riskLabel(exp);
  const found = p.defects.filter((d) => d.found);
  const running = TESTS.some((t) => p.tests[t.id].done < p.tests[t.id].planned);
  const weeklyCost = TESTS.filter((t) => p.tests[t.id].done < p.tests[t.id].planned).reduce((a, t) => a + weekCost(t), 0);
  return (
    <div className="grid-2 wide-left">
      <Panel title={t('Test programı')}>
        <BudgetLine b={launchBudget(s, p)} />
        <p className="muted small">
          {t('Testler her hafta paralel ilerler ve bulunan kusurlar hemen giderilir. Test haftalarını azaltırsan araç daha erken çıkar ama gizli kusurlar sahada patlar.')}
        </p>
        {TESTS.map((test) => {
          const plan = p.tests[test.id];
          const locked = test.year > yf;
          return (
            <div key={test.id} className={`test-row ${locked ? 'is-locked' : ''}`}>
              <div className="test-head">
                <b>{t(test.name)}</b>
                <span className="muted small">{locked ? t('{year} gelir', { year: inYear(test.year) }) : t('{cost}/hafta', { cost: money(weekCost(test)) })}</span>
              </div>
              <p className="muted small">{t(test.desc)}</p>
              <Slider
                label={t('Planlanan süre')}
                value={plan.planned}
                min={0}
                max={30}
                onChange={(v) => store.try((st) => A.setTestPlan(st, p.id, test.id, v))}
                format={(v) => t('{n} hafta', { n: v })}
                disabled={locked}
              />
              <Progress value={plan.done} max={Math.max(1, plan.planned)} tone={plan.done >= plan.planned ? 'good' : 'accent'} label={`${plan.done}/${plan.planned}`} />
            </div>
          );
        })}
        <div className="row-end">
          <Button kind={running ? 'danger' : 'primary'} onClick={() => store.try((st) => A.finishTesting(st, p.id))}>
            {running ? t('Testleri erken bitir (riskli)') : t('Üretim hazırlığına geç')}
          </Button>
        </div>
      </Panel>
      <aside>
        <Panel title={t('Kusur raporu')}>
          <div className="risk">
            <span>{t('Geliştirmeden çıkan gizli kusur (tahmin)')}</span>
            <b>{t('{lo}–{n} kusur', { lo: startRange[0], n: startRange[1] })}</b>
          </div>
          <div className="risk">
            <span>{t('Bu test planı bitince kalması beklenen')}</span>
            <b className={`tone-${risk.tone}`}>
              ~{Math.round(exp)} · {t('{level} risk', { level: t(risk.label) })}
            </b>
          </div>
          <p className="muted small">
            {t('Kaç kusur olduğunu kimse kesin bilmez.')}{' '}
            {s.company.modelsLaunched < 2
              ? t('Ekibin ilk arabalarında çok hata yapar; Kalan her kusur sahada arıza, garanti masrafı ve geri çağırma demektir.')
              : t('Kalan her kusur sahada arıza, garanti masrafı ve geri çağırma demektir.')}{' '}
            {t('Bazı kusurlar ancak binlerce müşterinin elinde, yıllarca kullanımda ortaya çıkar: en uzun test programı bile hepsini yakalayamaz.')}
          </p>
          <p>
            {tx('Bulunan ve giderilen: <b>{n}</b>', { n: found.length })}
            {running && <span className="muted small"> · {t('test maliyeti ~{cost}/hafta', { cost: money(weeklyCost) })}</span>}
          </p>
          {found.length > 0 && (
            <ul className="defects">
              {found.map((d) => (
                <li key={d.id}>
                  <Badge tone={d.severity === 'critical' ? 'bad' : d.severity === 'major' ? 'warn' : 'muted'}>{t(SEVERITY_NAMES[d.severity])}</Badge> {t(AREA_NAMES[d.area])}:{' '}
                  {t(defectText(d))} <span className="muted small">— {t('giderildi')}</span>
                </li>
              ))}
            </ul>
          )}
          <h4>{t('Planın bedeli')}</h4>
          <p className="small">
            {weeksLeft > 0
              ? tx('<b>{n} hafta</b> daha: test gideri ~{tests}, mühendis maaşları ~{salaries}. Araç o kadar geç satışa çıkar.', {
                  n: weeksLeft,
                  tests: money(testCostLeft),
                  salaries: money(weeksLeft * fixedWeekly),
                })
              : t('Plan tamamlandı.')}
          </p>
          {weeksLeft - shorterWeeks > 0 && (
            <p className="small muted">
              {t('Her testi 5 hafta kısaltsan: ~{defects} kusur daha sahaya çıkar, ama araç {n} hafta erken satışa çıkar ve ~{saves} tasarruf edersin.', {
                defects: dec(extraDefects, 1),
                n: weeksLeft - shorterWeeks,
                saves: money(shorterSaves),
              })}
            </p>
          )}
          <h4>{t('Testlerin araca katkısı')}</h4>
          <p className="small">
            {tuningText(testTuning(p.tests)) || (
              <span className="muted">
                {t(
                  'Testler başlayınca ayarlar iyileşir: dinamometre gücü ve tüketimi, yol testi konfor ve yol tutuşu, çarpışma testi güvenliği, dayanıklılık güvenilirliği.',
                )}
              </span>
            )}
          </p>
        </Panel>
        <Panel tight>
          <StatsPanel
            s={s}
            design={p.design}
            segment={p.segment}
            yf={yf}
            bonus={p.bonus}
            estimate={p.estimate ?? newEstimate(() => 0.5)}
            compact
            note={t('Dinamometre hızı ve tüketimi, yol testi konfor ve yol tutuşu, çarpışma testi güvenliği, dayanıklılık güvenilirliği ölçer.')}
          />
        </Panel>
      </aside>
    </div>
  );
}

function tuningText(tu: Tuning): string {
  const parts: string[] = [];
  if (tu.power > 0.001) parts.push(t('güç +{pct}', { pct: percent(tu.power, 1) }));
  if (tu.fuel > 0.001) parts.push(t('tüketim −{pct}', { pct: percent(tu.fuel, 1) }));
  if (tu.comfort > 0.05) parts.push(t('konfor +{v}', { v: dec(tu.comfort, 1) }));
  if (tu.handling > 0.05) parts.push(t('yol tutuş +{v}', { v: dec(tu.handling, 1) }));
  if (tu.safety > 0.05) parts.push(t('güvenlik +{v}', { v: dec(tu.safety, 1) }));
  if (tu.reliability > 0.05) parts.push(t('güvenilirlik +{v}', { v: dec(tu.reliability, 1) }));
  return parts.length ? t('Şimdiye kadar: {list}.', { list: parts.join(', ') }) : '';
}

const COMPONENT_NAMES: Record<ComponentKey, string> = { engine: msg('Motor'), gearbox: msg('Şanzıman'), electrics: msg('Elektrik ve donanım') };

/** A line stage's name ('' when unknown). */
function stageName(id: StageId): string {
  const stage = STAGES.find((x) => x.id === id);
  return stage ? t(stage.name) : '';
}

function Production({ p }: { p: Project }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const st = useCarStats(p.design, yf, p.bonus);
  const g = gates(s);
  const [lineId, setLineId] = useState<string | undefined>(() => suggestedLine(s, p)?.id);
  const [tier, setTier] = useState<ToolingTier>(p.tooling ?? 'standard');
  const started = p.productionReadyWeek !== undefined;
  if (started) {
    const left = Math.max(0, (p.productionReadyWeek ?? 0) - s.week);
    return (
      <Panel title={t('Üretim hazırlığı')}>
        <p>
          {tx('{tooling} ve ilk parçalar hazırlanıyor ({line}). Kalan: <b>{n} hafta</b>.', {
            tooling: t(toolingDef(p.tooling).name),
            line: s.lines.find((l) => l.id === p.lineId)?.name,
            n: left,
          })}
        </p>
        <Progress value={1 - left / 12} />
        <p className="muted small">{t('Bu sürede hat mevcut modeli üretmeye devam eder. Lansmanda yeni model hattı devralır.')}</p>
      </Panel>
    );
  }
  const unitNow = materialUnitCost(s, { stats: st, suppliers: p.suppliers, unitsBuilt: 0, tooling: tier });
  const quote = lineId ? A.toolingQuote(s, p, lineId, tier) : null;
  const line = s.lines.find((l) => l.id === lineId);
  const report = line ? lineReport(s, line, st.complexity) : null;
  const buildLeft = line?.buildUntilWeek !== undefined ? Math.max(0, line.buildUntilWeek - s.week) : 0;
  const readyWeeks = quote ? Math.max(quote.weeks, quote.leadWeeks, buildLeft) : 0;
  const turnkey = turnkeyLineCost(s.week, false);
  const workshop = workshopLineCost(s.week);
  const reserved = reservedLines(s, p.id);
  // Build a line and pick it for this car at once.
  const buildAndPick = async (build: (st: GameState) => { ok: boolean; error?: string }, success: string, what: string, cost: number, weeks: number) => {
    const yes = await store.ask({
      title: t('{what} kurulsun mu?', { what }),
      body: t('{cost} şimdi ödenir; hat {n} haftada kurulur ve bu arabaya seçilir. Kalıplar da bu sürede hazırlanabilir.', { cost: money(cost), n: weeks }),
      confirm: t('Kur'),
    });
    if (!yes) return;
    if (store.try(build, success)) {
      const lines = store.state?.lines ?? [];
      setLineId(lines[lines.length - 1]?.id);
    }
  };
  const quoteFor = (x: ToolingTier) => (lineId ? A.toolingQuote(s, p, lineId, x) : null);
  return (
    <>
      <div className="howto prod-howto">
        <div>
          <p>
            {tx('<b>Üretim hazırlığı: araba çizimden fabrikaya geçiyor.</b> Üç karar var; hepsi birim maliyeti, işçilik kalitesini ve lansman tarihini etkiler.')}
          </p>
          <ol>
            <li>{tx('<b>Parçalar:</b> motoru, şanzımanı ve elektriği kim yapacak? Tedarikçi fiyatı, kaliteyi ve teslim süresini belirler.')}</li>
            <li>{tx('<b>Hat:</b> arabayı hangi hat üretecek? Hattın en yavaş bölümü (darboğaz) haftada kaç araba çıkacağını belirler.')}</li>
            <li>{tx('<b>Kalıplar:</b> gövde panellerini basan kalıplar ve montaj fikstürleri. Parasını şimdi ödersin; kalitesi arabanın işçiliğini ve firesini belirler.')}</li>
          </ol>
        </div>
      </div>
      <div className="grid-2">
        <Panel title={t('1 · Parçalar: yap ya da al')}>
          {!g.suppliers ? (
            <p className="muted">
              {t(
                'İlk modelinde parçaları güvenilir tedarikçilerden alıyorsun: pahalı ama sağlam. Kimden alacağına (ya da kendin üretmeye) ikinci modelinde sen karar vereceksin.',
              )}
            </p>
          ) : (
            (Object.keys(COMPONENT_NAMES) as ComponentKey[]).map((k) => (
              <div key={k} className="supplier-row">
                <div className="test-head">
                  <b>{t(COMPONENT_NAMES[k])}</b>
                  <span className="muted small">{t('parça bedeli {cost}', { cost: money(st.componentCost[k] * costIndex(yf)) })}</span>
                </div>
                <Choice
                  value={p.suppliers[k]}
                  onChange={(v) => store.try((st2) => A.setSupplier(st2, p.id, k, v))}
                  options={SUPPLIERS.map((x) => ({
                    value: x.id,
                    label: t(x.name),
                    disabled: x.id === 'inhouse' && !s.company.shops[k],
                    sub: `${x.costMult < 1 ? '−' : '+'}${percent(Math.abs(1 - x.costMult), 0)} · ${x.leadWeeks ? t('{n} hf teslim', { n: x.leadWeeks }) : t('hemen')} · ${t(x.desc)}`,
                  }))}
                />
                {!s.company.shops[k] && (
                  <Button small kind="ghost" onClick={() => store.try((st2) => A.buildShop(st2, k), t('Atölye kuruldu'))}>
                    {t('{part} atölyesi kur ({cost})', { part: t(COMPONENT_NAMES[k]), cost: money(shopCost(yf)) })}
                  </Button>
                )}
              </div>
            ))
          )}
          <p>{tx('Birim malzeme maliyeti: <b>{cost}</b>', { cost: money(unitNow) })}</p>
          {g.suppliers && <PartsReliability p={p} tier={tier} />}
        </Panel>
        <Panel title={t('2 · Hangi hat üretecek?')}>
          <p className="muted small">
            {t('Bir hat aynı anda tek model üretir. Başka bir modelin hattını seçersen o model lansmanda hattını kaybeder. Kapasite, bu arabanın üretim zorluğuna göre hesaplandı.')}
          </p>
          {(() => {
            const option = (l: (typeof s.lines)[number]) => {
              const r = lineReport(s, l, st.complexity);
              const occupant = s.models.find((m) => m.id === l.modelId && m.status === 'active');
              const claimedBy = reserved.has(l.id) ? s.projects.find((x) => x.id !== p.id && x.lineId === l.id) : undefined;
              const replaced = occupant && occupant.id === p.replacesModelId;
              const building = l.buildUntilWeek !== undefined && s.week < l.buildUntilWeek;
              return (
                <label key={l.id} className={`line-option ${lineId === l.id ? 'is-on' : ''} ${claimedBy ? 'is-off' : ''}`}>
                  <input type="radio" name="line" checked={lineId === l.id} disabled={!!claimedBy} onChange={() => setLineId(l.id)} />
                  <span>
                    <b>{l.name}</b> · {t('{v} araç/hafta', { v: dec(r.throughput, 1) })}
                    <br />
                    <span className="muted small">
                      {claimedBy
                        ? t('{name} projesine ayrıldı', { name: claimedBy.name })
                        : occupant
                          ? replaced
                            ? t('Şu an: {name} (yerine geçecek)', { name: occupant.name })
                            : t('Şu an: {name}; lansmanda bu hattı kaybeder', { name: occupant.name })
                          : building
                            ? t('İnşaatta: {n} hafta', { n: l.buildUntilWeek! - s.week })
                            : t('Boş')}{' '}
                      · {t('darboğaz: {stage}', { stage: stageName(r.bottleneck) })}
                    </span>
                  </span>
                </label>
              );
            };
            const usable = s.lines.filter((l) => !l.military);
            const live = (l: (typeof s.lines)[number]) => s.models.some((m) => m.id === l.modelId && m.status === 'active' && m.id !== p.replacesModelId);
            // Lines of other cars on sale are a last resort: folded away unless one is picked.
            const main = usable.filter((l) => !live(l) || l.id === lineId);
            const taken = usable.filter((l) => live(l) && l.id !== lineId);
            return (
              <>
                <div className="line-pick">{main.map(option)}</div>
                {taken.length > 0 && (
                  <details className="line-taken">
                    <summary className="small">{t('Satıştaki başka arabaların hatları ({n}): seçersen o araba lansmanda hattını kaybeder', { n: taken.length })}</summary>
                    <div className="line-pick">{taken.map(option)}</div>
                  </details>
                )}
              </>
            );
          })()}
          {!suggestedLine(s, p) && (
            <p className="note small">{t('Boşta hat yok: bütün hatlarda satıştaki bir araba ya da başka bir proje var. Bu araba için yeni bir hat kur.')}</p>
          )}
          <div className="line-build">
            <Button
              small
              kind="ghost"
              disabled={s.company.cash < workshop}
              onClick={() =>
                buildAndPick(
                  (st2) => A.buildWorkshopLine(st2, undefined),
                  t('Atölye hattı kuruluyor'),
                  t('Küçük atölye hattı'),
                  workshop,
                  Math.max(3, Math.round(lineBuildWeeks(yf) / 2)),
                )
              }
            >
              {t('+ Küçük atölye hattı ({cost})', { cost: money(workshop) })}
            </Button>
            <Button
              small
              kind="ghost"
              disabled={s.company.cash < turnkey}
              onClick={() => buildAndPick((st2) => A.buildTurnkeyLines(st2, 1, undefined, false), t('Yeni hat kuruluyor'), t('Dengeli yeni hat'), turnkey, lineBuildWeeks(yf))}
            >
              {t('+ Dengeli yeni hat ({cost}, {n} hf)', { cost: money(turnkey), n: lineBuildWeeks(yf) })}
            </Button>
          </div>
          <p className="muted small">{t('Kapasiteyi sonra Fabrika ekranından büyütebilir ya da “talebi otomatik karşıla” ile fabrikaya bırakabilirsin.')}</p>
        </Panel>
      </div>
      <Panel title={t('3 · Kalıplar')}>
        <Choice
          value={tier}
          onChange={setTier}
          options={TOOLING.map((x) => {
            const q = quoteFor(x.id);
            const eff = Object.entries(x.scores)
              .map(([k, v]) => `${lower(t(ATTR_NAMES[k as keyof typeof ATTR_NAMES]))} ${v > 0 ? '+' : '−'}${Math.abs(v)}`)
              .join(', ');
            return {
              value: x.id,
              label: t(x.name),
              sub: (
                <>
                  {q ? `${money(q.cost)} · ${t('{n} hafta', { n: Math.max(q.weeks, q.leadWeeks) })} · ` : ''}
                  {x.materialMult !== 1
                    ? t('birim maliyet {change}', { change: `${x.materialMult > 1 ? '+' : '−'}${percent(Math.abs(x.materialMult - 1), 0)}` })
                    : t('olağan fire')}
                  {eff ? ` · ${eff}` : ''}
                  <br />
                  {t(x.desc)}
                </>
              ),
            };
          })}
        />
        {quote && (
          <div className="quote">
            <div>
              <span>{t('Kalıp maliyeti')}</span>
              <b>{money(quote.cost)}</b>
            </div>
            <div>
              <span>{t('Üretime hazır')}</span>
              <b>{t('{n} hafta sonra', { n: readyWeeks })}</b>
            </div>
            <div>
              <span>{t('Birim malzeme')}</span>
              <b>{money(unitNow)}</b>
            </div>
            <div>
              <span>{t('Hat kapasitesi')}</span>
              <b>{report ? t('{v} araç/hf', { v: dec(report.throughput, 1) }) : '—'}</b>
            </div>
            {quote.sharedPlatform && <Badge tone="good">{t('Aynı platform: kalıplar büyük ölçüde ortak')}</Badge>}
          </div>
        )}
        {quote && quote.leadWeeks > quote.weeks && (
          <p className="muted small">{t('Hazırlık süresini parça tedarikçisinin teslimi belirliyor ({n} hafta).', { n: quote.leadWeeks })}</p>
        )}
        <Toggle
          checked={p.autoCapacity ?? true}
          onChange={(v) => store.act((st2) => A.setProjectAutoCapacity(st2, p.id, v))}
          label={t('Satışa çıkınca talebi otomatik karşıla')}
          sub={t(
            'Açıkken fabrika, alıcılar beklediği sürece darboğaza istasyon ekler, hattı genişletir ya da yeni hat kurar; talep düşerse üretimi kısar, uzun süre boş kalan hattı satar. Kasada her zaman birkaç haftalık gider kadar yedek bırakır. Sonradan Model ve Fabrika ekranlarından değiştirebilirsin.',
          )}
        />
        {!lineId && <p className="note">{t('Kalıpları sipariş etmek için önce arabanın üretileceği hattı seç.')}</p>}
        {lineId && quote && s.company.cash < quote.cost && <ToolingShort p={p} lineId={lineId} tier={tier} setTier={setTier} cost={quote.cost} />}
        <div className="row-end">
          <Button kind="primary" disabled={!lineId || (quote ? s.company.cash < quote.cost : true)} onClick={() => lineId && store.try((st2) => A.startTooling(st2, p.id, lineId, tier))}>
            {quote
              ? t('{tooling}: sipariş et ({cost})', { tooling: t(toolingDef(tier).name), cost: money(quote.cost) })
              : t('{tooling}: sipariş et', { tooling: t(toolingDef(tier).name) })}
          </Button>
        </div>
      </Panel>
    </>
  );
}

/**
 * What the parts choice saves and what it costs in reliability, next to each other: parts made in-house
 * (or bought cheap) are cheaper, but how sound they are depends on the engineers' skill, and buyers and
 * magazines find it out once the cars are on the road.
 */
function PartsReliability({ p, tier }: { p: Project; tier: ToolingTier }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const st = useCarStats(p.design, yf, p.bonus);
  const quality = { engine: 'quality', gearbox: 'quality', electrics: 'quality' } as const;
  if ((Object.keys(p.suppliers) as ComponentKey[]).every((k) => p.suppliers[k] === 'quality')) return null;
  const skill = Math.round(s.company.skill);
  const unit = (suppliers: Project['suppliers']) => materialUnitCost(s, { stats: st, suppliers, unitsBuilt: 0, tooling: tier });
  const saving = unit(quality) - unit(p.suppliers);
  const vs = partsVsQuality(p.suppliers, s.company.skill);
  // On the 0–100 scale magazines and buyers use (hidden defects left out).
  const score = (extra: number) => scoreStats(st, yf, p.segment, st.reliability + extra).reliability;
  const withQuality = score(partsVsQuality(quality, s.company.skill).reliability);
  const chosen = score(vs.reliability);
  const loss = withQuality - chosen;
  const tone = { tone: (c: ReactNode, k: number) => <b key={k} className={loss >= 3 ? 'tone-bad' : loss >= 1 ? 'tone-warn' : 'tone-good'}>{c}</b> };
  const inhouse = (Object.keys(p.suppliers) as ComponentKey[]).some((k) => p.suppliers[k] === 'inhouse');
  const par = inhouseParity();
  const v = { saving: money(saving), skill, rel: dec(chosen, 0), quality: dec(withQuality, 0), mult: dec(vs.failures, 1) };
  return (
    <p className="small">
      {inhouse
        ? tx(
            'Kaliteli tedarikçiye göre araç başına <b>{saving}</b> ucuz. Ama kendi parçalarının kalitesi mühendislik becerisine bağlı (şimdi {skill}): alıcıların ve dergilerin sahada göreceği güvenilirlik puanı ~<tone>{rel}</tone>, hepsi kaliteli tedarikçiden olsa ~{quality}. Bu parçalardaki gizli kusurlar {mult} kat sık arıza çıkarır.',
            v,
            tone,
          )
        : tx(
            'Kaliteli tedarikçiye göre araç başına <b>{saving}</b> ucuz. Ama alıcıların ve dergilerin sahada göreceği güvenilirlik puanı ~<tone>{rel}</tone>, hepsi kaliteli tedarikçiden olsa ~{quality}. Bu parçalardaki gizli kusurlar {mult} kat sık arıza çıkarır.',
            v,
            tone,
          )}
      {inhouse && skill < par.failures && (
        <span className="muted">
          {' '}
          {skill < par.reliability
            ? t('Kendi parçaların beceri {rel} olunca kaliteli tedarikçininki kadar sağlam, {fail} olunca o kadar az arızalı olur.', { rel: par.reliability, fail: par.failures })
            : t('Kendi parçaların artık kaliteli tedarikçininki kadar sağlam; beceri {fail} olunca o kadar az arızalı da olur.', { fail: par.failures })}
        </span>
      )}
    </p>
  );
}

/** The dies cost more than the till holds: say so, and show the ways out. */
function ToolingShort({ p, lineId, tier, setTier, cost }: { p: Project; lineId: string; tier: ToolingTier; setTier: (t: ToolingTier) => void; cost: number }) {
  const s = useGameState();
  const shortfall = cost - s.company.cash;
  const room = Math.max(0, credit(s).limit - s.company.loan);
  const cheaper = TOOLING.map((def) => ({ def, q: A.toolingQuote(s, p, lineId, def.id) })).filter((x) => x.def.id !== tier && x.q.cost <= s.company.cash);
  const borrow = Math.ceil((shortfall * 1.05) / 100) * 100;
  return (
    <div className="note tooling-short">
      <p>
        {tx('<b>Neden sipariş edilemiyor?</b> {tooling} {cost} tutuyor, kasada {cash} var: {short} eksik.', {
          tooling: t(toolingDef(tier).name),
          cost: money(cost),
          cash: money(s.company.cash),
          short: money(shortfall),
        })}
      </p>
      <div className="row">
        {cheaper.map(({ def, q }) => (
          <Button key={def.id} small onClick={() => setTier(def.id)}>
            {t('{tooling} seç ({cost}, kasaya yetiyor)', { tooling: t(def.name), cost: money(q.cost) })}
          </Button>
        ))}
        {room >= borrow && (
          <Button
            small
            kind="primary"
            onClick={() =>
              store.try((st2) => {
                const r = A.takeLoan(st2, borrow);
                return r.ok ? A.startTooling(st2, p.id, lineId, tier) : r;
              }, t('{amount} kredi alındı, kalıplar sipariş edildi', { amount: money(borrow) }))
            }
          >
            {t('Eksiği krediyle karşıla ({amount} kredi)', { amount: money(borrow) })}
          </Button>
        )}
        {s.company.reputation >= 5 && (
          <Button
            small
            onClick={() =>
              store.ask({
                title: t('Kalıpçıya vadeli sipariş'),
                body: t(
                  'Kalıpçı parayı sonra, satışlardan almayı kabul ediyor ama {pct} fazlasını istiyor: {amount} şirketin borcuna eklenir ve faiz işler. Bankanın kredi limiti bu borcu da sayar.',
                  { pct: percent(A.VENDOR_CREDIT, 0), amount: money(cost * (1 + A.VENDOR_CREDIT)) },
                ),
                confirm: t('Vadeli sipariş et'),
              }).then((yes) => yes && store.try((st2) => A.startTooling(st2, p.id, lineId, tier, { vendorCredit: true }), t('Kalıplar vadeli sipariş edildi')))
            }
          >
            {t('Kalıpçıya vadeli sipariş et (+{pct}, borca eklenir)', { pct: percent(A.VENDOR_CREDIT, 0) })}
          </Button>
        )}
      </div>
      {!cheaper.length && room < borrow && (
        <p className="small muted">
          {t('Kasa ve banka kredisi yetmiyor. Vadeli sipariş son çıkış yolu; ya da satıştaki arabalardan para gelmesini bekle, gereksiz mühendisleri çıkar.')}
        </p>
      )}
    </div>
  );
}

/** The dies are ready but the line they were made for is gone (sold, or given to another car). */
function NoLine({ p }: { p: Project }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const reserved = reservedLines(s, p.id);
  const live = (id?: string) => s.models.some((m) => m.id === id && m.status === 'active');
  const free = s.lines.filter((l) => !l.military && !reserved.has(l.id));
  const workshop = workshopLineCost(s.week);
  const turnkey = turnkeyLineCost(s.week, false);
  const buildAndAssign = (build: (st: GameState) => { ok: boolean; error?: string }) => {
    if (!store.try(build)) return;
    const lines = store.state?.lines ?? [];
    const id = lines[lines.length - 1]?.id;
    if (id) store.try((st) => A.setProjectLine(st, p.id, id), t('Yeni hat bu arabaya ayrıldı'));
  };
  return (
    <Panel title={t('Bu arabanın hattı yok')}>
      <p>
        {t('Kalıplar hazır ama yapıldıkları hat artık yok (satıldı ya da başka bir arabaya verildi). Lansmandan önce arabanın üretileceği hattı seç ya da yeni bir hat kur.')}
      </p>
      {free.length > 0 && (
        <div className="line-pick">
          {free.map((l) => (
            <button key={l.id} type="button" className="line-option" onClick={() => store.try((st) => A.setProjectLine(st, p.id, l.id), t('{name} seçildi', { name: l.name }))}>
              <span>
                <b>{l.name}</b>{' '}
                <span className="muted small">
                  {live(l.modelId) ? t('şu an {name}; lansmanda hattını kaybeder', { name: String(s.models.find((m) => m.id === l.modelId)?.name) }) : t('boş')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="line-build">
        <Button small disabled={s.company.cash < workshop} onClick={() => buildAndAssign((st) => A.buildWorkshopLine(st, undefined))}>
          {t('+ Küçük atölye hattı ({cost})', { cost: money(workshop) })}
        </Button>
        <Button small disabled={s.company.cash < turnkey} onClick={() => buildAndAssign((st) => A.buildTurnkeyLines(st, 1, undefined, false))}>
          {t('+ Dengeli yeni hat ({cost}, {n} hf)', { cost: money(turnkey), n: lineBuildWeeks(yf) })}
        </Button>
      </div>
    </Panel>
  );
}

function Launch({ p }: { p: Project }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const st = useCarStats(p.design, yf, p.bonus);
  const unlocked = MARKETS.filter((m) => s.markets[m.id].unlocked).map((m) => m.id);
  const [price, setPrice] = useState(() => Math.round(p.kind === 'facelift' ? p.targetPrice : referencePrice(s.company.hq, p.segment, yf)));
  const [markets] = useState<MarketId[]>(unlocked);
  // A show can cost a young firm half its till: the player turns it on, never by default.
  const [autoShow, setAutoShow] = useState(false);
  const preview = A.previewModel(s, p, price, markets);
  const line = s.lines.find((l) => l.id === p.lineId);
  const cap = line ? lineReport(s, line, st.complexity).throughput : 0;
  const unit = materialUnitCost(s, preview);
  const labour = line && cap > 0 ? lineUpkeep(s, line, 1) / cap : 0;
  const segmentWeekly = markets.reduce((a, m) => a + weeklySegmentDemand(m, p.segment, yf), 0);
  const net = price * (1 - DEALER_COMMISSION) - N.avgFreightPerCar(s, yf);
  const margin = net - unit - labour;
  // A week at the middle demand estimate: what the car brings in against what the firm costs to run.
  const demand = markets.reduce((a, mk) => a + demandAtPrice(s, preview, mk, price), 0);
  const sold = Math.min(demand, cap);
  // Once the launch buzz has faded: the sales to build lines for.
  const lastingSold = Math.min(cap, markets.reduce((a, mk) => a + lastingDemandAtPrice(s, preview, mk, price), 0));
  const labourWeek = line ? lineUpkeep(s, line, cap > 0 ? sold / cap : 0) : 0;
  const contribution = sold * (net - unit) - labourWeek;
  const fixedCost = s.company.engineers * engineerSalary(yf) + (s.company.researchers ?? 0) * researcherSalary(yf) + overhead(yf, s.lines.length) + MARKET_IDS.reduce((a, m) => a + dealerUpkeep(s, m), 0);
  const weeklyNet = contribution - fixedCost;
  const others = s.models.some((m) => m.status === 'active' && m.id !== p.replacesModelId);
  // With other cars on sale their profit already carries the fixed costs.
  const now = recentProfit(s, 8);
  const showCost = A.autoShowCost(s, markets);
  const showShare = s.company.cash > 0 ? showCost / s.company.cash : 1;
  // The design is locked by now: say what the magazines will find missing, while the price is still open.
  const behind = classGap(s, p.design, p.segment, yf).items;
  return (
    <div className="grid-2">
      <Panel title={t('Fiyat ve pazarlar')}>
        <NumberInput label={t('Fabrika çıkış fiyatı')} prefix="$" value={price} min={1} step={10} onChange={setPrice} />
        <p className="muted small">
          {t('Sınıfın tipik fiyatı: {price}. Fiyat enflasyona göre otomatik güncellenir; istersen Modeller ekranından değiştirirsin.', {
            price: money(referencePrice(s.company.hq, p.segment, yf)),
          })}
        </p>
        <p className="muted small">
          {t('Satış yapılan {n} eyalette sunulur · segment {count} araç/yıl (bütün ülke) · araç başına ortalama nakliye {freight}.', {
            n: N.openStates(s).length,
            count: num(weeklySegmentDemand('usa', p.segment, yf) * 52),
            freight: money(N.avgFreightPerCar(s, yf)),
          })}
        </p>
        <Toggle
          checked={autoShow}
          onChange={setAutoShow}
          label={t('Otomobil fuarında tanıt')}
          sub={tx(
            '{cost} · <share>kasanın {pct}</share> · bilinirlik ve lansman heyecanı artar',
            { cost: money(showCost), pct: pctOf(showShare) },
            {
              share: (c, k) => (
                <span key={k} className={showShare > 0.25 ? 'tone-bad' : ''}>
                  {c}
                </span>
              ),
            },
          )}
        />
      </Panel>
      <Panel title={t('Lansman özeti')}>
        <div className="quote">
          <div>
            <span>{t('Seçili pazarlarda segment ({markets})', { markets: markets.map((mk) => t(MARKETS.find((x) => x.id === mk)!.name)).join(' + ') })}</span>
            <b>
              {t('{count} araç/yıl', { count: num(segmentWeekly * 52) })} <span className="muted small">{t('(haftada {v})', { v: dec(segmentWeekly, 0) })}</span>
            </b>
          </div>
          <div>
            <span>{t('Hat kapasitesi')}</span>
            <b>{t('{v} araç/hafta', { v: dec(cap, 1) })}</b>
          </div>
          <div>
            <span>{t('Malzeme / araç')}</span>
            <b>{money(unit)}</b>
          </div>
          <div>
            <span>{t('İşçilik / araç (tam kapasite)')}</span>
            <b>{money(labour)}</b>
          </div>
          <div>
            <span>{t('Araç başı brüt kâr (tam kapasite)')}</span>
            <b className={margin < 0 ? 'tone-bad' : 'tone-good'}>{money(margin)}</b>
          </div>
          <div>
            <span>{t('Beklenen satış (orta tahmin)')}</span>
            <b>{t('{v} araç/hafta', { v: dec(sold, 1) })}</b>
          </div>
          {dec(lastingSold, 1) !== dec(sold, 1) && (
            <div>
              <span>{t('Heyecan geçince')}</span>
              <b>{t('{v} araç/hafta', { v: dec(lastingSold, 1) })}</b>
            </div>
          )}
          <div>
            <span>{t('Aracın haftalık katkısı')}</span>
            <b className={contribution < 0 ? 'tone-bad' : ''}>{money(contribution)}</b>
          </div>
          <div>
            <span>{t('Sabit giderler (maaş, genel gider, bayi)')}</span>
            <b>{money(-fixedCost)}</b>
          </div>
          {others ? (
            <div>
              <span>{t('Şirketin haftalık kârı: şimdi → bu araçla')}</span>
              <b className={now + contribution < 0 ? 'tone-bad' : 'tone-good'}>
                {money(now)} → {money(now + contribution)}
              </b>
            </div>
          ) : (
            <div>
              <span>{t('Haftalık net')}</span>
              <b className={weeklyNet < 0 ? 'tone-bad' : 'tone-good'}>{money(weeklyNet)}</b>
            </div>
          )}
        </div>
        {weeklyNet < 0 && !others && (
          <p className="small tone-bad">
            {t('Bu fiyatta ve beklenen talepte şirket haftada {loss} kaybeder. Hat işçiliği az üretimde de ödenir; fiyatı, hattı ya da mühendis sayısını gözden geçir.', {
              loss: money(-weeklyNet),
            })}
          </p>
        )}
        {behind.length > 0 && (
          <p className="note small">
            {t('Sınıftaki arabaların çoğunda olan {list} bu arabada yok: dergiler bunu fark eder, fiyatı buna göre koy. Çoğu makyajla sonradan eklenebilir.', {
              list: gapNames(behind),
            })}
          </p>
        )}
        <PriceGuide p={p} price={price} setPrice={setPrice} markets={markets} cap={cap} unit={unit} labour={labour} />
        <p className="muted small">
          {t('Alıcıların aracını nasıl karşılayacağını lansmanda göreceksin: dergi puanları, rakiplerle karşılaştırma ve dört hafta sonra ilk ay raporu.')}
        </p>
        <div className="row-end">
          <Button
            kind="primary"
            disabled={!markets.length}
            onClick={() => {
              const r = store.act((st2) => A.launchModel(st2, p.id, { price, markets, autoShow }));
              if (r && r.ok) store.go({ id: 'model', modelId: r.modelId });
              else if (r) store.showToast(r.error, 'bad');
            }}
          >
            <Icon name="rosette" /> {t('Lansmanı yap')}
          </Button>
        </div>
        <p className="muted small">{t('Hat: {name}', { name: line?.name ?? '—' })}</p>
      </Panel>
    </div>
  );
}
