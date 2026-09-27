import { useState } from 'react';
import * as A from '../../core/actions';
import { FOCUS_HINTS, FOCUS_KEYS, FOCUS_NAMES, bonusFromPoints, productivity } from '../../core/development';
import { engineersBusy, gates, materialUnitCost } from '../../core/game';
import { lineReport, lineUpkeep } from '../../core/factory';
import { consumerPrice, demandAtPrice, referencePrice } from '../../core/market';
import { AREA_NAMES, SEVERITY_NAMES, SUPPLIERS, TESTS, expectedRemaining, riskLabel } from '../../core/testing';
import { yearFloat } from '../../core/time';
import { DEALER_COMMISSION, costIndex, shopCost } from '../../data/economy';
import { MARKETS } from '../../data/markets';
import { segmentDef } from '../../data/segments';
import type { ComponentKey, FocusKey, MarketId, Project, ProjectPhase, TestId } from '../../core/types';
import { store, useGameState } from '../store';
import { money } from '../format';
import { inYear } from '../format';
import { Badge, Button, Choice, NumberInput, Panel, Progress, Slider, Toggle } from '../components/ui';
import { StatsPanel, useCarStats } from '../components/StatsPanel';
import { Designer, DesignFooter } from './Designer';
import { PHASE_LABEL } from './Projects';

const PHASES: ProjectPhase[] = ['design', 'development', 'testing', 'production', 'ready'];

export function ProjectView({ projectId }: { projectId: string }) {
  const s = useGameState();
  const p = s.projects.find((x) => x.id === projectId)!;
  const idx = PHASES.indexOf(p.phase);
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
            {p.kind === 'facelift' ? ' · makyaj projesi' : p.replacesModelId ? ' · yeni kuşak' : ''} · hedef fiyat {money(p.targetPrice)}
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
        {PHASES.map((ph, i) => (
          <li key={ph} className={i < idx ? 'is-done' : i === idx ? 'is-on' : ''}>
            {PHASE_LABEL[ph]}
          </li>
        ))}
      </ol>
      {p.phase === 'design' && (
        <>
          <Designer project={p} />
          <DesignFooter project={p} />
        </>
      )}
      {p.phase === 'development' && <Development p={p} />}
      {p.phase === 'testing' && <Testing p={p} />}
      {p.phase === 'production' && <Production p={p} />}
      {p.phase === 'ready' && <Launch p={p} />}
    </div>
  );
}

function Development({ p }: { p: Project }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const busyElsewhere = engineersBusy(s) - p.engineers;
  const maxEng = Math.max(1, s.company.engineers - busyElsewhere);
  const rate = p.engineers * productivity(s.company.skill);
  const remaining = Math.max(0, p.dev.required - p.dev.done);
  const done = p.dev.done >= p.dev.required;
  const pctDone = Math.round((p.dev.done / p.dev.required) * 100);
  // What the car gets if development runs to 100% with the current focus.
  const projectedPoints = { ...p.dev.points };
  for (const k of FOCUS_KEYS) projectedPoints[k] += p.dev.focus[k] * remaining;
  const bonus = bonusFromPoints(projectedPoints, p.dev.required, Math.max(p.dev.done, p.dev.required), s.company.skill);
  const polish = bonus.reliability - (s.company.skill - 50) * 0.08;
  const paused = store.speed === 0;
  const setFocus = (k: FocusKey, v: number) => {
    const others = FOCUS_KEYS.filter((x) => x !== k);
    const rest = others.reduce((a, x) => a + p.dev.focus[x], 0);
    const next = { ...p.dev.focus, [k]: v };
    // Keep the total at 100%: scale the other sliders.
    for (const x of others) next[x] = rest > 0 ? (p.dev.focus[x] / rest) * (1 - v) : (1 - v) / others.length;
    store.act((st) => A.setFocus(st, p.id, next));
  };
  const effect: Record<FocusKey, string> = {
    performance: `Güç +%${((bonus.powerMult - 1) * 100).toFixed(1)}`,
    efficiency: `Tüketim −%${((1 - bonus.fuelMult) * 100).toFixed(1)}`,
    comfort: `Konfor +${bonus.comfort.toFixed(1)}`,
    safety: `Güvenlik +${bonus.safety.toFixed(1)}`,
    cost: `Maliyet −%${((1 - bonus.costMult) * 100).toFixed(1)}`,
  };
  return (
    <div className="grid-2 wide-left">
      <div>
        <Panel title="Geliştirme">
          <div className="howto">
            {done ? (
              <p>
                <b>Geliştirme bitti.</b> Şimdi teste geçebilirsin. İstersen zamanı biraz daha akıtıp aracı cilalayabilirsin: cila güvenilirliği artırır (şu an +
                {polish.toFixed(1)}, en fazla %160’a kadar).
              </p>
            ) : (
              <p>
                <b>Ne yapmalıyım?</b> Mühendislerin her hafta çalışır ve çubuk dolar. Bu sırada aşağıdan odağı ayarla. Çubuk %100 olunca “Teste geç” düğmesi açılır.
              </p>
            )}
            {paused && (
              <Button kind="primary" onClick={() => store.setSpeed(store.lastSpeed)}>
                ▶ Zamanı başlat
              </Button>
            )}
          </div>
          <Progress value={Math.min(p.dev.done, p.dev.required * 1.6)} max={p.dev.required * 1.6} label={`%${pctDone}`} />
          <Slider
            label="Mühendis sayısı"
            value={p.engineers}
            min={1}
            max={maxEng}
            onChange={(v) => store.act((st) => A.setProjectEngineers(st, p.id, v))}
            format={(v) => `${v} kişi`}
            hint={done ? 'Temel geliştirme bitti.' : `Kalan süre: ~${Math.ceil(remaining / Math.max(0.1, rate))} hafta. Daha çok mühendis daha hızlı bitirir (Finans ekranından işe al).`}
          />
          <div className="row-end">
            <Button kind="primary" disabled={!done} onClick={() => store.try((st) => A.finishDevelopment(st, p.id))}>
              {done ? 'Prototipleri yap, teste geç' : `Geliştirme sürüyor (%${pctDone})`}
            </Button>
          </div>
        </Panel>
        <Panel title="Mühendislik odağı">
          <p className="muted small">
            Mühendislerin zamanını alanlara böl; toplam her zaman %100. Sağdaki değerler, geliştirme bu dağılımla biterse aracın kazanacağı iyileştirmeler. Hangi alanın
            önemli olduğu segmente bağlı: segmentin açıklamasına ve dergi yorumlarına bak.
          </p>
          {FOCUS_KEYS.map((k) => (
            <div key={k} className="focus-row">
              <Slider
                label={
                  <>
                    {FOCUS_NAMES[k]} <span className="muted small">({FOCUS_HINTS[k]})</span>
                  </>
                }
                value={Math.round(p.dev.focus[k] * 100)}
                min={0}
                max={100}
                onChange={(v) => setFocus(k, v / 100)}
                format={(v) => `%${v}`}
              />
              <span className="focus-effect">{effect[k]}</span>
            </div>
          ))}
        </Panel>
      </div>
      <aside>
        <Panel title="Bitince beklenen sonuç" tight>
          <StatsPanel s={s} design={p.design} segment={p.segment} yf={yf} bonus={bonus} targetPrice={p.targetPrice} compact />
        </Panel>
      </aside>
    </div>
  );
}

