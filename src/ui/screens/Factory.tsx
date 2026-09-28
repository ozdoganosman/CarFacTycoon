import { useState } from 'react';
import * as A from '../../core/actions';
import { AUTO_HOLD_TEXT } from '../../core/autocap';
import {
  MILITARY_COMPLEXITY,
  NIGHT_SHIFT_COST,
  NIGHT_SHIFT_OUTPUT,
  blackPaintIsFaster,
  emptyLine,
  lineOffline,
  lineReport,
  lineUpkeep,
  modernizeQuote,
  planBalancedLine,
  stationPrice,
  turnkeyLineCost,
  workshopLineCost,
  workshopPlan,
} from '../../core/factory';
import { yearFloat } from '../../core/time';
import { DEALER_COMMISSION, MAX_SLOTS, costIndex, lineBuildWeeks, newLineCost, realWage, shopCost, slotCost } from '../../data/economy';
import { materialUnitCost } from '../../core/game';
import { priceNow } from '../../core/market';
import { STAGES, STATIONS, stationDef } from '../../data/stations';
import type { CarModel, ComponentKey, GameState, ProductionLine, StageId } from '../../core/types';
import { store, useGameState } from '../store';
import { money, num } from '../format';
import { Badge, Button, Panel, Toggle } from '../components/ui';
import { LineViz } from '../viz/LineViz';

const SHOP_NAMES: Record<ComponentKey, string> = { engine: 'Motor atölyesi', gearbox: 'Şanzıman atölyesi', electrics: 'Elektrik atölyesi' };

