import { useState } from 'react';
import * as A from '../../core/actions';
import { credit, dealerUpkeep, gates, materialUnitCost, protoUnitCost } from '../../core/game';
import { lineReport, lineUpkeep, reservedLines, suggestedLine, turnkeyLineCost, workshopLineCost } from '../../core/factory';
import { MARKET_IDS, consumerPrice, demandAtPrice, referencePrice, segmentMarket, steepPriceRatio, weeklySegmentDemand } from '../../core/market';
import { AREA_NAMES, SEVERITY_NAMES, SUPPLIERS, TESTS, defectRange, defectText, expectedRemaining, riskLabel, testTuning, testWeekCost, type Tuning } from '../../core/testing';
import { yearFloat } from '../../core/time';
import { DEALER_COMMISSION, costIndex, engineerSalary, lineBuildWeeks, overhead, shopCost } from '../../data/economy';
import { MARKETS } from '../../data/markets';
import { ATTRS, ATTR_NAMES, segmentDef } from '../../data/segments';
import { STAGES } from '../../data/stations';
import { TOOLING, toolingDef } from '../../data/tooling';
import type { ComponentKey, GameState, MarketId, Project, ProjectPhase, TestId, ToolingTier } from '../../core/types';
import { store, useGameState } from '../store';
import { money, num, pctOf, recentProfit } from '../format';
import { inYear } from '../format';
import { pctWith } from '../../core/turkish';
import { Badge, Button, Choice, NumberInput, Panel, Progress, Slider, Toggle } from '../components/ui';
import { newEstimate } from '../../core/estimate';
import { launchBudget } from '../../core/budget';
import { researcherSalary } from '../../core/research';
import { BudgetLine } from '../components/BudgetLine';
import { StatsPanel, useCarStats } from '../components/StatsPanel';
import { Designer } from './Designer';
import { DevBar, FocusPanel } from './DevPanel';