function Testing({ p }: { p: Project }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const planned = Object.fromEntries(TESTS.map((t) => [t.id, p.tests[t.id].planned])) as Record<TestId, number>;
  const exp = expectedRemaining(p.defectPrior, planned);
  const risk = riskLabel(exp);
  const found = p.defects.filter((d) => d.found);
  const running = TESTS.some((t) => p.tests[t.id].done < p.tests[t.id].planned);
  const weeklyCost = TESTS.filter((t) => p.tests[t.id].done < p.tests[t.id].planned).reduce(
    (a, t) => a + t.costPerWeek * costIndex(yf) * (0.6 + 0.4 * p.design.size + (0.2 * p.design.engine.cylinders) / 4),
    0,
  );
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
                <span className="muted small">{locked ? `${inYear(t.year)} gelir` : `${money(t.costPerWeek * costIndex(yf))}+/hafta`}</span>
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
            <span>Tahmini gizli kusur</span>
            <b className={`tone-${risk.tone}`}>
              ~{exp.toFixed(1)} · {risk.label} risk
            </b>
          </div>
          <p className="muted small">Tahmin, planlanan testlere göre hesaplanır. Kaç kusur olduğunu kimse kesin bilmez.</p>
          <p>
            Bulunan ve giderilen: <b>{found.length}</b>
            {running && <span className="muted small"> · test maliyeti ~{money(weeklyCost)}/hafta</span>}
          </p>
          {found.length > 0 && (
            <ul className="defects">
              {found.map((d) => (
                <li key={d.id}>
                  <Badge tone={d.severity === 'critical' ? 'bad' : d.severity === 'major' ? 'warn' : 'muted'}>{SEVERITY_NAMES[d.severity]}</Badge> {AREA_NAMES[d.area]}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </aside>
    </div>
  );
}

const COMPONENT_NAMES: Record<ComponentKey, string> = { engine: 'Motor', gearbox: 'Şanzıman', electrics: 'Elektrik ve donanım' };

function Production({ p }: { p: Project }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const st = useCarStats(p.design, yf, p.bonus);
  const g = gates(s);
  const [lineId, setLineId] = useState(p.lineId ?? s.lines.find((l) => !l.modelId)?.id ?? s.lines[0]?.id);
  const started = p.productionReadyWeek !== undefined;
  if (started) {
    const left = Math.max(0, (p.productionReadyWeek ?? 0) - s.week);
    return (
      <Panel title="Üretim hazırlığı">
        <p>
          Kalıplar ve ilk parçalar hazırlanıyor ({s.lines.find((l) => l.id === p.lineId)?.name}). Kalan: <b>{left} hafta</b>.
        </p>
        <Progress value={1 - left / 12} />
        <p className="muted small">Bu sürede hat mevcut modeli üretmeye devam eder. Lansmanda yeni model hattı devralır.</p>
      </Panel>
    );
  }
  const unitNow = materialUnitCost(s, { stats: st, suppliers: p.suppliers, unitsBuilt: 0 });
  const quote = lineId ? A.toolingQuote(s, p, lineId) : null;
  return (
    <div className="grid-2">
      <Panel title="Yap ya da satın al">
        {!g.suppliers ? (
          <p className="muted">İlk modelinde parçaları güvenilir tedarikçilerden alıyorsun. Bu karar ikinci modelinle açılacak.</p>
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
      <Panel title="Üretim hattı">
        <p className="muted small">Bir hat aynı anda tek model üretir. Başka modelin hattını seçersen, lansmanda o model bu hattı kaybeder.</p>
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
                  <span className="muted small">{occupant ? `Şu an: ${occupant.name}` : 'Boş'}</span>
                </span>
              </label>
            );
          })}
        </div>
        <Button small kind="ghost" onClick={() => store.try((st2) => A.buyLine(st2), 'Yeni hat kuruldu. Fabrika ekranından istasyon ekle.')}>
          + Yeni hat kur
        </Button>
        {quote && (
          <div className="quote">
            <div>
              <span>Kalıp maliyeti</span>
              <b>{money(quote.cost)}</b>
            </div>
            <div>
              <span>Hazırlık süresi</span>
              <b>{Math.max(quote.weeks, quote.leadWeeks)} hafta</b>
            </div>
            {quote.sharedPlatform && <Badge tone="good">Aynı platform: kalıplar büyük ölçüde ortak</Badge>}
          </div>
        )}
        <div className="row-end">
          <Button kind="primary" disabled={!lineId} onClick={() => lineId && store.try((st2) => A.startTooling(st2, p.id, lineId))}>
            Kalıpları sipariş et
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function Launch({ p }: { p: Project }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const st = useCarStats(p.design, yf, p.bonus);
  const unlocked = MARKETS.filter((m) => s.markets[m.id].unlocked).map((m) => m.id);
  const [price, setPrice] = useState(() => Math.round(p.kind === 'facelift' ? p.targetPrice : referencePrice(s.company.hq, p.segment, yf)));
  const [markets, setMarkets] = useState<MarketId[]>(unlocked);
  const [autoShow, setAutoShow] = useState(true);
  const preview = A.previewModel(s, p, price, markets);
  const line = s.lines.find((l) => l.id === p.lineId);
  const cap = line ? lineReport(s, line, st.complexity).throughput : 0;
  const unit = materialUnitCost(s, preview);
  const labour = line && cap > 0 ? lineUpkeep(s, line, 1) / cap : 0;
  const demand = markets.map((m) => ({ m, d: demandAtPrice(s, preview, m, price) }));
  const totalDemand = demand.reduce((a, x) => a + x.d, 0);
  const net = price * (s.markets[s.company.hq].dealerLevel > 0 ? 1 - DEALER_COMMISSION : 1);
  const margin = net - unit - labour;
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
          const d = demand.find((x) => x.m === mk.id)?.d ?? 0;
          return (
            <Toggle
              key={mk.id}
              checked={markets.includes(mk.id)}
              disabled={!open}
              onChange={(v) => setMarkets(v ? [...markets, mk.id] : markets.filter((x) => x !== mk.id))}
              label={`${mk.flag} ${mk.name}`}
              sub={
                open
                  ? `Alıcıya fiyat ${money(cp.total)}${cp.tariff ? ` (gümrük ${money(cp.tariff)})` : ''}${cp.tax ? ` (vergi ${money(cp.tax)})` : ''} · tahmini talep ${d.toFixed(1)}/hafta`
                  : 'İlk modelinden sonra açılır'
              }
            />
          );
        })}
        <Toggle
          checked={autoShow}
          onChange={setAutoShow}
          label="Otomobil fuarında tanıt"
          sub={`${money(A.autoShowCost(s, markets))} · bilinirlik ve lansman heyecanı artar`}
        />
      </Panel>
      <Panel title="Lansman özeti">
        <div className="quote">
          <div>
            <span>Tahmini talep</span>
            <b>{totalDemand.toFixed(1)} araç/hafta</b>
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
            <span>Araç başı brüt kâr</span>
            <b className={margin < 0 ? 'tone-bad' : 'tone-good'}>{money(margin)}</b>
          </div>
        </div>
        {totalDemand > cap * 1.2 && <p className="note">Talep kapasiteyi aşıyor: fiyatı artırabilir ya da fabrikayı büyütebilirsin.</p>}
        {totalDemand < cap * 0.5 && cap > 0 && <p className="note">Kapasite talebin çok üstünde: stok birikir. Fiyatı düşür ya da üretim hızını azalt.</p>}
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