export function Factory() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const military = (s.flags.militaryUntil ?? 0) > yf;
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>Fabrika</h1>
          <p className="muted">En yavaş istasyon bütün hattın hızını belirler. Darboğaz kırmızı yanar.</p>
        </div>
        <Button kind="ghost" onClick={() => store.try((st) => A.buyLine(st), 'Boş hat kuruldu')}>
          + Boş hat, elle doldur ({money(newLineCost(yf))})
        </Button>
      </div>
      <CapacityPlanner />
      {military && (
        <p className="note">
          Askeri sözleşme sürüyor. Askeri üretimdeki hatlar masrafını ve araç başına {money(55 * costIndex(yf))} kâr getirir.
        </p>
      )}
      {s.lines.map((l, i) => (
        <LinePanel key={l.id} line={l} military={military} defaultOpen={s.lines.length <= 3 || i === 0} />
      ))}
      <Panel title="Parça atölyeleri (yap ya da satın al)">
        <p className="muted small">Atölye kurarsan o parçayı kendin üretebilirsin: tedarikçiden %15 ucuz, kalite mühendislik becerine bağlı.</p>
        <div className="shops">
          {(Object.keys(SHOP_NAMES) as ComponentKey[]).map((k) => (
            <div key={k} className="shop">
              <b>{SHOP_NAMES[k]}</b>
              {s.company.shops[k] ? (
                <Badge tone="good">Kuruldu</Badge>
              ) : (
                <Button small onClick={() => store.try((st) => A.buildShop(st, k), `${SHOP_NAMES[k]} kuruldu`)}>
                  Kur ({money(shopCost(yf))})
                </Button>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/** Weekly output of the lines that build this model (none while retooling). */
function modelCapacity(s: GameState, m: CarModel): number {
  return s.lines
    .filter((l) => l.modelId === m.id && !l.military && !lineOffline(s, l))
    .reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
}

/**
 * Money to capacity in one decision: new balanced lines, or rebuilding old
 * ones with today's machines.
 */
function CapacityPlanner() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const active = s.models.filter((m) => m.status === 'active');
  const [pick, setPick] = useState<string>('');
  const [count, setCount] = useState(1);
  const blackOption = blackPaintIsFaster(yf);
  const usesBlack = s.lines.some((l) => l.stations.paint.some((id) => stationDef(id).blackOnly));
  const [black, setBlack] = useState(usesBlack);
  const allowBlack = blackOption && black;
  // Without a choice, the car buyers are waiting for most (never a model nobody wants).
  const demandOf = (x: (typeof active)[number]) => Object.values(x.lastDemand ?? {}).reduce((a, b) => a + b, 0);
  const gapOf = (x: (typeof active)[number]) => demandOf(x) - modelCapacity(s, x);
  const short = active.filter((x) => gapOf(x) >= 0.5).sort((a, b) => gapOf(b) - gapOf(a));
  const suggested = short[0] ?? [...active].sort((a, b) => demandOf(b) - demandOf(a))[0];
  const m = active.find((x) => x.id === pick) ?? suggested;
  const perLine = (b: boolean) =>
    lineReport(s, { ...emptyLine('plan', 'plan'), slots: MAX_SLOTS, stations: planBalancedLine(yf, b) }, m?.stats.complexity ?? 1).throughput;
  const each = turnkeyLineCost(s.week, allowBlack) + (m ? A.retoolCost(s, m) : 0);
  const shopEach = workshopLineCost(s.week) + (m ? A.retoolCost(s, m) : 0);
  const shopCap = lineReport(s, { ...emptyLine('plan', 'plan'), stations: workshopPlan(yf) }, m?.stats.complexity ?? 1).throughput;
  const demand = m ? Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0) : 0;
  const cap = m ? modelCapacity(s, m) : 0;
  const upgrades = s.lines
    .map((l) => ({ l, q: modernizeQuote(l, s.week, allowBlack) }))
    .filter(({ q }) => q.after > q.before * 1.02);
  const upgradeCost = upgrades.reduce((a, u) => a + Math.max(0, u.q.cost), 0);
  const affordable = Math.max(0, Math.floor(s.company.cash / each));
  // What one more line earns if every car it builds is sold: years to pay for itself.
  const planLine = { ...emptyLine('plan', 'plan'), slots: MAX_SLOTS, stations: planBalancedLine(yf, allowBlack) };
  const margin = m ? priceNow(m, s.week) * (1 - DEALER_COMMISSION) - materialUnitCost(s, m) - lineUpkeep(s, planLine, 1) / Math.max(0.1, perLine(allowBlack)) : 0;
  const payback = margin > 0 ? each / (margin * perLine(allowBlack) * 52) : Infinity;
  const build = lineBuildWeeks(yf);
  return (
    <Panel title="Kapasite planlayıcı" className="planner">
      {active.length ? (
        <>
          <div className="planner-models">
            {active.map((x) => {
              const d = Object.values(x.lastDemand ?? {}).reduce((a, b) => a + b, 0);
              const c = modelCapacity(s, x);
              return (
                <div key={x.id} className={`planner-model ${x.id === m?.id ? 'is-on' : ''}`}>
                  <button type="button" onClick={() => setPick(x.id)}>
                    <b>{x.name}</b>
                    <span className="small">
                      talep ~{d.toFixed(0)}/hf · üretim {c.toFixed(1)}/hf
                    </span>
                    {d > c * 1.1 && d - c >= 0.5 && <span className="small tone-bad">~{(d - c).toFixed(0)} araç/hf kaçıyor</span>}
                    {x.autoCapacity && x.autoHold && d > c * 1.05 && (
                      <span className="small tone-warn">
                        otomatik durdu: {AUTO_HOLD_TEXT[x.autoHold]}
                        {x.autoHint && <b className="auto-hint"> Çıkış yolu: {x.autoHint}.</b>}
                      </span>
                    )}
                  </button>
                  <Toggle checked={!!x.autoCapacity} onChange={(v) => store.act((st) => A.setModelAutoCapacity(st, x.id, v))} label="Otomatik" title="Açıkken fabrika, alıcılar beklediği sürece darboğaza istasyon ekler, hattı genişletir ya da yeni hat kurar; talep düşerse üretimi kısar, uzun süre boş kalan hattı satar. Kasada her zaman birkaç haftalık gider kadar yedek bırakır." />
                </div>
              );
            })}
          </div>
          {m && (
            <div className="planner-form">
              <p>
                <b>Anahtar teslim hat:</b> tam boy, bugünün en iyi makineleriyle ve dengeli kurulur (hiçbir bölüm darboğazın besleyebileceğinden fazla makine
                almaz). {m.name} için hat başına <b>+{perLine(allowBlack).toFixed(1)} araç/hf</b>, kalıp dahil <b>{money(each)}</b>. Binası ve makineleri{' '}
                <b>{build} haftada</b> kurulur.{' '}
                {payback < Infinity ? (
                  <>
                    Ürettiği her araç satılırsa araç başına ~{money(margin)} kalır: hat kendini <b className={payback > 3 ? 'tone-warn' : ''}>~{payback < 1 ? `${Math.max(1, Math.round(payback * 12))} ayda` : `${payback.toFixed(1)} yılda`}</b> öder.
                  </>
                ) : (
                  <span className="tone-bad">Bu fiyatla araç başına para kalmıyor: yeni hat kendini ödemez.</span>
                )}
              </p>
              {blackOption && (
                <Toggle
                  checked={black}
                  onChange={setBlack}
                  label={`Siyah vernik fırını kullan: hat başına ${perLine(false).toFixed(1)} yerine ${perLine(true).toFixed(1)} araç/hf`}
                  sub="Çok daha hızlı kurur ama araç yalnızca siyah olur: prestij −5."
                />
              )}
              {shopEach < each * 0.5 && (
                <div className="planner-row planner-shop">
                  <span className="small">
                    <b>Küçük atölye hattı:</b> başlangıçtaki atölye gibi, el işçiliği makineleriyle. Yavaş ve araç başına işçiliği pahalı ama ucuz: +{shopCap.toFixed(1)} araç/hf,
                    kalıp dahil <b>{money(shopEach)}</b>.
                  </span>
                  <Button disabled={s.company.cash < shopEach} onClick={() => store.try((st) => A.buildWorkshopLine(st, m.id), `Atölye hattı kuruldu: ${m.name}`)}>
                    Atölye hattı kur
                  </Button>
                </div>
              )}
              <div className="planner-row">
                <div className="stepper" role="group" aria-label="Kurulacak hat sayısı">
                  <button type="button" className="icon-btn" onClick={() => setCount(Math.max(1, count - 1))} aria-label="Bir hat az">
                    −
                  </button>
                  <b>{count} hat</b>
                  <button type="button" className="icon-btn icon-add" onClick={() => setCount(Math.min(20, count + 1))} aria-label="Bir hat fazla">
                    +
                  </button>
                </div>
                <span className="muted small">
                  Toplam {money(each * count)} · +{(perLine(allowBlack) * count).toFixed(0)} araç/hf
                  {demand > cap && ` · açığı kapatmak için ~${Math.ceil((demand - cap) / Math.max(0.1, perLine(allowBlack)))} hat`}
                  {` · kasan ${affordable} hatta yetiyor`}
                </span>
                <Button
                  kind="primary"
                  disabled={count > affordable}
                  onClick={async () => {
                    const okd = await store.ask({
                      title: `${count} yeni hat kurulsun mu?`,
                      body: `${m.name} için ${count} anahtar teslim hat: ${money(each * count)} şimdi ödenir, hatlar ${build} hafta sonra üretime başlar (+${(perLine(allowBlack) * count).toFixed(0)} araç/hf). Talep şu an ~${demand.toFixed(0)}/hf, üretim ${cap.toFixed(1)}/hf.`,
                      confirm: `${count} hat kur`,
                    });
                    if (okd) store.try((st) => A.buildTurnkeyLines(st, count, m.id, allowBlack), `${count} hat inşa ediliyor: ${m.name}`);
                  }}
                >
                  {count} hat kur
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="muted">Satışta model yok. Hat kurmadan önce bir araç çıkar.</p>
      )}
      {upgrades.length > 0 && (
        <div className="planner-upgrade">
          <span>
            <b>{upgrades.length} hat eski makinelerle çalışıyor.</b> Hepsini bugünün makineleriyle yenile: net {money(upgradeCost)} (eski makineler satılır), 2 hafta
            kurulum.
          </span>
          <Button
            disabled={s.company.cash < upgradeCost}
            onClick={async () => {
              const okd = await store.ask({
                title: `${upgrades.length} hat yenilensin mi?`,
                body: `Eski makineler satılır, yerine bugünün makineleri gelir: net ${money(upgradeCost)}. Her hat kurulum sırasında 2 hafta üretmez.`,
                confirm: 'Hepsini yenile',
              });
              if (!okd) return;
              for (const u of upgrades) store.try((st) => A.modernizeLine(st, u.l.id, allowBlack));
              store.showToast(`${upgrades.length} hat yenilendi`, 'good');
            }}
          >
            Hepsini yenile
          </Button>
        </div>
      )}
    </Panel>
  );
}

function LinePanel({ line, military, defaultOpen }: { line: ProductionLine; military: boolean; defaultOpen: boolean }) {
  const s = useGameState();
  const [open, setOpen] = useState(defaultOpen);
  const yf = yearFloat(s.week);
  const model = s.models.find((m) => m.id === line.modelId && m.status === 'active');
  const isMilitary = military && line.military;
  const complexity = isMilitary ? MILITARY_COMPLEXITY : model?.stats.complexity ?? 1;
  const r = lineReport(s, line, complexity);
  const retooling = line.retoolUntilWeek !== undefined && s.week < line.retoolUntilWeek;
  const building = line.buildUntilWeek !== undefined && s.week < line.buildUntilWeek;
  const running = !!(isMilitary || (model && !retooling && !building));
  const rate = isMilitary ? 1 : model ? model.productionRate : 0;
  const upkeep = lineUpkeep(s, line, rate);
  const active = s.models.filter((m) => m.status === 'active');
  const wage = costIndex(yf) * realWage(yf);
  // Keep black paint only where the line (or the model's other lines) already accepts it.
  const blackOk = s.lines.some((l) => l.modelId === line.modelId && l.stations.paint.some((id) => stationDef(id).blackOnly));
  const modern = modernizeQuote(line, s.week, blackOk);
  return (
    <Panel
      title={
        <button type="button" className="line-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span aria-hidden>{open ? '▾' : '▸'}</span> {line.name}{' '}
          <span className="muted small">
            · {isMilitary ? 'askeri üretim' : model ? model.name : 'boş'}{building ? ` · inşaatta (${line.buildUntilWeek! - s.week} hf)` : ''} · {r.throughput.toFixed(1)} araç/hafta · işçilik {money(upkeep)}/hafta
            {running && <> · darboğaz: {STAGES.find((x) => x.id === r.bottleneck)!.name}</>}
          </span>
        </button>
      }
      actions={
        <div className="line-actions">
          <select
            aria-label="Hatta üretilecek model"
            value={line.modelId ?? ''}
            onChange={async (e) => {
              const v = e.target.value || undefined;
              if (v) {
                const m = s.models.find((x) => x.id === v)!;
                const ok = await store.ask({
                  title: `${line.name} hattında ${m.name} üretilsin mi?`,
                  body: `Hat yeniden ayarlanır: 3 hafta üretim durur ve ${money(A.retoolCost(s, m))} kalıp masrafı çıkar.`,
                  confirm: 'Hattı ayarla',
                });
                if (!ok) return;
              }
              store.try((st) => A.assignLine(st, line.id, v));
            }}
          >
            <option value="">— Boş —</option>
            {active.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({money(A.retoolCost(s, m))})
              </option>
            ))}
          </select>
          {military && <Toggle checked={!!line.military} onChange={(v) => store.try((st) => A.setLineMilitary(st, line.id, v))} label="Askeri üretim" />}
        </div>
      }
    >
      {open && (
        <>
      <LineViz
        line={line}
        perStage={r.perStage}
        bottleneck={r.bottleneck}
        running={running}
        label={building ? `İnşaat sürüyor: ${line.buildUntilWeek! - s.week} hafta sonra üretime hazır` : retooling ? 'Kalıp değişimi sürüyor…' : 'Hat boşta: bir model ata'}
      />
      <div className="stages">
        {STAGES.map((st) => (
          <StageColumn key={st.id} line={line} stage={st.id} bottleneck={running && r.bottleneck === st.id} capacity={r.perStage[st.id]} wage={wage} />
        ))}
      </div>
      <div className="row-between">
        <span className="muted small">
          Bölüm başına yer: {line.slots}/{MAX_SLOTS}
          {model && !isMilitary && ` · ${model.name} üretim zorluğu ${model.stats.complexity.toFixed(2)}`}
        </span>
        <span className="line-btns">
          {line.slots < MAX_SLOTS && (
            <Button small onClick={() => store.try((st) => A.expandLine(st, line.id), 'Hat genişletildi')}>
              Hattı genişlet ({money(slotCost(yf, line.slots))})
            </Button>
          )}
          {modern.after > modern.before * 1.02 && (
            <Button small kind="primary" onClick={() => store.try((st) => A.modernizeLine(st, line.id, blackOk), `${line.name} yenilendi`)}>
              Yenile: ham kapasite {num(modern.before)} → {num(modern.after)} ({money(Math.max(0, modern.cost))})
            </Button>
          )}
        </span>
      </div>
        </>
      )}
    </Panel>
  );
}

function StageColumn({ line, stage, bottleneck, capacity, wage }: { line: ProductionLine; stage: StageId; bottleneck: boolean; capacity: number; wage: number }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const def = STAGES.find((x) => x.id === stage)!;
  const options = STATIONS.filter((x) => x.stage === stage && x.year <= yf);
  const full = line.stations[stage].length >= line.slots;
  const groups: { id: string; count: number }[] = [];
  for (const id of line.stations[stage]) {
    const g = groups.find((x) => x.id === id);
    if (g) g.count++;
    else groups.push({ id, count: 1 });
  }
  return (
    <div className={`stage ${bottleneck ? 'is-bottleneck' : ''}`}>
      <div className="stage-head">
        <b>{def.name}</b>
        <span className={bottleneck ? 'tone-bad' : 'muted'}>{capacity.toFixed(1)}/hf</span>
      </div>
      {bottleneck && <Badge tone="bad">Darboğaz</Badge>}
      <ul className="stations">
        {groups.map(({ id, count }) => {
          const d = stationDef(id);
          return (
            <li key={id} title={d.desc}>
              <span className="station-name">
                {d.name} {count > 1 && <b>×{count}</b>}
                <small className="muted">
                  {d.capacity}/hf · {money(d.upkeep * wage)}/hf{count > 1 ? ' (her biri)' : ''}
                </small>
              </span>
              <span className="station-btns">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Bir ${d.name} sat`}
                  title="Birini sat (%30 geri alınır)"
                  onClick={() => store.try((st) => A.sellStation(st, line.id, stage, line.stations[stage].lastIndexOf(id)))}
                >
                  −
                </button>
                <button
                  type="button"
                  className="icon-btn icon-add"
                  aria-label={`Bir ${d.name} daha al`}
                  title={full ? 'Yer yok' : `Bir tane daha al (${money(stationPrice(id, s.week))})`}
                  disabled={full || d.year > yf}
                  onClick={() => store.try((st) => A.buyStation(st, line.id, stage, id))}
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
        {line.slots - line.stations[stage].length > 0 && (
          <li className="slot-empty">{line.slots - line.stations[stage].length} boş yer</li>
        )}
      </ul>
      <select
        aria-label={`${def.name} bölümüne istasyon ekle`}
        value=""
        disabled={full}
        onChange={(e) => e.target.value && store.try((st) => A.buyStation(st, line.id, stage, e.target.value))}
      >
        <option value="">{full ? 'Yer yok' : '+ İstasyon ekle'}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}: {o.capacity}/hf · {money(stationPrice(o.id, s.week))}
            {o.blackOnly ? ' · sadece siyah' : ''}
          </option>
        ))}
      </select>
      <span className="muted small">{num(line.stations[stage].reduce((a, id) => a + stationDef(id).capacity, 0))} ham kapasite</span>
      {line.stations[stage].length > 0 && (
        <Toggle
          checked={!!line.nightShift?.[stage]}
          onChange={(v) => store.try((st) => A.setNightShift(st, line.id, stage, v))}
          label="Gece vardiyası"
          sub={`+%${Math.round((NIGHT_SHIFT_OUTPUT - 1) * 100)} kapasite · işçilik ×${NIGHT_SHIFT_COST}`}
        />
      )}
    </div>
  );
}