const STEPS: { label: string; phases: ProjectPhase[] }[] = [
  { label: 'Tasarım ve geliştirme', phases: ['design', 'development'] },
  { label: 'Test', phases: ['testing'] },
  { label: 'Üretim hazırlığı', phases: ['production'] },
  { label: 'Lansman', phases: ['ready'] },
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
            ← Projeler
          </button>
          <h1>
            {p.phase === 'design' ? (
              <input className="title-input" value={p.name} maxLength={24} aria-label="Model adı" onChange={(e) => store.act((st) => A.renameProject(st, p.id, e.target.value))} />
            ) : (
              p.name
            )}
          </h1>
          <p className="muted">
            {segmentDef(p.segment).icon} {segmentDef(p.segment).name}
            {p.kind === 'facelift' ? ' · makyaj projesi' : p.replacesModelId ? ' · yeni kuşak' : ''}
          </p>
        </div>
        <Button
          kind="danger"
          small
          onClick={async () => {
            const ok = await store.ask({ title: `${p.name} iptal edilsin mi?`, body: 'Bu projeye harcanan para geri gelmez.', confirm: 'Projeyi iptal et', danger: true });
            if (ok) {
              store.act((st) => A.cancelProject(st, p.id));
              store.go({ id: 'projects' });
            }
          }}
        >
          Projeyi iptal et
        </Button>
      </div>
      <ol className="stepper">
        {STEPS.map((st, i) => (
          <li key={st.label} className={i < idx ? 'is-done' : i === idx ? 'is-on' : ''}>
            {st.label}
          </li>
        ))}
      </ol>
      <NextStep p={p} />
      {(p.phase === 'design' || p.phase === 'development') && (
        <>
          <DevBar project={p} />
          {/* The brief first: what the engineers should work on, then the car itself. */}
          <FocusPanel project={p} />
          <Designer project={p} readOnly={p.phase === 'development'} />
        </>
      )}
      {p.phase === 'testing' && <Testing p={p} />}
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
  const net = s.markets[s.company.hq].dealerLevel > 0 ? 1 - DEALER_COMMISSION : 1;
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
  // Judged on the middle estimate: the range is wide enough to cover almost any line.
  const verdict = noLine
    ? 'Hattın kapasitesi henüz belli değil: kâr, talebin tamamı üretilir diye hesaplandı.'
    : d > cap * 1.2
      ? `Orta tahmin hattın ${(d / Math.max(0.1, cap)).toFixed(1)} katı: fiyatı biraz yükseltebilir ya da kapasite ekleyebilirsin.`
      : d < cap * 0.8
        ? `Hat orta tahminin ${(cap / Math.max(0.1, d)).toFixed(1)} katını üretebilir: fiyatı düşürmeyi ya da daha küçük bir hattı düşün.`
        : 'Orta tahmine göre talep ve kapasite dengeli.';
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
  // A small line pushes the best price up and sales down: what a line big enough would earn instead.
  const refRound = Math.round(ref / 10) * 10;
  const demandAtRef = demandAt(refRound);
  const bigLineProfit = demandAtRef * (refRound * net - unit - labour);
  const lineTooSmall = !noLine && demandAtRef > cap * 2 && bigLineProfit > bestProfit * 1.5;
  const base = [0.85, 1, 1.15, 1.3, 1.5].map((f) => Math.round((ref * f) / 10) * 10);
  const options = [...base, ...(base.some((x) => Math.abs(x - best) / best < 0.03) ? [] : [best])].sort((a, b) => a - b);
  const bestShown = options.reduce((a, b) => (Math.abs(b - best) < Math.abs(a - best) ? b : a));
  const steep = steepPriceRatio(p.segment, s.company.hq, yf);
  const pct = (pr: number) => {
    const v = Math.round((pr / ref - 1) * 100);
    return v < 0 ? `−%${-v}` : `+%${v}`;
  };
  return (
    <div className="price-guide">
      <h4>Fiyat rehberi</h4>
      {rivalPrices.length > 0 && (
        <p className="small">
          Rakiplerin alıcı fiyatları: en ucuz {money(rivalPrices[0])} · ortanca {money(rivalPrices[Math.floor(rivalPrices.length / 2)])} · en pahalı{' '}
          {money(rivalPrices[rivalPrices.length - 1])}.
        </p>
      )}
      <p className="small">
        Bu fiyatta tahmini talep: <b>{lo.toFixed(1)}–{hi.toFixed(1)} araç/hafta</b>
        {segWeekly > 0 && ` (sınıfın ~${pctWith(d / segWeekly, 'poss')})`} · hat {cap.toFixed(1)} araç/hafta. {verdict}
        {segWeekly > 0 && d / segWeekly > 0.4 && ' Sınıfın bu kadarını tek bir araba nadiren alır: bayiler, üretim ve rakiplerin yanıtı payı sınırlar; tahmini iyimser say.'}
      </p>
      {lineTooSmall && (
        <p className="note small">
          <b>Hat küçük.</b> “En kârlı” fiyat bu hattın az üretmesinden yüksek çıkıyor. Sınıf fiyatında ({money(refRound)}) talep ~{demandAtRef.toFixed(0)} araç/hf: ona yetecek bir
          hatla haftada ~{money(bigLineProfit)} brüt kâr kalır (bu hatla en iyisi {money(bestProfit)}). Fabrika’dan hat kur ya da büyüt; “talebi otomatik karşıla” da kasa
          yettikçe büyütür.
        </p>
      )}
      <table className="table compact">
        <thead>
          <tr>
            <th>Fiyat</th>
            <th className="al-r">Talep (orta)</th>
            <th className="al-r">Haftalık brüt kâr</th>
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
                    {pr === Math.round(ref / 10) * 10 ? 'sınıf fiyatı' : pct(pr)}
                    {pr === bestShown && bestProfit > 0 && <b className="tone-good"> · {noLine ? 'en kârlı' : 'bu hatla en kârlı'}</b>}
                    {pr > ref * steep && ' · dergiler “iddialı” der'}
                  </span>
                </td>
                <td className="al-r">{dm.toFixed(1)}</td>
                <td className={`al-r ${profit < 0 ? 'tone-bad' : ''}`}>{money(profit)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">
        Dergiler fiyatı sınıfa göre tartar: sınıf fiyatının üstüne çıktıkça puan azar azar düşer, bu sınıfta %{Math.round((steep - 1) * 100)} üstünde “iddialı” derler. Ucuz başlayıp
        sonra zam yapmak işe yaramaz: lansmandan sonraki üç yılda %{Math.round(A.HIKE_TOLERANCE * 100)}’den büyük bir zam dergilerin yeniden yazmasına ve itibar kaybına yol açar.
      </p>
    </div>
  );
}

/** When testing is finished, its next step sits right under the stepper, not at the bottom of the page. */
function NextStep({ p }: { p: Project }) {
  const testsDone = p.phase === 'testing' && TESTS.every((t) => p.tests[t.id].done >= p.tests[t.id].planned);
  if (!testsDone) return null;
  return (
    <div className="next-step" role="status">
      <span>
        <b>Test programı bitti.</b> Sırada tedarikçiler ve üretim hattı var.
      </span>
      <Button kind="primary" onClick={() => store.try((st) => A.finishTesting(st, p.id))}>
        Üretim hazırlığına geç
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
      <Panel title="Test programı">
        <BudgetLine b={launchBudget(s, p)} />
        <p className="muted small">Testler her hafta paralel ilerler ve bulunan kusurlar hemen giderilir. Test haftalarını azaltırsan araç daha erken çıkar ama gizli kusurlar sahada patlar.</p>
        {TESTS.map((t) => {
          const plan = p.tests[t.id];
          const locked = t.year > yf;
          return (
            <div key={t.id} className={`test-row ${locked ? 'is-locked' : ''}`}>
              <div className="test-head">
                <b>{t.name}</b>
                <span className="muted small">{locked ? `${inYear(t.year)} gelir` : `${money(weekCost(t))}/hafta`}</span>
              </div>
              <p className="muted small">{t.desc}</p>
              <Slider
                label="Planlanan süre"
                value={plan.planned}
                min={0}
                max={30}
                onChange={(v) => store.try((st) => A.setTestPlan(st, p.id, t.id, v))}
                format={(v) => `${v} hafta`}
                disabled={locked}
              />
              <Progress value={plan.done} max={Math.max(1, plan.planned)} tone={plan.done >= plan.planned ? 'good' : 'accent'} label={`${plan.done}/${plan.planned}`} />
            </div>
          );
        })}
        <div className="row-end">
          <Button kind={running ? 'danger' : 'primary'} onClick={() => store.try((st) => A.finishTesting(st, p.id))}>
            {running ? 'Testleri erken bitir (riskli)' : 'Üretim hazırlığına geç'}
          </Button>
        </div>
      </Panel>
      <aside>
        <Panel title="Kusur raporu">
          <div className="risk">
            <span>Geliştirmeden çıkan gizli kusur (tahmin)</span>
            <b>
              {startRange[0]}–{startRange[1]} kusur
            </b>
          </div>
          <div className="risk">
            <span>Bu test planı bitince kalması beklenen</span>
            <b className={`tone-${risk.tone}`}>
              ~{Math.round(exp)} · {risk.label} risk
            </b>
          </div>
          <p className="muted small">
            Kaç kusur olduğunu kimse kesin bilmez. {s.company.modelsLaunched < 2 ? 'Ekibin ilk arabalarında çok hata yapar; ' : ''}Kalan her kusur sahada
            arıza, garanti masrafı ve geri çağırma demektir. Bazı kusurlar ancak binlerce müşterinin elinde, yıllarca kullanımda ortaya çıkar: en uzun test programı
            bile hepsini yakalayamaz.
          </p>
          <p>
            Bulunan ve giderilen: <b>{found.length}</b>
            {running && <span className="muted small"> · test maliyeti ~{money(weeklyCost)}/hafta</span>}
          </p>
          {found.length > 0 && (
            <ul className="defects">
              {found.map((d) => (
                <li key={d.id}>
                  <Badge tone={d.severity === 'critical' ? 'bad' : d.severity === 'major' ? 'warn' : 'muted'}>{SEVERITY_NAMES[d.severity]}</Badge> {AREA_NAMES[d.area]}:{' '}
                  {defectText(d)} <span className="muted small">— giderildi</span>
                </li>
              ))}
            </ul>
          )}
          <h4>Planın bedeli</h4>
          <p className="small">
            {weeksLeft > 0 ? (
              <>
                <b>{weeksLeft} hafta</b> daha: test gideri ~{money(testCostLeft)}, mühendis maaşları ~{money(weeksLeft * fixedWeekly)}. Araç
                o kadar geç satışa çıkar.
              </>
            ) : (
              'Plan tamamlandı.'
            )}
          </p>
          {weeksLeft - shorterWeeks > 0 && (
            <p className="small muted">
              Her testi 5 hafta kısaltsan: ~{extraDefects.toFixed(1)} kusur daha sahaya çıkar, ama araç {weeksLeft - shorterWeeks} hafta erken satışa çıkar ve ~{money(shorterSaves)} tasarruf
              edersin.
            </p>
          )}
          <h4>Testlerin araca katkısı</h4>
          <p className="small">
            {tuningText(testTuning(p.tests)) || <span className="muted">Testler başlayınca ayarlar iyileşir: dinamometre gücü ve tüketimi, yol testi konfor ve yol tutuşu, çarpışma testi güvenliği, dayanıklılık güvenilirliği.</span>}
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
            note="Dinamometre hızı ve tüketimi, yol testi konfor ve yol tutuşu, çarpışma testi güvenliği, dayanıklılık güvenilirliği ölçer."
          />
        </Panel>
      </aside>
    </div>
  );
}

function tuningText(t: Tuning): string {
  const parts: string[] = [];
  if (t.power > 0.001) parts.push(`güç +%${(t.power * 100).toFixed(1)}`);
  if (t.fuel > 0.001) parts.push(`tüketim −%${(t.fuel * 100).toFixed(1)}`);
  if (t.comfort > 0.05) parts.push(`konfor +${t.comfort.toFixed(1)}`);
  if (t.handling > 0.05) parts.push(`yol tutuş +${t.handling.toFixed(1)}`);
  if (t.safety > 0.05) parts.push(`güvenlik +${t.safety.toFixed(1)}`);
  if (t.reliability > 0.05) parts.push(`güvenilirlik +${t.reliability.toFixed(1)}`);
  return parts.length ? `Şimdiye kadar: ${parts.join(', ')}.` : '';
}

const COMPONENT_NAMES: Record<ComponentKey, string> = { engine: 'Motor', gearbox: 'Şanzıman', electrics: 'Elektrik ve donanım' };

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
      <Panel title="Üretim hazırlığı">
        <p>
          {toolingDef(p.tooling).name} ve ilk parçalar hazırlanıyor ({s.lines.find((l) => l.id === p.lineId)?.name}). Kalan: <b>{left} hafta</b>.
        </p>
        <Progress value={1 - left / 12} />
        <p className="muted small">Bu sürede hat mevcut modeli üretmeye devam eder. Lansmanda yeni model hattı devralır.</p>
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
  const buildAndPick = async (build: (st: GameState) => { ok: boolean; error?: string }, msg: string, what: string, cost: number, weeks: number) => {
    const yes = await store.ask({
      title: `${what} kurulsun mu?`,
      body: `${money(cost)} şimdi ödenir; hat ${weeks} haftada kurulur ve bu arabaya seçilir. Kalıplar da bu sürede hazırlanabilir.`,
      confirm: 'Kur',
    });
    if (!yes) return;
    if (store.try(build, msg)) {
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
            <b>Üretim hazırlığı: araba çizimden fabrikaya geçiyor.</b> Üç karar var; hepsi birim maliyeti, işçilik kalitesini ve lansman tarihini etkiler.
          </p>
          <ol>
            <li>
              <b>Parçalar:</b> motoru, şanzımanı ve elektriği kim yapacak? Tedarikçi fiyatı, kaliteyi ve teslim süresini belirler.
            </li>
            <li>
              <b>Hat:</b> arabayı hangi hat üretecek? Hattın en yavaş bölümü (darboğaz) haftada kaç araba çıkacağını belirler.
            </li>
            <li>
              <b>Kalıplar:</b> gövde panellerini basan kalıplar ve montaj fikstürleri. Parasını şimdi ödersin; kalitesi arabanın işçiliğini ve firesini belirler.
            </li>
          </ol>
        </div>
      </div>
      <div className="grid-2">
        <Panel title="1 · Parçalar: yap ya da al">
          {!g.suppliers ? (
            <p className="muted">
              İlk modelinde parçaları güvenilir tedarikçilerden alıyorsun: pahalı ama sağlam. Kimden alacağına (ya da kendin üretmeye) ikinci modelinde sen karar
              vereceksin.
            </p>
          ) : (
            (Object.keys(COMPONENT_NAMES) as ComponentKey[]).map((k) => (
              <div key={k} className="supplier-row">
                <div className="test-head">
                  <b>{COMPONENT_NAMES[k]}</b>
                  <span className="muted small">parça bedeli {money(st.componentCost[k] * costIndex(yf))}</span>
                </div>
                <Choice
                  value={p.suppliers[k]}
                  onChange={(v) => store.try((st2) => A.setSupplier(st2, p.id, k, v))}
                  options={SUPPLIERS.map((x) => ({
                    value: x.id,
                    label: x.name,
                    disabled: x.id === 'inhouse' && !s.company.shops[k],
                    sub: `${x.costMult < 1 ? '−' : '+'}%${Math.round(Math.abs(1 - x.costMult) * 100)} · ${x.leadWeeks ? `${x.leadWeeks} hf teslim` : 'hemen'} · ${x.desc}`,
                  }))}
                />
                {!s.company.shops[k] && (
                  <Button small kind="ghost" onClick={() => store.try((st2) => A.buildShop(st2, k), 'Atölye kuruldu')}>
                    {COMPONENT_NAMES[k]} atölyesi kur ({money(shopCost(yf))})
                  </Button>
                )}
              </div>
            ))
          )}
          <p>
            Birim malzeme maliyeti: <b>{money(unitNow)}</b>
          </p>
        </Panel>
        <Panel title="2 · Hangi hat üretecek?">
          <p className="muted small">
            Bir hat aynı anda tek model üretir. Başka bir modelin hattını seçersen o model lansmanda hattını kaybeder. Kapasite, bu arabanın üretim zorluğuna göre
            hesaplandı.
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
                    <b>{l.name}</b> · {r.throughput.toFixed(1)} araç/hafta
                    <br />
                    <span className="muted small">
                      {claimedBy
                        ? `${claimedBy.name} projesine ayrıldı`
                        : occupant
                          ? replaced
                            ? `Şu an: ${occupant.name} (yerine geçecek)`
                            : `Şu an: ${occupant.name}; lansmanda bu hattı kaybeder`
                          : building
                            ? `İnşaatta: ${l.buildUntilWeek! - s.week} hafta`
                            : 'Boş'}{' '}
                      · darboğaz: {STAGES.find((x) => x.id === r.bottleneck)?.name}
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
                    <summary className="small">Satıştaki başka arabaların hatları ({taken.length}): seçersen o araba lansmanda hattını kaybeder</summary>
                    <div className="line-pick">{taken.map(option)}</div>
                  </details>
                )}
              </>
            );
          })()}
          {!suggestedLine(s, p) && <p className="note small">Boşta hat yok: bütün hatlarda satıştaki bir araba ya da başka bir proje var. Bu araba için yeni bir hat kur.</p>}
          <div className="line-build">
            <Button small kind="ghost" disabled={s.company.cash < workshop} onClick={() => buildAndPick((st2) => A.buildWorkshopLine(st2, undefined), 'Atölye hattı kuruluyor', 'Küçük atölye hattı', workshop, Math.max(3, Math.round(lineBuildWeeks(yf) / 2)))}>
              + Küçük atölye hattı ({money(workshop)})
            </Button>
            <Button small kind="ghost" disabled={s.company.cash < turnkey} onClick={() => buildAndPick((st2) => A.buildTurnkeyLines(st2, 1, undefined, false), 'Yeni hat kuruluyor', 'Dengeli yeni hat', turnkey, lineBuildWeeks(yf))}>
              + Dengeli yeni hat ({money(turnkey)}, {lineBuildWeeks(yf)} hf)
            </Button>
          </div>
          <p className="muted small">Kapasiteyi sonra Fabrika ekranından büyütebilir ya da “talebi otomatik karşıla” ile fabrikaya bırakabilirsin.</p>
        </Panel>
      </div>
      <Panel title="3 · Kalıplar">
        <Choice
          value={tier}
          onChange={setTier}
          options={TOOLING.map((x) => {
            const q = quoteFor(x.id);
            const eff = Object.entries(x.scores)
              .map(([k, v]) => `${ATTR_NAMES[k as keyof typeof ATTR_NAMES].toLowerCase()} ${v > 0 ? '+' : '−'}${Math.abs(v)}`)
              .join(', ');
            return {
              value: x.id,
              label: x.name,
              sub: (
                <>
                  {q ? `${money(q.cost)} · ${Math.max(q.weeks, q.leadWeeks)} hafta · ` : ''}
                  {x.materialMult !== 1 ? `birim maliyet ${x.materialMult > 1 ? '+' : '−'}%${Math.round(Math.abs(x.materialMult - 1) * 100)}` : 'olağan fire'}
                  {eff ? ` · ${eff}` : ''}
                  <br />
                  {x.desc}
                </>
              ),
            };
          })}
        />
        {quote && (
          <div className="quote">
            <div>
              <span>Kalıp maliyeti</span>
              <b>{money(quote.cost)}</b>
            </div>
            <div>
              <span>Üretime hazır</span>
              <b>{readyWeeks} hafta sonra</b>
            </div>
            <div>
              <span>Birim malzeme</span>
              <b>{money(unitNow)}</b>
            </div>
            <div>
              <span>Hat kapasitesi</span>
              <b>{report ? `${report.throughput.toFixed(1)} araç/hf` : '—'}</b>
            </div>
            {quote.sharedPlatform && <Badge tone="good">Aynı platform: kalıplar büyük ölçüde ortak</Badge>}
          </div>
        )}
        {quote && quote.leadWeeks > quote.weeks && <p className="muted small">Hazırlık süresini parça tedarikçisinin teslimi belirliyor ({quote.leadWeeks} hafta).</p>}
        <Toggle
          checked={p.autoCapacity ?? true}
          onChange={(v) => store.act((st2) => A.setProjectAutoCapacity(st2, p.id, v))}
          label="Satışa çıkınca talebi otomatik karşıla"
          sub="Açıkken fabrika, alıcılar beklediği sürece darboğaza istasyon ekler, hattı genişletir ya da yeni hat kurar; talep düşerse üretimi kısar, uzun süre boş kalan hattı satar. Kasada her zaman birkaç haftalık gider kadar yedek bırakır. Sonradan Model ve Fabrika ekranlarından değiştirebilirsin."
        />
        {!lineId && <p className="note">Kalıpları sipariş etmek için önce arabanın üretileceği hattı seç.</p>}
        {lineId && quote && s.company.cash < quote.cost && <ToolingShort p={p} lineId={lineId} tier={tier} setTier={setTier} cost={quote.cost} />}
        <div className="row-end">
          <Button kind="primary" disabled={!lineId || (quote ? s.company.cash < quote.cost : true)} onClick={() => lineId && store.try((st2) => A.startTooling(st2, p.id, lineId, tier))}>
            {toolingDef(tier).name}: sipariş et{quote ? ` (${money(quote.cost)})` : ''}
          </Button>
        </div>
      </Panel>
    </>
  );
}

