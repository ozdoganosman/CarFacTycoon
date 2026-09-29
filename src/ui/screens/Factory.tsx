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
import { credit, materialUnitCost } from '../../core/game';
import { priceNow } from '../../core/market';
import { STAGES, STATIONS, stationDef } from '../../data/stations';
import type { CarModel, ComponentKey, GameState, ProductionLine, StageId } from '../../core/types';
import { store, useGameState } from '../store';
import { money, num, pct } from '../format';
import { Badge, Button, Panel, Toggle } from '../components/ui';
import { LineViz } from '../viz/LineViz';
import { t, msg } from '../../i18n';
import { tx } from '../i18n';

const SHOP_NAMES: Record<ComponentKey, string> = { engine: msg('Motor atölyesi'), gearbox: msg('Şanzıman atölyesi'), electrics: msg('Elektrik atölyesi') };

export function Factory() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const military = (s.flags.militaryUntil ?? 0) > yf;
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>{t('Fabrika')}</h1>
          <p className="muted">{t('En yavaş istasyon bütün hattın hızını belirler. Darboğaz kırmızı yanar.')}</p>
        </div>
        <Button kind="ghost" onClick={() => store.try((st) => A.buyLine(st), t('Boş hat kuruldu'))}>
          {t('+ Boş hat, elle doldur ({cost})', { cost: money(newLineCost(yf)) })}
        </Button>
      </div>
      <CapacityPlanner />
      {military && (
        <p className="note">
          {t('Askeri sözleşme sürüyor. Askeri üretimdeki hatlar masrafını ve araç başına {profit} kâr getirir.', { profit: money(55 * costIndex(yf)) })}
        </p>
      )}
      {s.lines.map((l, i) => (
        <LinePanel key={l.id} line={l} military={military} defaultOpen={s.lines.length <= 3 || i === 0} />
      ))}
      <Panel title={t('Parça atölyeleri (yap ya da satın al)')}>
        <p className="muted small">{t('Atölye kurarsan o parçayı kendin üretebilirsin: tedarikçiden %15 ucuz, kalite mühendislik becerine bağlı.')}</p>
        <div className="shops">
          {(Object.keys(SHOP_NAMES) as ComponentKey[]).map((k) => (
            <div key={k} className="shop">
              <b>{t(SHOP_NAMES[k])}</b>
              {s.company.shops[k] ? (
                <Badge tone="good">{t('Kuruldu')}</Badge>
              ) : (
                <Button small onClick={() => store.try((st) => A.buildShop(st, k), t('{shop} kuruldu', { shop: t(SHOP_NAMES[k]) }))}>
                  {t('Kur ({cost})', { cost: money(shopCost(yf)) })}
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
  const [sizePick, setSizePick] = useState<number | undefined>(undefined);
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
  const SIZES = [2, 3, 4, 6, MAX_SLOTS];
  const outputAt = (b: boolean, k: number) =>
    lineReport(s, { ...emptyLine('plan', 'plan'), slots: Math.max(3, k), stations: planBalancedLine(yf, b, k) }, m?.stats.complexity ?? 1).throughput;
  // Without a choice: the smallest hall that covers what buyers are missing.
  const missing = m ? Math.max(0, demandOf(m) - modelCapacity(s, m)) : 0;
  const fits = SIZES.find((k) => outputAt(allowBlack, k) >= missing) ?? MAX_SLOTS;
  const size = sizePick ?? fits;
  const perLine = (b: boolean) => outputAt(b, size);
  const each = turnkeyLineCost(s.week, allowBlack, size) + (m ? A.retoolCost(s, m) : 0);
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
  const planLine = { ...emptyLine('plan', 'plan'), slots: Math.max(3, size), stations: planBalancedLine(yf, allowBlack, size) };
  const margin = m ? priceNow(m, s.week) * (1 - DEALER_COMMISSION) - materialUnitCost(s, m) - lineUpkeep(s, planLine, 1) / Math.max(0.1, perLine(allowBlack)) : 0;
  const payback = margin > 0 ? each / (margin * perLine(allowBlack) * 52) : Infinity;
  const build = lineBuildWeeks(yf);
  return (
    <Panel title={t('Kapasite planlayıcı')} className="planner">
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
                      {t('talep ~{demand}/hf · üretim {output}/hf', { demand: d.toFixed(0), output: c.toFixed(1) })}
                    </span>
                    {d > c * 1.1 && d - c >= 0.5 && <span className="small tone-bad">{t('~{n} araç/hf kaçıyor', { n: Math.round(d - c) })}</span>}
                    {x.autoCapacity && x.autoHold && d > c * 1.05 && (
                      <span className="small tone-warn">
                        {t('otomatik durdu: {reason}', { reason: t(AUTO_HOLD_TEXT[x.autoHold]) })}
                        {x.autoHint && <b className="auto-hint">{' '}{t('Çıkış yolu: {hint}.', { hint: x.autoHint })}</b>}
                      </span>
                    )}
                  </button>
                  <Toggle
                    checked={!!x.autoCapacity}
                    onChange={(v) => store.act((st) => A.setModelAutoCapacity(st, x.id, v))}
                    label={t('Otomatik')}
                    title={t('Açıkken fabrika, alıcılar beklediği sürece darboğaza istasyon ekler, hattı genişletir ya da yeni hat kurar; talep düşerse üretimi kısar, uzun süre boş kalan hattı satar. Kasada her zaman birkaç haftalık gider kadar yedek bırakır.')}
                  />
                </div>
              );
            })}
          </div>
          {m && (
            <div className="planner-form">
              <p>
                {tx(
                  '<b>Anahtar teslim hat:</b> bugünün en iyi makineleriyle ve dengeli kurulur (hiçbir bölüm darboğazın besleyebileceğinden fazla makine almaz). {model} için {size} yerli hat başına <b>+{output} araç/hf</b>, kalıp dahil <b>{cost}</b>. Binası ve makineleri <b>{n} haftada</b> kurulur.',
                  { model: m.name, size, output: perLine(allowBlack).toFixed(1), cost: money(each), n: build },
                )}{' '}
                {payback < Infinity ? (
                  <>
                    {payback < 1
                      ? tx(
                          'Ürettiği her araç satılırsa araç başına ~{margin} kalır: hat kendini <pay>~{n} ayda</pay> öder.',
                          { margin: money(margin), n: Math.max(1, Math.round(payback * 12)) },
                          { pay: (c, k) => <b key={k} className={payback > 3 ? 'tone-warn' : ''}>{c}</b> },
                        )
                      : tx(
                          'Ürettiği her araç satılırsa araç başına ~{margin} kalır: hat kendini <pay>~{years} yılda</pay> öder.',
                          { margin: money(margin), years: payback.toFixed(1) },
                          { pay: (c, k) => <b key={k} className={payback > 3 ? 'tone-warn' : ''}>{c}</b> },
                        )}
                  </>
                ) : (
                  <span className="tone-bad">{t('Bu fiyatla araç başına para kalmıyor: yeni hat kendini ödemez.')}</span>
                )}
              </p>
              <div className="preset-chips" role="radiogroup" aria-label={t('Hat boyu')}>
                <span className="small muted">{t('Hat boyu (bölüm başına yer):')}</span>
                {SIZES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={size === k}
                    className={`chip ${size === k ? 'is-on' : ''}`}
                    onClick={() => setSizePick(k)}
                    title={t('{output} araç/hf · {cost}', { output: outputAt(allowBlack, k).toFixed(1), cost: money(turnkeyLineCost(s.week, allowBlack, k) + A.retoolCost(s, m)) })}
                  >
                    {k === fits && sizePick === undefined
                      ? t('{n} yer · {output}/hf (açığa göre)', { n: k, output: outputAt(allowBlack, k).toFixed(0) })
                      : t('{n} yer · {output}/hf', { n: k, output: outputAt(allowBlack, k).toFixed(0) })}
                  </button>
                ))}
              </div>
              {blackOption && (
                <Toggle
                  checked={black}
                  onChange={setBlack}
                  label={t('Siyah vernik fırını kullan: hat başına {normal} yerine {black} araç/hf', { normal: perLine(false).toFixed(1), black: perLine(true).toFixed(1) })}
                  sub={t('Çok daha hızlı kurur ama araç yalnızca siyah olur: prestij −5.')}
                />
              )}
              {shopEach < each * 0.5 && (
                <div className="planner-row planner-shop">
                  <span className="small">
                    {tx(
                      '<b>Küçük atölye hattı:</b> başlangıçtaki atölye gibi, el işçiliği makineleriyle. Yavaş ve araç başına işçiliği pahalı ama ucuz: +{output} araç/hf, kalıp dahil <b>{cost}</b>.',
                      { output: shopCap.toFixed(1), cost: money(shopEach) },
                    )}
                  </span>
                  <Button disabled={s.company.cash < shopEach} onClick={() => store.try((st) => A.buildWorkshopLine(st, m.id), t('Atölye hattı kuruldu: {model}', { model: m.name }))}>
                    {t('Atölye hattı kur')}
                  </Button>
                </div>
              )}
              <div className="planner-row">
                <div className="stepper" role="group" aria-label={t('Kurulacak hat sayısı')}>
                  <button type="button" className="icon-btn" onClick={() => setCount(Math.max(1, count - 1))} aria-label={t('Bir hat az')}>
                    −
                  </button>
                  <b>{t('{n} hat', { n: count })}</b>
                  <button type="button" className="icon-btn icon-add" onClick={() => setCount(Math.min(20, count + 1))} aria-label={t('Bir hat fazla')}>
                    +
                  </button>
                </div>
                <span className="muted small">
                  {t('Toplam {cost} · +{output} araç/hf', { cost: money(each * count), output: (perLine(allowBlack) * count).toFixed(0) })}
                  {demand > cap && ` · ${t('açığı kapatmak için ~{n} hat', { n: Math.ceil((demand - cap) / Math.max(0.1, perLine(allowBlack))) })}`}
                  {` · ${t('kasan {n} hatta yetiyor', { n: affordable })}`}
                </span>
                <Button
                  kind="primary"
                  disabled={count > affordable}
                  onClick={async () => {
                    const okd = await store.ask({
                      title: t('{n} yeni hat kurulsun mu?', { n: count }),
                      body: t(
                        '{model} için {n} anahtar teslim hat: {cost} şimdi ödenir, hatlar {weeks} hafta sonra üretime başlar (+{output} araç/hf). Talep şu an ~{demand}/hf, üretim {cap}/hf.',
                        {
                          model: m.name,
                          n: count,
                          cost: money(each * count),
                          weeks: build,
                          output: (perLine(allowBlack) * count).toFixed(0),
                          demand: demand.toFixed(0),
                          cap: cap.toFixed(1),
                        },
                      ),
                      confirm: t('{n} hat kur', { n: count }),
                    });
                    if (okd) store.try((st) => A.buildTurnkeyLines(st, count, m.id, allowBlack, size), t('{n} hat inşa ediliyor: {model}', { n: count, model: m.name }));
                  }}
                >
                  {t('{n} hat kur', { n: count })}
                </Button>
              </div>
              {(() => {
                // A line that pays for itself soon but the till is short: the bank can bridge it.
                const short = each * count - s.company.cash;
                const room = credit(s).limit - s.company.loan;
                if (short <= 0 || payback > 2) return null;
                return room >= short ? (
                  <p className="note small planner-loan">
                    {payback < 1
                      ? t('Kasada {cash} var, eksik {short}. Hat ~{n} ayda kendini ödüyorsa eksiği kredi ile kapatmak mantıklı olabilir (faiz yılda {rate}).', {
                          cash: money(s.company.cash),
                          short: money(short),
                          n: Math.max(1, Math.round(payback * 12)),
                          rate: pct(credit(s).rate, 0),
                        })
                      : t('Kasada {cash} var, eksik {short}. Hat ~{years} yılda kendini ödüyorsa eksiği kredi ile kapatmak mantıklı olabilir (faiz yılda {rate}).', {
                          cash: money(s.company.cash),
                          short: money(short),
                          years: payback.toFixed(1),
                          rate: pct(credit(s).rate, 0),
                        })}{' '}
                    <Button small onClick={() => store.try((st) => A.takeLoan(st, Math.ceil(short / 1000) * 1000), t('Kredi alındı'))}>
                      {t('{amount} kredi al', { amount: money(Math.ceil(short / 1000) * 1000) })}
                    </Button>
                  </p>
                ) : (
                  <p className="note small planner-loan">
                    {t('Kasa ve banka kredisi ({credit}) bu hattı kurmaya yetmiyor: daha küçük bir hat boyu seç ya da hatları tek tek büyüt.', { credit: money(Math.max(0, room)) })}
                  </p>
                );
              })()}
            </div>
          )}
        </>
      ) : (
        <p className="muted">{t('Satışta model yok. Hat kurmadan önce bir araç çıkar.')}</p>
      )}
      {upgrades.length > 0 && (
        <div className="planner-upgrade">
          <span>
            {tx('<b>{n} hat eski makinelerle çalışıyor.</b> Hepsini bugünün makineleriyle yenile: net {cost} (eski makineler satılır), 2 hafta kurulum.', {
              n: upgrades.length,
              cost: money(upgradeCost),
            })}
          </span>
          <Button
            disabled={s.company.cash < upgradeCost}
            onClick={async () => {
              const okd = await store.ask({
                title: t('{n} hat yenilensin mi?', { n: upgrades.length }),
                body: t('Eski makineler satılır, yerine bugünün makineleri gelir: net {cost}. Her hat kurulum sırasında 2 hafta üretmez.', { cost: money(upgradeCost) }),
                confirm: t('Hepsini yenile'),
              });
              if (!okd) return;
              for (const u of upgrades) store.try((st) => A.modernizeLine(st, u.l.id, allowBlack));
              store.showToast(t('{n} hat yenilendi', { n: upgrades.length }), 'good');
            }}
          >
            {t('Hepsini yenile')}
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
  const nights = STAGES.filter((st) => line.stations[st.id].length > 0 && line.nightShift?.[st.id]).length;
  const staffed = STAGES.filter((st) => line.stations[st.id].length > 0).length;
  const night = nights === 0 ? t('kapalı') : nights >= staffed ? t('açık') : t('{on}/{all} bölümde', { on: nights, all: staffed });
  return (
    <Panel
      title={
        <button type="button" className="line-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span aria-hidden>{open ? '▾' : '▸'}</span> {line.name}{' '}
          <span className="muted small">
            · {isMilitary ? t('askeri üretim') : model ? model.name : t('boş')}
            {building ? ` · ${t('inşaatta ({n} hf)', { n: line.buildUntilWeek! - s.week })}` : ''} ·{' '}
            {t('{output} araç/hafta · işçilik {cost}/hafta', { output: r.throughput.toFixed(1), cost: money(upkeep) })}
            {running && <> · {t('darboğaz: {stage}', { stage: t(STAGES.find((x) => x.id === r.bottleneck)!.name) })}</>}
            {staffed > 0 && <> · {t('gece vardiyası: {state}', { state: night })}</>}
          </span>
        </button>
      }
      actions={
        <div className="line-actions">
          {staffed > 0 && (
            <Toggle
              checked={nights > 0 && nights >= staffed}
              onChange={(v) => store.try((st) => A.setLineNightShift(st, line.id, v))}
              label={t('Gece vardiyası (tüm hat)')}
            />
          )}
          <select
            aria-label={t('Hatta üretilecek model')}
            value={line.modelId ?? ''}
            onChange={async (e) => {
              const v = e.target.value || undefined;
              if (v) {
                const m = s.models.find((x) => x.id === v)!;
                const ok = await store.ask({
                  title: t('{line} hattında {model} üretilsin mi?', { line: line.name, model: m.name }),
                  body: t('Hat yeniden ayarlanır: 3 hafta üretim durur ve {cost} kalıp masrafı çıkar.', { cost: money(A.retoolCost(s, m)) }),
                  confirm: t('Hattı ayarla'),
                });
                if (!ok) return;
              }
              store.try((st) => A.assignLine(st, line.id, v));
            }}
          >
            <option value="">{t('— Boş —')}</option>
            {active.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({money(A.retoolCost(s, m))})
              </option>
            ))}
          </select>
          {military && <Toggle checked={!!line.military} onChange={(v) => store.try((st) => A.setLineMilitary(st, line.id, v))} label={t('Askeri üretim')} />}
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
        label={
          building
            ? t('İnşaat sürüyor: {n} hafta sonra üretime hazır', { n: line.buildUntilWeek! - s.week })
            : retooling
              ? t('Kalıp değişimi sürüyor…')
              : t('Hat boşta: bir model ata')
        }
      />
      <div className="stages">
        {STAGES.map((st) => (
          <StageColumn key={st.id} line={line} stage={st.id} bottleneck={running && r.bottleneck === st.id} capacity={r.perStage[st.id]} wage={wage} />
        ))}
      </div>
      <div className="row-between">
        <span className="muted small">
          {t('Bölüm başına yer: {slots}/{max}', { slots: line.slots, max: MAX_SLOTS })}
          {model && !isMilitary && ` · ${t('{model} üretim zorluğu {value}', { model: model.name, value: model.stats.complexity.toFixed(2) })}`}
        </span>
        <span className="line-btns">
          {line.slots < MAX_SLOTS && (
            <Button small onClick={() => store.try((st) => A.expandLine(st, line.id), t('Hat genişletildi'))}>
              {t('Hattı genişlet ({cost})', { cost: money(slotCost(yf, line.slots)) })}
            </Button>
          )}
          {modern.after > modern.before * 1.02 && (
            <Button small kind="primary" onClick={() => store.try((st) => A.modernizeLine(st, line.id, blackOk), t('{line} yenilendi', { line: line.name }))}>
              {t('Yenile: ham kapasite {before} → {after} ({cost})', { before: num(modern.before), after: num(modern.after), cost: money(Math.max(0, modern.cost)) })}
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
        <b>{t(def.name)}</b>
        <span className={bottleneck ? 'tone-bad' : 'muted'}>{t('{v}/hf', { v: capacity.toFixed(1) })}</span>
      </div>
      {bottleneck && <Badge tone="bad">{t('Darboğaz')}</Badge>}
      <ul className="stations">
        {groups.map(({ id, count }) => {
          const d = stationDef(id);
          return (
            <li key={id} title={t(d.desc)}>
              <span className="station-name">
                {t(d.name)} {count > 1 && <b>×{count}</b>}
                <small className="muted">
                  {count > 1
                    ? t('{cap}/hf · {cost}/hf (her biri)', { cap: d.capacity, cost: money(d.upkeep * wage) })
                    : t('{cap}/hf · {cost}/hf', { cap: d.capacity, cost: money(d.upkeep * wage) })}
                </small>
              </span>
              <span className="station-btns">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('Bir {station} sat', { station: t(d.name) })}
                  title={t('Birini sat (%30 geri alınır)')}
                  onClick={() => store.try((st) => A.sellStation(st, line.id, stage, line.stations[stage].lastIndexOf(id)))}
                >
                  −
                </button>
                <button
                  type="button"
                  className="icon-btn icon-add"
                  aria-label={t('Bir {station} daha al', { station: t(d.name) })}
                  title={full ? t('Yer yok') : t('Bir tane daha al ({cost})', { cost: money(stationPrice(id, s.week)) })}
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
          <li className="slot-empty">{t('{n} boş yer', { n: line.slots - line.stations[stage].length })}</li>
        )}
      </ul>
      <select
        aria-label={t('{stage} bölümüne istasyon ekle', { stage: t(def.name) })}
        value=""
        disabled={full}
        onChange={(e) => e.target.value && store.try((st) => A.buyStation(st, line.id, stage, e.target.value))}
      >
        <option value="">{full ? t('Yer yok') : t('+ İstasyon ekle')}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.blackOnly
              ? t('{station}: {cap}/hf · {cost} · sadece siyah', { station: t(o.name), cap: o.capacity, cost: money(stationPrice(o.id, s.week)) })
              : t('{station}: {cap}/hf · {cost}', { station: t(o.name), cap: o.capacity, cost: money(stationPrice(o.id, s.week)) })}
          </option>
        ))}
      </select>
      <span className="muted small">{t('{v} ham kapasite', { v: num(line.stations[stage].reduce((a, id) => a + stationDef(id).capacity, 0)) })}</span>
      {line.stations[stage].length > 0 && (
        <Toggle
          checked={!!line.nightShift?.[stage]}
          onChange={(v) => store.try((st) => A.setNightShift(st, line.id, stage, v))}
          label={t('Gece vardiyası')}
          sub={t('+{extra} kapasite · işçilik ×{cost}', { extra: pct(NIGHT_SHIFT_OUTPUT - 1, 0), cost: NIGHT_SHIFT_COST })}
        />
      )}
    </div>
  );
}
