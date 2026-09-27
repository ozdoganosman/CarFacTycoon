import { useState } from 'react';
import * as A from '../../core/actions';
import { dealerUpkeep, gates, materialUnitCost, protoUnitCost } from '../../core/game';
import { lineReport, lineUpkeep, turnkeyLineCost } from '../../core/factory';
import { MARKET_IDS, consumerPrice, demandAtPrice, referencePrice, segmentMarket, steepPriceRatio, weeklySegmentDemand } from '../../core/market';
import { AREA_NAMES, SEVERITY_NAMES, SUPPLIERS, TESTS, defectRange, defectText, expectedRemaining, riskLabel, testTuning, testWeekCost, type Tuning } from '../../core/testing';
import { yearFloat } from '../../core/time';
import { DEALER_COMMISSION, costIndex, engineerSalary, overhead, shopCost } from '../../data/economy';
import { MARKETS } from '../../data/markets';
import { ATTRS, ATTR_NAMES, segmentDef } from '../../data/segments';
import { STAGES } from '../../data/stations';
import { TOOLING, toolingDef } from '../../data/tooling';
import type { ComponentKey, MarketId, Project, ProjectPhase, TestId, ToolingTier } from '../../core/types';
import { store, useGameState } from '../store';
import { money, recentProfit } from '../format';
import { inYear } from '../format';
import { Badge, Button, Choice, NumberInput, Panel, Progress, Slider, Toggle } from '../components/ui';
import { newEstimate } from '../../core/estimate';
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
          <Designer project={p} readOnly={p.phase === 'development'} below={<FocusPanel project={p} />} />
        </>
      )}
      {p.phase === 'testing' && <Testing p={p} />}
      {p.phase === 'production' && <Production p={p} />}
      {p.phase === 'ready' && <Launch p={p} />}
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
  const d = demandAt(price);
  const lo = d / spread;
  const hi = d * spread;
  // Judged on the middle estimate: the range is wide enough to cover almost any line.
  const verdict =
    d > cap * 1.2
      ? `Orta tahmin hattın ${(d / Math.max(0.1, cap)).toFixed(1)} katı: fiyatı biraz yükseltebilir ya da kapasite ekleyebilirsin.`
      : d < cap * 0.8
        ? `Hat orta tahminin ${(cap / Math.max(0.1, d)).toFixed(1)} katını üretebilir: fiyatı düşürmeyi ya da daha küçük bir hattı düşün.`
        : 'Orta tahmine göre talep ve kapasite dengeli.';
  const options = [0.9, 1, 1.1, 1.2].map((f) => Math.round((ref * f) / 10) * 10);
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
        Bu fiyatta tahmini talep: <b>{lo.toFixed(1)}–{hi.toFixed(1)} araç/hafta</b> · hat {cap.toFixed(1)} araç/hafta. {verdict}
      </p>
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
            const profit = Math.min(dm, cap) * (pr * net - unit - labour);
            return (
              <tr key={pr} className={Math.abs(pr - price) < 5 ? 'is-mine' : ''}>
                <td>
                  <button type="button" className="link-btn" onClick={() => setPrice(pr)}>
                    {money(pr)}
                  </button>{' '}
                  <span className="muted small">
                    {pr === Math.round(ref / 10) * 10 ? 'sınıf fiyatı' : pct(pr)}
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
  const [lineId, setLineId] = useState(p.lineId ?? s.lines.find((l) => !l.modelId)?.id ?? s.lines[0]?.id);
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
  const readyWeeks = quote ? Math.max(quote.weeks, quote.leadWeeks) : 0;
  const turnkey = turnkeyLineCost(s.week, false);
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
          <div className="line-pick">
            {s.lines.map((l) => {
              const r = lineReport(s, l, st.complexity);
              const occupant = s.models.find((m) => m.id === l.modelId && m.status === 'active');
              return (
                <label key={l.id} className={`line-option ${lineId === l.id ? 'is-on' : ''}`}>
                  <input type="radio" name="line" checked={lineId === l.id} onChange={() => setLineId(l.id)} />
                  <span>
                    <b>{l.name}</b> · {r.throughput.toFixed(1)} araç/hafta
                    <br />
                    <span className="muted small">
                      {occupant ? `Şu an: ${occupant.name}` : 'Boş'} · darboğaz: {STAGES.find((x) => x.id === r.bottleneck)?.name}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <Button small kind="ghost" disabled={s.company.cash < turnkey} onClick={() => store.try((st2) => A.buildTurnkeyLines(st2, 1, undefined, false), 'Yeni hat kuruldu')}>
            + Dengeli yeni hat kur ({money(turnkey)})
          </Button>
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
        <div className="row-end">
          <Button kind="primary" disabled={!lineId || (quote ? s.company.cash < quote.cost : true)} onClick={() => lineId && store.try((st2) => A.startTooling(st2, p.id, lineId, tier))}>
            {toolingDef(tier).name}: sipariş et{quote ? ` (${money(quote.cost)})` : ''}
          </Button>
        </div>
      </Panel>
    </>
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
  const fixed = s.company.engineers * engineerSalary(yf) + overhead(yf, s.lines.length) + MARKET_IDS.reduce((a, m) => a + dealerUpkeep(s, m), 0);
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
                  ? `Alıcıya fiyat ${money(cp.total)}${cp.tariff ? ` (gümrük ${money(cp.tariff)})` : ''}${cp.tax ? ` (vergi ${money(cp.tax)})` : ''} · segment ${segSize.toFixed(0)} araç/hafta · tipik fiyat ${money(referencePrice(mk.id, p.segment, yf))}`
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
              <span className={showShare > 0.25 ? 'tone-bad' : ''}>kasanın %{Math.round(showShare * 100)}’i</span> · bilinirlik ve lansman heyecanı artar
            </>
          }
        />
      </Panel>
      <Panel title="Lansman özeti">
        <div className="quote">
          <div>
            <span>Seçili pazarlarda segment</span>
            <b>{segmentWeekly.toFixed(0)} araç/hafta</b>
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