/** The dies cost more than the till holds: say so, and show the ways out. */
function ToolingShort({ p, lineId, tier, setTier, cost }: { p: Project; lineId: string; tier: ToolingTier; setTier: (t: ToolingTier) => void; cost: number }) {
  const s = useGameState();
  const shortfall = cost - s.company.cash;
  const room = Math.max(0, credit(s).limit - s.company.loan);
  const cheaper = TOOLING.map((t) => ({ t, q: A.toolingQuote(s, p, lineId, t.id) })).filter((x) => x.t.id !== tier && x.q.cost <= s.company.cash);
  const borrow = Math.ceil((shortfall * 1.05) / 100) * 100;
  return (
    <div className="note tooling-short">
      <p>
        <b>Neden sipariş edilemiyor?</b> {toolingDef(tier).name} {money(cost)} tutuyor, kasada {money(s.company.cash)} var: {money(shortfall)} eksik.
      </p>
      <div className="row">
        {cheaper.map(({ t, q }) => (
          <Button key={t.id} small onClick={() => setTier(t.id)}>
            {t.name} seç ({money(q.cost)}, kasaya yetiyor)
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
              }, `${money(borrow)} kredi alındı, kalıplar sipariş edildi`)
            }
          >
            Eksiği krediyle karşıla ({money(borrow)} kredi)
          </Button>
        )}
        {s.company.reputation >= 5 && (
          <Button
            small
            onClick={() =>
              store.ask({
                title: 'Kalıpçıya vadeli sipariş',
                body: `Kalıpçı parayı sonra, satışlardan almayı kabul ediyor ama %${Math.round(A.VENDOR_CREDIT * 100)} fazlasını istiyor: ${money(cost * (1 + A.VENDOR_CREDIT))} şirketin borcuna eklenir ve faiz işler. Bankanın kredi limiti bu borcu da sayar.`,
                confirm: 'Vadeli sipariş et',
              }).then((yes) => yes && store.try((st2) => A.startTooling(st2, p.id, lineId, tier, { vendorCredit: true }), 'Kalıplar vadeli sipariş edildi'))
            }
          >
            Kalıpçıya vadeli sipariş et (+%{Math.round(A.VENDOR_CREDIT * 100)}, borca eklenir)
          </Button>
        )}
      </div>
      {!cheaper.length && room < borrow && (
        <p className="small muted">Kasa ve banka kredisi yetmiyor. Vadeli sipariş son çıkış yolu; ya da satıştaki arabalardan para gelmesini bekle, gereksiz mühendisleri çıkar.</p>
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
    if (id) store.try((st) => A.setProjectLine(st, p.id, id), 'Yeni hat bu arabaya ayrıldı');
  };
  return (
    <Panel title="Bu arabanın hattı yok">
      <p>Kalıplar hazır ama yapıldıkları hat artık yok (satıldı ya da başka bir arabaya verildi). Lansmandan önce arabanın üretileceği hattı seç ya da yeni bir hat kur.</p>
      {free.length > 0 && (
        <div className="line-pick">
          {free.map((l) => (
            <button key={l.id} type="button" className="line-option" onClick={() => store.try((st) => A.setProjectLine(st, p.id, l.id), `${l.name} seçildi`)}>
              <span>
                <b>{l.name}</b>{' '}
                <span className="muted small">{live(l.modelId) ? `şu an ${s.models.find((m) => m.id === l.modelId)?.name}; lansmanda hattını kaybeder` : 'boş'}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="line-build">
        <Button small disabled={s.company.cash < workshop} onClick={() => buildAndAssign((st) => A.buildWorkshopLine(st, undefined))}>
          + Küçük atölye hattı ({money(workshop)})
        </Button>
        <Button small disabled={s.company.cash < turnkey} onClick={() => buildAndAssign((st) => A.buildTurnkeyLines(st, 1, undefined, false))}>
          + Dengeli yeni hat ({money(turnkey)}, {lineBuildWeeks(yf)} hf)
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
  const [markets, setMarkets] = useState<MarketId[]>(unlocked);
  // A show can cost a young firm half its till: the player turns it on, never by default.
  const [autoShow, setAutoShow] = useState(false);
  const preview = A.previewModel(s, p, price, markets);
  const line = s.lines.find((l) => l.id === p.lineId);
  const cap = line ? lineReport(s, line, st.complexity).throughput : 0;
  const unit = materialUnitCost(s, preview);
  const labour = line && cap > 0 ? lineUpkeep(s, line, 1) / cap : 0;
  const segmentWeekly = markets.reduce((a, m) => a + weeklySegmentDemand(m, p.segment, yf), 0);
  const net = price * (s.markets[s.company.hq].dealerLevel > 0 ? 1 - DEALER_COMMISSION : 1);
  const margin = net - unit - labour;
  // A week at the middle demand estimate: what the car brings in against what the firm costs to run.
  const demand = markets.reduce((a, mk) => a + demandAtPrice(s, preview, mk, price), 0);
  const sold = Math.min(demand, cap);
  const labourWeek = line ? lineUpkeep(s, line, cap > 0 ? sold / cap : 0) : 0;
  const contribution = sold * (net - unit) - labourWeek;
  const fixed = s.company.engineers * engineerSalary(yf) + (s.company.researchers ?? 0) * researcherSalary(yf) + overhead(yf, s.lines.length) + MARKET_IDS.reduce((a, m) => a + dealerUpkeep(s, m), 0);
  const weeklyNet = contribution - fixed;
  const others = s.models.some((m) => m.status === 'active' && m.id !== p.replacesModelId);
  // With other cars on sale their profit already carries the fixed costs.
  const now = recentProfit(s, 8);
  const showCost = A.autoShowCost(s, markets);
  const showShare = s.company.cash > 0 ? showCost / s.company.cash : 1;
  return (
    <div className="grid-2">
      <Panel title="Fiyat ve pazarlar">
        <NumberInput label="Fabrika çıkış fiyatı" prefix="$" value={price} min={1} step={10} onChange={setPrice} />
        <p className="muted small">
          Sınıfın tipik fiyatı: {money(referencePrice(s.company.hq, p.segment, yf))}. Fiyat enflasyona göre otomatik güncellenir; istersen Modeller ekranından değiştirirsin.
        </p>
        {MARKETS.map((mk) => {
          const open = s.markets[mk.id].unlocked;
          const cp = consumerPrice(price, mk.id, mk.id !== s.company.hq, st, yf);
          const segSize = weeklySegmentDemand(mk.id, p.segment, yf);
          return (
            <Toggle
              key={mk.id}
              checked={markets.includes(mk.id)}
              disabled={!open}
              onChange={(v) => setMarkets(v ? [...markets, mk.id] : markets.filter((x) => x !== mk.id))}
              label={`${mk.flag} ${mk.name}`}
              sub={
                open
                  ? `Alıcıya fiyat ${money(cp.total)}${cp.tariff ? ` (gümrük ${money(cp.tariff)})` : ''}${cp.tax ? ` (vergi ${money(cp.tax)})` : ''} · segment ${num(segSize * 52)} araç/yıl · tipik fiyat ${money(referencePrice(mk.id, p.segment, yf))}`
                  : 'İlk modelinden sonra açılır'
              }
            />
          );
        })}
        <Toggle
          checked={autoShow}
          onChange={setAutoShow}
          label="Otomobil fuarında tanıt"
          sub={
            <>
              {money(showCost)} ·{' '}
              <span className={showShare > 0.25 ? 'tone-bad' : ''}>kasanın {pctOf(showShare)}</span> · bilinirlik ve lansman heyecanı artar
            </>
          }
        />
      </Panel>
      <Panel title="Lansman özeti">
        <div className="quote">
          <div>
            <span>Seçili pazarlarda segment ({markets.map((mk) => MARKETS.find((x) => x.id === mk)!.name).join(' + ')})</span>
            <b>
              {num(segmentWeekly * 52)} araç/yıl <span className="muted small">(haftada {segmentWeekly.toFixed(0)})</span>
            </b>
          </div>
          <div>
            <span>Hat kapasitesi</span>
            <b>{cap.toFixed(1)} araç/hafta</b>
          </div>
          <div>
            <span>Malzeme / araç</span>
            <b>{money(unit)}</b>
          </div>
          <div>
            <span>İşçilik / araç (tam kapasite)</span>
            <b>{money(labour)}</b>
          </div>
          <div>
            <span>Araç başı brüt kâr (tam kapasite)</span>
            <b className={margin < 0 ? 'tone-bad' : 'tone-good'}>{money(margin)}</b>
          </div>
          <div>
            <span>Beklenen satış (orta tahmin)</span>
            <b>{sold.toFixed(1)} araç/hafta</b>
          </div>
          <div>
            <span>Aracın haftalık katkısı</span>
            <b className={contribution < 0 ? 'tone-bad' : ''}>{money(contribution)}</b>
          </div>
          <div>
            <span>Sabit giderler (maaş, genel gider, bayi)</span>
            <b>{money(-fixed)}</b>
          </div>
          {others ? (
            <div>
              <span>Şirketin haftalık kârı: şimdi → bu araçla</span>
              <b className={now + contribution < 0 ? 'tone-bad' : 'tone-good'}>
                {money(now)} → {money(now + contribution)}
              </b>
            </div>
          ) : (
            <div>
              <span>Haftalık net</span>
              <b className={weeklyNet < 0 ? 'tone-bad' : 'tone-good'}>{money(weeklyNet)}</b>
            </div>
          )}
        </div>
        {weeklyNet < 0 && !others && (
          <p className="small tone-bad">
            Bu fiyatta ve beklenen talepte şirket haftada {money(-weeklyNet)} kaybeder. Hat işçiliği az üretimde de ödenir; fiyatı, hattı ya da mühendis sayısını gözden
            geçir.
          </p>
        )}
        <PriceGuide p={p} price={price} setPrice={setPrice} markets={markets} cap={cap} unit={unit} labour={labour} />
        <p className="muted small">
          Alıcıların aracını nasıl karşılayacağını lansmanda göreceksin: dergi puanları, rakiplerle karşılaştırma ve dört hafta sonra ilk ay raporu.
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
            🎉 Lansmanı yap
          </Button>
        </div>
        <p className="muted small">Hat: {line?.name ?? '—'}</p>
      </Panel>
    </div>
  );
}
