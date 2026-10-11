import { useEffect, useState } from 'react';
import * as A from '../../core/actions';
import { autoAllowsBlack, autoHoldText, autoHorizon, demandGap, newLineSize, weeklyDemand } from '../../core/autocap';
import {
  LINE_SIZES,
  MILITARY_COMPLEXITY,
  NIGHT_SHIFT_COST,
  NIGHT_SHIFT_OUTPUT,
  blackPaintIsFaster,
  emptyLine,
  lineOffline,
  lineReport,
  lineUpkeep,
  modernizeQuote,
  paybackMonths,
  paybackYears,
  stationPrice,
  turnkeyQuote,
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
import { cars, dec, money, num, pct } from '../format';
import { Badge, Button, Info, Panel, Toggle, ScreenTitle } from '../components/ui';
import { LineViz } from '../viz/LineViz';
import { PlantsPanel } from '../components/Investments';
import { t, msg } from '../../i18n';
import { tx } from '../i18n';

const SHOP_NAMES: Record<ComponentKey, string> = { engine: msg('Motor atölyesi'), gearbox: msg('Şanzıman atölyesi'), electrics: msg('Elektrik atölyesi') };

export function Factory() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const military = (s.flags.militaryUntil ?? 0) > yf;
  const active = s.models.filter((m) => m.status === 'active');
  // A line picked on the plan: its group and its panel open.
  const [focus, setFocus] = useState<string | null>(null);
  const pick = (id: string) => {
    setFocus(id);
    setTimeout(() => document.getElementById(`line-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };
  const few = s.lines.length <= 3;
  const groups: { key: string; title: string; color?: string; lines: ProductionLine[] }[] = [
    ...active.map((m, i) => ({ key: m.id, title: m.name, color: modelColor(i), lines: s.lines.filter((l) => l.modelId === m.id && !(military && l.military)) })),
    { key: 'military', title: t('Askeri üretim'), lines: military ? s.lines.filter((l) => l.military) : [] },
    { key: 'idle', title: t('Boş hatlar'), lines: s.lines.filter((l) => !(military && l.military) && !active.some((m) => m.id === l.modelId)) },
  ].filter((g) => g.lines.length > 0);
  return (
    <div className="screen">
      <div className="screen-head">
        <ScreenTitle id="factory" title={t('Fabrika')} intro={t('En yavaş istasyon bütün hattın hızını belirler. Darboğaz kırmızı yanar.')} />
      </div>
      {military && (
        <p className="note">
          {t('Askeri sözleşme sürüyor. Askeri üretimdeki hatlar masrafını ve araç başına {profit} kâr getirir.', { profit: money(55 * costIndex(yf)) })}
        </p>
      )}
      {!few && <FloorPlan military={military} onPick={pick} />}
      <Panel title={t('Kapasite')} className="planner">
        {active.length ? (
          active.map((m, i) => <ModelCapacity key={m.id} m={m} color={modelColor(i)} />)
        ) : (
          <p className="muted">{t('Satışta model yok. Hat kurmadan önce bir araç çıkar.')}</p>
        )}
        <ModernizeAll />
      </Panel>
      <div className="row-between line-groups-head">
        <h2 className="section-title">{t('Hatlar')}</h2>
        <Button kind="ghost" small onClick={() => store.try((st) => A.buyLine(st), t('Boş hat kuruldu'))}>
          {t('+ Boş hat, elle doldur ({cost})', { cost: money(newLineCost(yf)) })}
        </Button>
      </div>
      {groups.map((g) => (
        <LineGroup key={g.key} title={g.title} color={g.color} lines={g.lines} military={military} few={few} focus={focus} />
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
      <PlantsPanel />
    </div>
  );
}

/** A model's colour on the plan and in the groups (the chart series colours, in the order of the models on sale). */
const modelColor = (i: number) => `var(--series-${(i % 6) + 1})`;

/** Weekly output of the lines that build this model (none while retooling). */
function modelCapacity(s: GameState, m: CarModel): number {
  return s.lines
    .filter((l) => l.modelId === m.id && !l.military && !lineOffline(s, l))
    .reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
}

/** Above this many lines the plan draws one hall per car instead of a box per line. */
const HALLS_FROM = 24;

/**
 * Every line of the factory at a glance, drawn like a floor plan: one box per line, its four stages
 * filled by how much each can build, the bottleneck in red, the line in its model's colour. A box
 * opens that line below. A big factory is drawn as one hall per car (HallPlan).
 */
function FloorPlan({ military, onPick }: { military: boolean; onPick: (id: string) => void }) {
  const s = useGameState();
  const active = s.models.filter((m) => m.status === 'active');
  const shown = active.filter((m) => s.lines.some((l) => l.modelId === m.id));
  const info = (l: ProductionLine) => {
    const i = active.findIndex((m) => m.id === l.modelId);
    const model = active[i];
    const isMilitary = military && !!l.military;
    const r = lineReport(s, l, isMilitary ? MILITARY_COMPLEXITY : model?.stats.complexity ?? 1);
    const building = l.buildUntilWeek !== undefined && s.week < l.buildUntilWeek;
    const retooling = l.retoolUntilWeek !== undefined && s.week < l.retoolUntilWeek;
    const state = building ? 'building' : retooling ? 'retool' : isMilitary ? 'military' : model ? 'run' : 'idle';
    const what = isMilitary ? t('askeri üretim') : model ? model.name : t('boş');
    return { i, r, state, label: `${l.name} · ${what} · ${t('{output} araç/hafta', { output: cars(r.throughput) })}` };
  };
  return (
    <Panel title={t('Fabrika planı')} className="floor-panel">
      {s.lines.length > HALLS_FROM ? (
        <HallPlan military={military} onPick={onPick} info={info} />
      ) : (
        <div className="floor" role="list">
          {s.lines.map((l) => {
            const { i, r, state, label } = info(l);
            const most = Math.max(1, ...STAGES.map((st) => r.perStage[st.id]));
            return (
              <button
                key={l.id}
                type="button"
                role="listitem"
                className={`floor-line is-${state}`}
                style={i >= 0 ? ({ '--model': modelColor(i) } as React.CSSProperties) : undefined}
                onClick={() => onPick(l.id)}
                title={label}
                aria-label={label}
              >
                <span className="floor-name">{l.name}</span>
                <span className="floor-stages" aria-hidden>
                  {STAGES.map((st) => (
                    <i
                      key={st.id}
                      className={state === 'run' && r.bottleneck === st.id ? 'is-neck' : ''}
                      style={{ height: `${Math.max(12, (100 * r.perStage[st.id]) / most)}%` }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="floor-legend small">
        {shown.map((m) => (
          <span key={m.id}>
            <i className="cap-swatch" style={{ background: modelColor(active.indexOf(m)) }} /> {m.name}
          </span>
        ))}
        <span>
          <i className="cap-swatch is-neck" /> {t('Darboğaz')}
        </span>
      </div>
    </Panel>
  );
}

type LineInfo = { i: number; r: ReturnType<typeof lineReport>; state: string; label: string };

/**
 * A big factory as one hall per car: its lines, what they build, how full each section is across the
 * hall (the one that holds the hall back in red), and a mark per line (a tap opens that line).
 */
function HallPlan({ military, onPick, info }: { military: boolean; onPick: (id: string) => void; info: (l: ProductionLine) => LineInfo }) {
  const s = useGameState();
  const active = s.models.filter((m) => m.status === 'active');
  const halls = [
    ...active.map((m, i) => ({ key: m.id, title: m.name, color: modelColor(i), lines: s.lines.filter((l) => l.modelId === m.id && !(military && l.military)) })),
    { key: 'military', title: t('Askeri üretim'), color: 'var(--warn)', lines: military ? s.lines.filter((l) => l.military) : [] },
    { key: 'idle', title: t('Boş hatlar'), color: 'var(--bp-line)', lines: s.lines.filter((l) => !(military && l.military) && !active.some((m) => m.id === l.modelId)) },
  ].filter((h) => h.lines.length > 0);
  return (
    <div className="halls" role="list">
      {halls.map((h) => {
        const lines = h.lines.map((l) => ({ l, ...info(l) }));
        const running = lines.filter((x) => x.state === 'run' || x.state === 'military');
        const perStage = Object.fromEntries(STAGES.map((st) => [st.id, running.reduce((a, x) => a + x.r.perStage[st.id], 0)])) as Record<string, number>;
        const output = running.reduce((a, x) => a + x.r.throughput, 0);
        const most = Math.max(1, ...STAGES.map((st) => perStage[st.id]));
        const neck = running.length ? STAGES.reduce((a, st) => (perStage[st.id] < perStage[a.id] ? st : a)).id : undefined;
        return (
          <div key={h.key} className="hall" role="listitem" style={{ '--model': h.color } as React.CSSProperties}>
            <div className="hall-head">
              <b>{h.title}</b>
              <span>
                {t('{n} hat', { n: h.lines.length })}
                {output > 0 && ` · ${t('{output} araç/hafta', { output: cars(output) })}`}
              </span>
            </div>
            {running.length > 0 && (
              <div className="hall-stages" aria-hidden>
                {STAGES.map((st) => (
                  <span key={st.id} className={st.id === neck ? 'is-neck' : ''}>
                    <i style={{ width: `${Math.max(6, (100 * perStage[st.id]) / most)}%` }} />
                    <small>{t(st.name)}</small>
                  </span>
                ))}
              </div>
            )}
            <div className="hall-lines">
              {lines.map((x) => (
                <button key={x.l.id} type="button" className={`hall-line is-${x.state}`} onClick={() => onPick(x.l.id)} title={x.label} aria-label={x.label} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * One model's capacity in one place: what buyers want, what its lines build, and one choice. Automatic:
 * the factory grows and shrinks with demand (core/autocap.ts). By hand: the line planner for this car.
 */
function ModelCapacity({ m, color }: { m: CarModel; color: string }) {
  const s = useGameState();
  const d = weeklyDemand(s, m);
  const c = modelCapacity(s, m);
  const lines = s.lines.filter((l) => l.modelId === m.id && !l.military).length;
  const auto = !!m.autoCapacity;
  const [plan, setPlan] = useState(false);
  return (
    <div className="cap-row">
      <div className="cap-head">
        <i className="cap-swatch" style={{ background: color }} />
        <b>{m.name}</b>
        <span className="small">{t('talep ~{demand}/hf · üretim {output}/hf', { demand: dec(d, 0), output: cars(c) })}</span>
        <span className="small muted">{t('{n} hat', { n: lines })}</span>
        <span className="preset-chips cap-mode" role="radiogroup" aria-label={t('Kapasite')}>
          {(['auto', 'hand'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={auto === (k === 'auto')}
              className={`chip ${auto === (k === 'auto') ? 'is-on' : ''}`}
              onClick={() => auto !== (k === 'auto') && store.act((st) => A.setModelAutoCapacity(st, m.id, k === 'auto'))}
            >
              {k === 'auto' ? t('Otomatik') : t('Elle')}
            </button>
          ))}
          <Info>
            {t('Açıkken fabrika, alıcılar beklediği sürece darboğaza istasyon ekler, hattı genişletir ya da yeni hat kurar; talep düşerse üretimi kısar, uzun süre boş kalan hattı satar. Kasada her zaman birkaç haftalık gider kadar yedek bırakır.')}
          </Info>
        </span>
      </div>
      {d > c * 1.1 && d - c >= 0.5 && <p className="small tone-bad">{t('~{n} araç/hf kaçıyor', { n: Math.round(d - c) })}</p>}
      {auto && m.autoHold && d > c * 1.05 && (
        <p className="small tone-warn">
          {t('otomatik durdu: {reason}', { reason: autoHoldText(m) })}
          {m.autoHint && <b className="auto-hint">{' '}{t('Çıkış yolu: {hint}.', { hint: m.autoHint })}</b>}
        </p>
      )}
      {auto ? (
        <>
          <button type="button" className="link small" onClick={() => setPlan(!plan)} aria-expanded={plan}>
            {plan ? '▾' : '▸'} {t('Elle hat kur')}
          </button>
          {plan && <PlannerForm m={m} />}
        </>
      ) : (
        <PlannerForm m={m} />
      )}
    </div>
  );
}

/**
 * Money to capacity for one car: new balanced lines (the same quotes and sums automatic capacity
 * uses, core/factory.ts and core/autocap.ts), or a small workshop line.
 */
function PlannerForm({ m }: { m: CarModel }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const [count, setCount] = useState(1);
  const [sizePick, setSizePick] = useState<number | undefined>(undefined);
  const blackOption = blackPaintIsFaster(yf);
  const usesBlack = s.lines.some((l) => l.stations.paint.some((id) => stationDef(id).blackOnly));
  const [black, setBlack] = useState(usesBlack);
  const allowBlack = blackOption && black;
  const quoteAt = (b: boolean, k: number) => turnkeyQuote(s, m, b, k);
  const outputAt = (b: boolean, k: number) => quoteAt(b, k)?.output ?? 0;
  // Cars a week buyers lastingly want beyond what the lines build or soon will.
  const gap = demandGap(s, m);
  // Without a choice: the line automatic capacity would build (the smallest that covers the shortfall).
  const fits = newLineSize(s, m, allowBlack, gap);
  const size = sizePick ?? fits;
  const quote = quoteAt(allowBlack, size);
  const perLine = (b: boolean) => outputAt(b, size);
  const each = quote?.cost ?? 0;
  const shopCap = lineReport(s, { ...emptyLine('plan', 'plan'), stations: workshopPlan(yf) }, m.stats.complexity).throughput;
  const shopEach = workshopLineCost(s.week) + A.retoolCost(s, m, shopCap);
  const demand = weeklyDemand(s, m);
  const cap = modelCapacity(s, m);
  const affordable = each > 0 ? Math.max(0, Math.floor(s.company.cash / each)) : 0;
  // What each car of one more line earns, and the years it takes to pay for itself: if every car it
  // builds is sold, and on the cars buyers lastingly want (what automatic capacity counts).
  const margin = quote ? priceNow(m, s.week) * (1 - DEALER_COMMISSION) - materialUnitCost(s, m) - quote.labour : 0;
  const payback = quote ? paybackYears(each, quote.output, margin) : Infinity;
  const paybackSold = quote ? paybackYears(each, quote.output, margin, gap) : Infinity;
  const build = lineBuildWeeks(yf);
  return (
    <div className="planner-form">
      <p>
        {tx(
          '<b>Anahtar teslim hat:</b> bugünün en iyi makineleriyle ve dengeli kurulur (hiçbir bölüm darboğazın besleyebileceğinden fazla makine almaz). {model} için {size} yerli hat başına <b>+{output} araç/hf</b>, kalıp dahil <b>{cost}</b>. Binası ve makineleri <b>{n} haftada</b> kurulur.',
          { model: m.name, size, output: cars(perLine(allowBlack)), cost: money(each), n: build },
        )}{' '}
        {payback < Infinity ? (
          <>
            {payback < 1
              ? tx(
                  'Ürettiği her araç satılırsa araç başına ~{margin} kalır: hat kendini <pay>~{n} ayda</pay> öder.',
                  { margin: money(margin), n: paybackMonths(payback) },
                  { pay: (c, k) => <b key={k} className={payback > 3 ? 'tone-warn' : ''}>{c}</b> },
                )
              : tx(
                  'Ürettiği her araç satılırsa araç başına ~{margin} kalır: hat kendini <pay>~{years} yılda</pay> öder.',
                  { margin: money(margin), years: dec(payback, 1) },
                  { pay: (c, k) => <b key={k} className={payback > 3 ? 'tone-warn' : ''}>{c}</b> },
                )}{' '}
            {/* What automatic capacity counts: only the cars buyers lastingly want. */}
            {gap <= 0.05
              ? t('Kalıcı talep (lansman heyecanı hariç) şimdiki ve inşaattaki hatlarla karşılanıyor: bu fiyatla yeni hat boş kalır.')
              : quote && gap < quote.output
                ? tx(
                    'Ama alıcılar kalıcı olarak yalnız ~{gap} araç/hf daha istiyor (lansman heyecanı hariç, inşaattaki hatlar dahil): yalnız bu kadar satılırsa hat <pay>~{n} ayda</pay> öder. Otomatik kapasite de böyle hesaplar ve en çok {limit} yıl bekler.',
                    { gap: dec(gap, 1), n: paybackMonths(paybackSold), limit: autoHorizon(s) },
                    { pay: (c, k) => <b key={k} className={paybackSold > autoHorizon(s) ? 'tone-warn' : ''}>{c}</b> },
                  )
                : null}
          </>
        ) : (
          <span className="tone-bad">{t('Bu fiyatla araç başına para kalmıyor: yeni hat kendini ödemez.')}</span>
        )}
      </p>
      <div className="preset-chips" role="radiogroup" aria-label={t('Hat boyu')}>
        <span className="small muted">{t('Hat boyu (bölüm başına yer):')}</span>
        {LINE_SIZES.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={size === k}
            className={`chip ${size === k ? 'is-on' : ''}`}
            onClick={() => setSizePick(k)}
            title={t('{output} araç/hf · {cost}', { output: cars(outputAt(allowBlack, k)), cost: money(quoteAt(allowBlack, k)?.cost ?? 0) })}
          >
            {k === fits && sizePick === undefined
              ? t('{n} yer · {output}/hf (önerilen)', { n: k, output: dec(outputAt(allowBlack, k), 0) })
              : t('{n} yer · {output}/hf', { n: k, output: dec(outputAt(allowBlack, k), 0) })}
          </button>
        ))}
      </div>
      {blackOption && (
        <Toggle
          checked={black}
          onChange={setBlack}
          label={t('Siyah vernik fırını kullan: hat başına {normal} yerine {black} araç/hf', { normal: dec(perLine(false), 1), black: dec(perLine(true), 1) })}
          sub={
            m.autoCapacity && black !== autoAllowsBlack(s, m)
              ? black
                ? t('Çok daha hızlı kurur ama araç yalnızca siyah olur: prestij −5. Otomatik kapasite {model} için siyah vernik fırını kullanmaz (lüks ve spor arabalar renkli kalır).', { model: m.name })
                : t('Çok daha hızlı kurur ama araç yalnızca siyah olur: prestij −5. Otomatik kapasite {model} için bu fırını da kullanır.', { model: m.name })
              : t('Çok daha hızlı kurur ama araç yalnızca siyah olur: prestij −5.')
          }
        />
      )}
      {shopEach < each * 0.5 && (
        <div className="planner-row planner-shop">
          <span className="small">
            {tx(
              '<b>Küçük atölye hattı:</b> başlangıçtaki atölye gibi, el işçiliği makineleriyle. Yavaş ve araç başına işçiliği pahalı ama ucuz: +{output} araç/hf, kalıp dahil <b>{cost}</b>.',
              { output: cars(shopCap), cost: money(shopEach) },
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
          {t('Toplam {cost} · +{output} araç/hf', { cost: money(each * count), output: dec(perLine(allowBlack) * count, 0) })}
          {gap > 0.05 && ` · ${t('açığı kapatmak için ~{n} hat', { n: Math.ceil(gap / Math.max(0.1, perLine(allowBlack))) })}`}
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
                  output: dec(perLine(allowBlack) * count, 0),
                  demand: dec(demand, 0),
                  cap: cars(cap),
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
        // A line that pays for itself soon on the cars buyers want, but the till is short: the bank can bridge it.
        const short = each * count - s.company.cash;
        const room = credit(s).limit - s.company.loan;
        if (short <= 0 || paybackSold > 2) return null;
        return room >= short ? (
          <p className="note small planner-loan">
            {paybackSold < 1
              ? t('Kasada {cash} var, eksik {short}. Hat ~{n} ayda kendini ödüyorsa eksiği kredi ile kapatmak mantıklı olabilir (faiz yılda {rate}).', {
                  cash: money(s.company.cash),
                  short: money(short),
                  n: paybackMonths(paybackSold),
                  rate: pct(credit(s).rate, 0),
                })
              : t('Kasada {cash} var, eksik {short}. Hat ~{years} yılda kendini ödüyorsa eksiği kredi ile kapatmak mantıklı olabilir (faiz yılda {rate}).', {
                  cash: money(s.company.cash),
                  short: money(short),
                  years: dec(paybackSold, 1),
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
  );
}

/** Rebuild every old line with today's machines, in one go. */
function ModernizeAll() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const allowBlack = blackPaintIsFaster(yf) && s.lines.some((l) => l.stations.paint.some((id) => stationDef(id).blackOnly));
  const upgrades = s.lines
    .map((l) => ({ l, q: modernizeQuote(l, s.week, allowBlack) }))
    .filter(({ q }) => q.after > q.before * 1.02);
  const upgradeCost = upgrades.reduce((a, u) => a + Math.max(0, u.q.cost), 0);
  return (
    <>
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
    </>
  );
}

/** The lines of one car (or the idle ones) under one heading that opens them. */
function LineGroup(props: { title: string; color?: string; lines: ProductionLine[]; military: boolean; few: boolean; focus: string | null }) {
  const s = useGameState();
  const { lines, focus } = props;
  const [open, setOpen] = useState(props.few);
  useEffect(() => {
    if (focus && lines.some((l) => l.id === focus)) setOpen(true);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const model = s.models.find((m) => m.id === lines[0]?.modelId && m.status === 'active');
  const reports = lines.map((l) => lineReport(s, l, model?.stats.complexity ?? 1));
  const output = reports.reduce((a, r, i) => a + (lineOffline(s, lines[i]) ? 0 : r.throughput), 0);
  const necks = STAGES.map((st) => ({ st, n: reports.filter((r) => r.bottleneck === st.id).length })).filter((x) => x.n > 0);
  return (
    <section className="line-group">
      <button type="button" className="line-group-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        {props.color && <i className="cap-swatch" style={{ background: props.color }} />}
        <b>{props.title}</b>
        <span className="muted small">
          {t('{n} hat', { n: lines.length })} · {t('{v} araç/hf', { v: cars(output) })}
          {model && necks.length > 0 && (
            <>
              {' · '}
              {t('darboğaz: {stage}', { stage: necks.map((x) => (necks.length > 1 ? `${t(x.st.name)} ×${x.n}` : t(x.st.name))).join(', ') })}
            </>
          )}
        </span>
      </button>
      {open &&
        lines.map((l) => (
          <div key={l.id + (focus === l.id ? ':focus' : '')} id={`line-${l.id}`}>
            <LinePanel line={l} military={props.military} defaultOpen={props.few || focus === l.id} />
          </div>
        ))}
    </section>
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
            {t('{output} araç/hafta · işçilik {cost}/hafta', { output: cars(r.throughput), cost: money(upkeep) })}
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
                  body: t('Hat yeniden ayarlanır: 3 hafta üretim durur ve {cost} kalıp masrafı çıkar.', { cost: money(A.retoolCost(s, m, lineReport(s, line, m.stats.complexity).throughput)) }),
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
                {m.name} ({money(A.retoolCost(s, m, lineReport(s, line, m.stats.complexity).throughput))})
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
          {model && !isMilitary && ` · ${t('{model} üretim zorluğu {value}', { model: model.name, value: dec(model.stats.complexity, 2) })}`}
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

/** A station's cars a week: whole numbers plain, the hand workshops' halves with the language's decimal mark ("1,5"). */
const capText = (v: number) => dec(v, Number.isInteger(v) ? 0 : 1);

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
        <span className={bottleneck ? 'tone-bad' : 'muted'}>{t('{v}/hf', { v: cars(capacity) })}</span>
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
                    ? t('{cap}/hf · {cost}/hf (her biri)', { cap: capText(d.capacity), cost: money(d.upkeep * wage) })
                    : t('{cap}/hf · {cost}/hf', { cap: capText(d.capacity), cost: money(d.upkeep * wage) })}
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
              ? t('{station}: {cap}/hf · {cost} · sadece siyah', { station: t(o.name), cap: capText(o.capacity), cost: money(stationPrice(o.id, s.week)) })
              : t('{station}: {cap}/hf · {cost}', { station: t(o.name), cap: capText(o.capacity), cost: money(stationPrice(o.id, s.week)) })}
          </option>
        ))}
      </select>
      <span className="muted small">{t('{v} ham kapasite', { v: capText(line.stations[stage].reduce((a, id) => a + stationDef(id).capacity, 0)) })}</span>
      {line.stations[stage].length > 0 && (
        <Toggle
          checked={!!line.nightShift?.[stage]}
          onChange={(v) => store.try((st) => A.setNightShift(st, line.id, stage, v))}
          label={t('Gece vardiyası')}
          sub={t('+{extra} kapasite · işçilik ×{cost}', { extra: pct(NIGHT_SHIFT_OUTPUT - 1, 0), cost: dec(NIGHT_SHIFT_COST, 1) })}
        />
      )}
    </div>
  );
}
