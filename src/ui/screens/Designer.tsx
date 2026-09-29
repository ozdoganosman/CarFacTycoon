import { useMemo, useState, type ReactNode } from 'react';
import * as A from '../../core/actions';
import { enginePresets, withStrokeRatio } from '../../core/ai';
import { DIESEL_COMPRESSION, DIESEL_YEAR, displacementCc, eraRpmCap, isDiesel, knockLimit } from '../../core/engine';
import { newEstimate } from '../../core/estimate';
import { engineNotes, gearboxNotes, suspensionNotes, typicalSuspBalance } from '../../core/engineNotes';
import { knownMaxGears, techState, unknownTech } from '../../core/research';
import { effectsText, knowhowDef } from '../../data/knowhow';
import { yearFloat } from '../../core/time';
import { engineCurve, gearSpeeds, tractionCurves, rollingResistance } from '../../core/vehicle';
import {
  ASPIRATIONS,
  BODIES,
  CHASSIS,
  CYLINDER_OPTIONS,
  FEATURES,
  FUEL_SYSTEMS,
  GEARBOX_TYPES,
  SUSPENSIONS,
  VALVETRAINS,
  maxCompression,
  maxGears,
} from '../../data/tech';
import type { CarDesign, EngineDesign, FeatureId, Project } from '../../core/types';
import { isTurkish, msg, t } from '../../i18n';
import { fmtNumber } from '../../i18n/format';
import { store, useGameState } from '../store';
import { kmh, litres, money, secs } from '../format';
import { inYear } from '../format';
import { tx } from '../i18n';
import { Button, Choice, Info, Slider, Toggle } from '../components/ui';
import { StatsPanel, useCarStats } from '../components/StatsPanel';
import { CarSVG } from '../viz/CarSVG';
import { LineChart } from '../viz/LineChart';
import { EngineBlock, FourStroke, SuspensionSim } from '../cards/animations';
import { EngineSound } from '../components/EngineSound';
import { engineSound } from '../audio/engineSound';
import { soundSpec } from '../audio/engineVoice';

/** Torque (Nm) at `rpm` read off the engine's full-throttle curve. */
function torqueAt(curve: { rpm: number; torque: number }[], rpm: number): number {
  if (!curve.length) return 0;
  if (rpm <= curve[0].rpm) return curve[0].torque;
  for (let i = 1; i < curve.length; i++) {
    if (rpm <= curve[i].rpm) {
      const a = curve[i - 1];
      const b = curve[i];
      return a.torque + ((b.torque - a.torque) * (rpm - a.rpm)) / (b.rpm - a.rpm);
    }
  }
  return curve[curve.length - 1].torque;
}

/** A decimal as the game always showed it in Turkish ("2.35"), in the player's own form elsewhere. */
const fixed = (v: number, digits: number) => (isTurkish() ? v.toFixed(digits) : fmtNumber(v, digits));
/** Millimetres in half steps as the game always showed them in Turkish ("82.5"), in the player's own form elsewhere. */
const mm = (v: number) => (isTurkish() ? String(v) : fmtNumber(v, Number.isInteger(v) ? 0 : 1));

type Tab = 'chassis' | 'body' | 'engine' | 'gearbox' | 'suspension' | 'safety' | 'equipment';
const TABS: { id: Tab; label: string }[] = [
  { id: 'chassis', label: msg('Şasi') },
  { id: 'body', label: msg('Gövde') },
  { id: 'engine', label: msg('Motor') },
  { id: 'gearbox', label: msg('Şanzıman') },
  { id: 'suspension', label: msg('Süspansiyon') },
  { id: 'safety', label: msg('Güvenlik') },
  { id: 'equipment', label: msg('İç mekân') },
];

interface Gate {
  disabled: boolean;
  /** For compact choices: the year or "Ar-Ge". */
  short?: string;
  /** For choices with a description line. */
  long?: string;
}

/** Whether a technology can go into a design now: not yet invented, not yet researched, or free to use. */
function useTechGate(): (id: string, year: number) => Gate {
  const s = useGameState();
  const yf = yearFloat(s.week);
  return (id, year) => {
    if (year > yf) return { disabled: true, short: String(year), long: t('{year} gelir', { year: inYear(year) }) };
    const st = techState(s, id, yf);
    if (st === 'available') return { disabled: true, short: t('Ar-Ge'), long: t('Önce Ar-Ge’de araştır') };
    if (st === 'researching') return { disabled: true, short: t('Ar-Ge’de'), long: t('Ar-Ge’de araştırılıyor') };
    return { disabled: false };
  };
}

/** Know-how the car gets from the company without any choice in the designer. */
function KnowhowStrip({ ids }: { ids: string[] }) {
  const list = ids.map((id) => knowhowDef(id)).filter((k): k is NonNullable<typeof k> => !!k);
  return (
    <div className="knowhow-strip">
      <span className="muted small">
        {t('Şirketin bilgi birikimi')}
        <Info>
          <p>{t('Ar-Ge’de araştırılan mühendislik yenilikleri (manyeto ateşleme, amortisör, balon lastik…) bütün yeni tasarımlara kendiliğinden girer.')}</p>
          {list.length > 0 && (
            <ul>
              {list.map((k) => (
                <li key={k.id}>
                  <b>{t(k.name)}:</b> {effectsText(k.effects)}
                </li>
              ))}
            </ul>
          )}
        </Info>
        :
      </span>
      {list.length ? (
        list.map((k) => (
          <span key={k.id} className="kh-chip" title={effectsText(k.effects)}>
            {t(k.name)}
          </span>
        ))
      ) : (
        <span className="muted small">{t('henüz yok')}</span>
      )}
    </div>
  );
}

/** A line pointing to the research screen when some options wait for research. */
function ResearchHint({ ids }: { ids: string[] }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  if (!ids.some((id) => ['available', 'researching'].includes(techState(s, id, yf)))) return null;
  return (
    <p className="muted small research-hint">
      {t('“Ar-Ge” yazan seçenekler önce araştırılmalı.')}{' '}
      <button type="button" className="link-btn" onClick={() => store.go({ id: 'research' })}>
        {t('Ar-Ge’ye git')}
      </button>
    </p>
  );
}

export function Designer({ project, readOnly, below }: { project: Project; readOnly?: boolean; below?: ReactNode }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const [tab, setTab] = useState<Tab>('body');
  const d = project.design;
  const facelift = project.kind === 'facelift';
  const platformLocked = !!project.platformId || facelift;
  const engineLocked = !!project.engineRefId || facelift;
  // The replaced car's platform, to go back to after choosing a new one.
  const replaced = project.replacesModelId ? s.models.find((m) => m.id === project.replacesModelId) : undefined;
  const oldPlatform = replaced ? s.platforms.find((x) => x.id === replaced.platformId) : undefined;
  const set = (patch: Partial<CarDesign>) => {
    if (readOnly) return;
    store.act((st) => A.updateDesign(st, project.id, { ...d, ...patch }));
  };
  const setEngine = (e: EngineDesign) => set({ engine: e });
  const neutral = useMemo(() => newEstimate(() => 0.5), []);
  const gate = useTechGate();

  return (
    <div className="designer">
      <div className="designer-col">
        <div className="designer-main">
          <div className="designer-car">
            <CarSVG body={d.body} size={d.size} year={yf} cylinders={d.engine.cylinders} styling={d.styling} />
          </div>
          <div className="tabs" role="tablist">
            {TABS.map((x) => (
              <button key={x.id} type="button" role="tab" data-tab={x.id} aria-selected={tab === x.id} className={`tab ${tab === x.id ? 'is-on' : ''}`} onClick={() => setTab(x.id)}>
                {t(x.label)}
              </button>
            ))}
          </div>
          <KnowhowStrip ids={d.knowhow ?? []} />
          {readOnly && <p className="note design-locked">{t('Geliştirme başladı: tasarım kilitli. Değişiklik için makyaj ya da yeni kuşak projesi gerekir.')}</p>}
          <fieldset className="tab-body" disabled={readOnly}>
            {tab === 'chassis' && (
              <>
                {platformLocked && (
                  <p className="note">
                    {facelift ? t('Makyajda şasi değişmez.') : t('Mevcut bir platformu kullanıyorsun: şasi, boyut ve süspansiyon sabit. Geliştirme ve kalıp maliyeti düşük.')}
                    {!facelift && !readOnly && (
                      <>
                        {' '}
                        <Button small kind="ghost" onClick={() => store.try((st) => A.setProjectPlatform(st, project.id, undefined))}>
                          {t('Yeni platform tasarla')}
                        </Button>
                      </>
                    )}
                  </p>
                )}
                {!platformLocked && !readOnly && oldPlatform && (
                  <p className="note">
                    {t('Yeni bir platform: şasi, boyut ve süspansiyon serbest, ama geliştirme ve kalıplar daha pahalı.')}{' '}
                    <Button small kind="ghost" onClick={() => store.try((st) => A.setProjectPlatform(st, project.id, oldPlatform.id))}>
                      {t('{name} ile devam et', { name: oldPlatform.name })}
                    </Button>
                  </p>
                )}
                <Choice
                  value={d.chassis}
                  onChange={(v) => set({ chassis: v })}
                  options={CHASSIS.map((c) => {
                    const g = gate(`chassis:${c.id}`, c.year);
                    return { value: c.id, label: t(c.name), disabled: platformLocked || g.disabled, sub: g.long ?? t(c.desc) };
                  })}
                />
                <ResearchHint ids={CHASSIS.map((c) => `chassis:${c.id}`)} />
                <Slider
                  label={t('Boyut')}
                  value={d.size}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => set({ size: v })}
                  left={t('Küçük')}
                  right={t('Büyük')}
                  format={(v) => `${Math.round(v * 100)}`}
                  disabled={platformLocked}
                  hint={t('Büyük araç: konfor, pratiklik ve prestij ↑; ağırlık, maliyet ve üretim zorluğu ↑.')}
                />
              </>
            )}
            {tab === 'body' && (
              <>
                <Choice
                  value={d.body}
                  onChange={(v) => set({ body: v })}
                  options={BODIES.map((b) => ({
                    value: b.id,
                    label: t(b.name),
                    disabled: b.year > yf || (facelift && b.id !== d.body),
                    sub: b.year > yf ? t('{year} gelir', { year: inYear(b.year) }) : t(b.desc),
                  }))}
                />
                <Slider
                  label={t('Tasarım ve karoser işçiliği')}
                  value={d.styling}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => set({ styling: v })}
                  left={t('Sade')}
                  right={t('Gösterişli')}
                  format={(v) => `${Math.round(v * 100)}`}
                  hint={t('Prestiji ve biraz da aerodinamiği artırır; maliyet ve üretim zorluğu artar.')}
                />
              </>
            )}
            {tab === 'engine' && <EngineTab s={s} d={d} yf={yf} locked={engineLocked} onChange={setEngine} project={project} />}
            {tab === 'gearbox' && <GearboxTab d={d} yf={yf} bonus={project.bonus} segment={project.segment} onChange={set} />}
            {tab === 'suspension' && <SuspensionTab d={d} yf={yf} bonus={project.bonus} segment={project.segment} locked={platformLocked} onChange={set} />}
          {tab === 'safety' && <FeatureList d={d} group="safety" onChange={(features) => set({ features })} />}
            {tab === 'equipment' && (
              <>
                <FeatureList d={d} group="equipment" onChange={(features) => set({ features })} />
                <Slider
                  label={t('İç mekân kalitesi')}
                  value={d.interior}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => set({ interior: v })}
                  left={t('Tahta sıra')}
                  right={t('Deri ve ceviz')}
                  format={(v) => `${Math.round(v * 100)}`}
                  hint={t('Konfor ve prestij ↑, maliyet ↑ (hızla artar).')}
                />
              </>
            )}
          </fieldset>
        </div>
        {below}
      </div>
      <aside className="designer-side">
        <StatsPanel
          s={s}
          design={d}
          segment={project.segment}
          yf={yf}
          bonus={A.projectedBonus(s, project)}
          estimate={project.estimate ?? neutral}
          note={t('Geliştirme mevcut odak dağılımıyla biterse.')}
        />
      </aside>
    </div>
  );
}

function FeatureList({ d, group, onChange }: { d: CarDesign; group: 'safety' | 'equipment'; onChange: (f: FeatureId[]) => void }) {
  const list = FEATURES.filter((f) => f.group === group);
  const gate = useTechGate();
  const toggle = (id: FeatureId, on: boolean) => {
    let next = on ? [...d.features, id] : d.features.filter((x) => x !== id);
    // Dropping a prerequisite drops what depends on it.
    if (!on) next = next.filter((x) => !(FEATURES.find((f) => f.id === x)?.requires ?? []).includes(id));
    onChange(next);
  };
  return (
    <div className="feature-list">
      {list.map((f) => {
        const missing = (f.requires ?? []).filter((r) => !d.features.includes(r));
        const g = gate(`feat:${f.id}`, f.year);
        return (
          <Toggle
            key={f.id}
            checked={d.features.includes(f.id)}
            disabled={(g.disabled && !d.features.includes(f.id)) || missing.length > 0}
            onChange={(v) => toggle(f.id, v)}
            label={
              <>
                {t(f.name)} <span className="muted small">{t('{cost}’dan', { cost: money(f.cost) })}</span>
              </>
            }
            sub={g.long ?? (missing.length ? t('Önce: {list}', { list: missing.map((m) => t(FEATURES.find((x) => x.id === m)!.name)).join(', ') }) : t(f.desc))}
          />
        );
      })}
      <ResearchHint ids={list.map((f) => `feat:${f.id}`)} />
    </div>
  );
}

function EngineTab({
  s,
  d,
  yf,
  locked,
  onChange,
  project,
}: {
  s: ReturnType<typeof useGameState>;
  d: CarDesign;
  yf: number;
  locked: boolean;
  onChange: (e: EngineDesign) => void;
  project: Project;
}) {
  const e = d.engine;
  const st = useCarStats(d, yf, project.bonus);
  const es = st.engine;
  // Ready-made engines the company can build with what it has researched.
  const presets = enginePresets(Math.floor(yf)).filter((p) => unknownTech(s, { ...d, engine: p.design }).length === 0);
  const ratio = e.stroke / e.bore;
  const curve = engineCurve(d, yf, project.bonus?.powerMult);
  const engineer = s.settings.engineerMode;
  const cylOpts = CYLINDER_OPTIONS;
  const kl = knockLimit(e.bore, yf);
  const gate = useTechGate();
  // The European horsepower tax only mattered to cars sold in Europe (not played for now).
  const eu = false;
  const diesel = isDiesel(e);
  const [soundOn, setSoundOn] = useState(false);
  const year = Math.floor(yf);
  const sound = useMemo(() => soundSpec(e, es, year, d.features), [e, es, year, d.features]);

  return (
    <div className="engine-tab">
      {locked && (
        <p className="note">
          {project.kind === 'facelift' ? t('Makyajda motor değişmez.') : t('Kütüphanedeki bir motoru kullanıyorsun: geliştirme işi %25 azalır ve motor daha az kusurlu çıkar.')}{' '}
          {project.kind !== 'facelift' && (
            <Button small kind="ghost" onClick={() => store.act((st2) => (st2.projects.find((p) => p.id === project.id)!.engineRefId = undefined))}>
              {t('Yeni motor tasarla')}
            </Button>
          )}
        </p>
      )}
      <fieldset disabled={locked} className="engine-controls">
        {yf >= DIESEL_YEAR && (
          <div className="field">
            <span>
              {t('Yakıt')}
              <Info>
                <p>{tx('<b>Benzin:</b> hafif, sessiz ve yüksek devirli.')}</p>
                <p>
                  {tx(
                    '<b>Dizel:</b> yakıtı sıkıştırmanın ısısı tutuşturur. Çok az yakar ve uzun ömürlüdür; ama ağır, gürültülü, düşük devirli ve pahalıdır, alıcılar prestijli bulmaz.',
                  )}
                </p>
              </Info>
            </span>
            <Choice
              compact
              value={diesel ? 'diesel' : 'petrol'}
              onChange={(v) =>
                onChange(
                  v === 'diesel'
                    ? { ...e, fuel: 'diesel', compression: 17 }
                    : { ...e, fuel: 'petrol', compression: Math.round(Math.min(maxCompression(yf), knockLimit(e.bore, yf) - 0.2) * 10) / 10 },
                )
              }
              options={[
                { value: 'petrol', label: t('Benzin') },
                { value: 'diesel', label: t('Dizel'), disabled: gate('fuel:diesel', DIESEL_YEAR).disabled && !diesel, sub: diesel ? undefined : gate('fuel:diesel', DIESEL_YEAR).short },
              ]}
            />
          </div>
        )}
        {!engineer ? (
          <>
            <div className="field">
              <span>
                {t('Hazır motorlar')}
                <Info>
                  <ul>
                    {presets.map((p) => (
                      <li key={p.id}>
                        <b>{t(p.name)}:</b> {t(p.desc)}
                      </li>
                    ))}
                  </ul>
                </Info>
              </span>
              <Choice
                compact
                value={
                  presets.find(
                    (p) => p.design.cylinders === e.cylinders && (p.design.fuel ?? 'petrol') === (e.fuel ?? 'petrol') && Math.abs(displacementCc(p.design) - displacementCc(e)) < 60,
                  )?.id ?? ''
                }
                onChange={(id) => {
                  const p = presets.find((x) => x.id === id);
                  if (p) onChange({ ...p.design });
                }}
                options={presets.map((p) => ({
                  value: p.id,
                  label: `${t(p.name)} · ${t('{v} L', { v: fixed(displacementCc(p.design) / 1000, 1) })} ${p.design.layout === 'v' ? 'V' : ''}${p.design.cylinders}`,
                }))}
              />
            </div>
            <Slider
              label={
                <>
                  {t('Karakter (strok / çap)')}
                  <Info>
                    <p className="up">
                      {eu
                        ? t('↑ Uzun strok: düşük devirde güçlü çeker, az yakar, Avrupa’da vergisi düşük (vergi yalnızca çapa bakar).')
                        : t('↑ Uzun strok: düşük devirde güçlü çeker, az yakar.')}
                    </p>
                    <p className="down">{t('↓ Kısa strok: yüksek devre çıkar ve daha çok güç verir, ama düşük devirde zayıftır.')}</p>
                  </Info>
                </>
              }
              value={Math.round(ratio * 100) / 100}
              min={0.75}
              max={1.6}
              step={0.05}
              onChange={(v) => onChange(withStrokeRatio(e, v, yf))}
              left={t('Kısa strok')}
              right={t('Uzun strok')}
              format={(v) => fixed(v, 2)}
            />
            <p className="muted small">{t('Her ayarı ayrı ayrı yapmak için Ayarlar’dan “Mühendis modu”nu aç.')}</p>
          </>
        ) : (
          <>
            <div className="field">
              <span>
                {t('Silindir düzeni')}
                <Info>
                  <p>{t('Aynı hacmi kaç silindire böleceğin. Değiştirince hacim korunur.')}</p>
                  <p className="up">{t('↑ Daha çok silindir: motor yumuşar ve sessizleşir, küçülen pistonlar daha yüksek devre çıkar, prestij artar.')}</p>
                  <p className="down">{t('↓ Ama motor pahalanır, ağırlaşır, arızalanacak parça çoğalır.')}</p>
                  <ul>
                    {CYLINDER_OPTIONS.map((c) => (
                      <li key={`${c.cylinders}${c.layout}`}>
                        <b>{t(c.label)}</b>
                        {c.year > yf ? ` (${c.year})` : ''}: {t(c.desc)}
                      </li>
                    ))}
                  </ul>
                </Info>
              </span>
              <Choice
                compact
                value={`${e.cylinders}${e.layout}`}
                onChange={(v) => {
                  const c = cylOpts.find((x) => `${x.cylinders}${x.layout}` === v)!;
                  const cc = displacementCc(e);
                  const perCyl = cc / c.cylinders;
                  const bore = Math.round(Math.cbrt((4 * perCyl) / (Math.PI * ratio)) * 10 * 2) / 2;
                  onChange({ ...e, cylinders: c.cylinders, layout: c.layout, bore, stroke: Math.round(bore * ratio * 2) / 2 });
                }}
                options={CYLINDER_OPTIONS.map((c) => {
                  const g = gate(`cyl:${c.cylinders}${c.layout}`, c.year);
                  return {
                    value: `${c.cylinders}${c.layout}`,
                    label: t(c.label).replace(' silindir sıra', ' sıra').replace('Tek silindir', 'Tek'),
                    disabled: g.disabled,
                    title: g.long ?? t(c.desc),
                    sub: g.short,
                  };
                })}
              />
            </div>
            <div className="grid-2 tight">
              <Slider
                label={
                  <>
                    {t('Silindir çapı')}
                    <Info>
                      <p>{t('Silindirin genişliği.')}</p>
                      <p className="up">
                        {e.valvetrain === 'sv' ? t('↑ Artırınca: hacim ve güç artar.') : t('↑ Artırınca: hacim ve güç artar, büyük supaplar nefesi iyileştirir.')}{' '}
                        {eu ? t('Ama alev yolu uzar, vuruntu sınırı düşer; motor ağırlaşır; Avrupa’da vergi çapın karesiyle artar.') : t('Ama alev yolu uzar, vuruntu sınırı düşer; motor ağırlaşır.')}
                      </p>
                      <p className="down">
                        {eu ? t('↓ Azaltınca: vuruntuya dayanıklı ve hafif, vergisi düşük.') : t('↓ Azaltınca: vuruntuya dayanıklı ve hafif.')} {t('Ama hacim ve güç düşer.')}
                      </p>
                    </Info>
                  </>
                }
                value={e.bore}
                min={50}
                max={160}
                step={0.5}
                onChange={(v) => onChange({ ...e, bore: v })}
                format={(v) => t('{v} mm', { v: mm(v) })}
              />
              <Slider
                label={
                  <>
                    {t('Strok')}
                    <Info>
                      <p>{t('Pistonun bir turda aldığı yol.')}</p>
                      <p className="up">
                        {eu
                          ? t('↑ Artırınca: hacim ve tork artar, tork düşük devre iner, vergi değişmez.')
                          : t('↑ Artırınca: hacim ve tork artar, tork düşük devre iner.')}{' '}
                        {t('Ama piston çok hızlanır: devir sınırı düşer (şu an {rpm} d/d).', { rpm: Math.round(es.redline) })}
                      </p>
                      <p className="down">{t('↓ Azaltınca: motor yüksek devre çıkar, güç tepesi geç gelir. Ama düşük devirde zayıflar, hacim düşer.')}</p>
                      <p>
                        {t(
                          'Dönemin supap yayları ve yatakları da devri sınırlar: bu yıl bu supap düzeniyle en fazla {rpm} d/d. Bu sınıra dayanan bir motorda stroku kısaltmak gücü artırmaz.',
                          { rpm: Math.round(eraRpmCap(e.valvetrain, yf)) },
                        )}
                      </p>
                    </Info>
                  </>
                }
                value={e.stroke}
                min={50}
                max={180}
                step={0.5}
                onChange={(v) => onChange({ ...e, stroke: v })}
                format={(v) => t('{v} mm', { v: mm(v) })}
              />
            </div>
            <Slider
              label={
                <>
                  {t('Sıkıştırma oranı')}
                  <Info>
                    {diesel ? (
                      <>
                        <p>{t('Dizelde yakıtı sıkıştırmanın ısısı tutuşturur: vuruntu sınırı yok.')}</p>
                        <p className="up">{t('↑ Artırınca: verim ve güç artar.')}</p>
                        <p className="down">{t('↓ Azaltınca: güç ve verim düşer.')}</p>
                      </>
                    ) : (
                      <>
                        <p>{t('Piston karışımı ne kadar sıkıştırıyor.')}</p>
                        <p className="up">{t('↑ Artırınca: yakıt daha iyi değerlendirilir, verim ve güç artar.')}</p>
                        <p className="down">
                          {t('↓ Sınırı aşarsa karışım erken patlar (vuruntu): güç ve motor ömrü çöker. Sınır çap büyüdükçe düşer, dönemin benzini iyileştikçe yükselir.')}
                        </p>
                      </>
                    )}
                  </Info>
                </>
              }
              value={e.compression}
              min={diesel ? DIESEL_COMPRESSION[0] : 3.5}
              max={diesel ? DIESEL_COMPRESSION[1] : Math.round(maxCompression(yf) * 10) / 10}
              step={0.1}
              onChange={(v) => onChange({ ...e, compression: v })}
              format={(v) => `${fixed(v, 1)} : 1`}
              hint={
                diesel ? undefined : (
                  <>
                    {tx('Vuruntu sınırı <b>{limit}</b>.', { limit: fixed(kl, 1) })}{' '}
                    {e.compression > kl ? <span className="tone-bad">{t('Motor vuruntu yapıyor!')}</span> : t('Güvenli.')}
                  </>
                )
              }
            />
            <div className="field">
              <span>
                {t('Supap düzeni')}
                <Info>
                  <p>{t('Supaplar yukarı çıktıkça motor daha rahat nefes alır.')}</p>
                  <p className="up">{t('↑ Gelişmiş düzen: daha yüksek devir, daha çok güç, biraz daha verim.')}</p>
                  <p className="down">{t('↓ Ama pahalı ve hassas; yeni teknoloji ilk yıllarında arıza çıkarır.')}</p>
                  <ul>
                    {VALVETRAINS.map((v) => (
                      <li key={v.id}>
                        <b>{t(v.name)}</b>
                        {v.year > yf ? ` (${v.year})` : ''}: {t(v.desc)}
                      </li>
                    ))}
                  </ul>
                </Info>
              </span>
              <Choice
                compact
                value={e.valvetrain}
                onChange={(v) => onChange({ ...e, valvetrain: v })}
                options={VALVETRAINS.map((v) => {
                  const g = gate(`vt:${v.id}`, v.year);
                  return { value: v.id, label: t(v.name), disabled: g.disabled, title: g.long ?? t(v.desc), sub: g.short };
                })}
              />
            </div>
            <div className="grid-2 tight">
              {diesel ? (
                <div className="field">
                  <span>{t('Yakıt sistemi')}</span>
                  <p className="muted small">{t('Dizelin kendi yüksek basınçlı enjeksiyon pompası var.')}</p>
                </div>
              ) : (
                <div className="field">
                  <span>
                    {t('Yakıt sistemi')}
                    <Info>
                      <ul>
                        {FUEL_SYSTEMS.map((f) => (
                          <li key={f.id}>
                            <b>{t(f.name)}</b>
                            {f.year > yf ? ` (${f.year})` : ''}: {t(f.desc)}
                          </li>
                        ))}
                      </ul>
                    </Info>
                  </span>
                  <Choice
                    compact
                    value={e.fuelSystem}
                    onChange={(v) => onChange({ ...e, fuelSystem: v })}
                    options={FUEL_SYSTEMS.map((f) => {
                      const g = gate(`fuel:${f.id}`, f.year);
                      return { value: f.id, label: t(f.name), disabled: g.disabled, title: g.long ?? t(f.desc), sub: g.short };
                    })}
                  />
                </div>
              )}
              <div className="field">
                <span>
                  {t('Aşırı besleme')}
                  <Info>
                    <ul>
                      {ASPIRATIONS.map((a) => (
                        <li key={a.id}>
                          <b>{t(a.name)}</b>
                          {a.year > yf ? ` (${a.year})` : ''}: {t(a.desc)}
                        </li>
                      ))}
                    </ul>
                  </Info>
                </span>
                <Choice
                  compact
                  value={e.aspiration}
                  onChange={(v) => onChange({ ...e, aspiration: v })}
                  options={ASPIRATIONS.map((a) => {
                    const g = gate(`asp:${a.id}`, a.year);
                    return { value: a.id, label: t(a.name), disabled: g.disabled, title: g.long ?? t(a.desc), sub: g.short };
                  })}
                />
              </div>
            </div>
          </>
        )}
      </fieldset>
      <ResearchHint
        ids={[
          ...CYLINDER_OPTIONS.map((c) => `cyl:${c.cylinders}${c.layout}`),
          ...VALVETRAINS.map((v) => `vt:${v.id}`),
          ...FUEL_SYSTEMS.map((f) => `fuel:${f.id}`),
          ...ASPIRATIONS.map((a) => `asp:${a.id}`),
          'fuel:diesel',
        ]}
      />
      <p className="muted small readouts-note">{t('Çizim üzerindeki hesap; gerçek motor geliştirme ve işçilikle bundan sapar:')}</p>
      <div className="readouts">
        <div>
          <span>{t('Hacim')}</span>
          <b>{t('{v} L', { v: fixed(es.displacementCc / 1000, 2) })}</b>
        </div>
        <div>
          <span>{t('Güç')}</span>
          <b>{t('{hp} bg @ {rpm}', { hp: fixed(es.powerHp, 0), rpm: Math.round(es.peakPowerRpm) })}</b>
        </div>
        <div>
          <span>{t('Tork')}</span>
          <b>{t('{nm} Nm @ {rpm}', { nm: fixed(es.torqueNm, 0), rpm: Math.round(es.peakTorqueRpm) })}</b>
        </div>
        <div>
          <span>
            {t('Devir sınırı')}
            <Info>
              <p>{t('Motorun güvenle dönebildiği en yüksek devir. Piston hızı sınırı belirler: uzun strok ve basit supaplar devri düşürür.')}</p>
            </Info>
          </span>
          <b>{t('{v} d/d', { v: Math.round(es.redline) })}</b>
        </div>
        <div>
          <span>{t('Çap × strok')}</span>
          <b>{t('{bore} × {stroke} mm', { bore: mm(e.bore), stroke: mm(e.stroke) })}</b>
        </div>
        <div>
          <span>
            {t('Vergi beygiri')}
            <Info>
              <p>{t('İngiliz usulü vergi beygiri: çap² × silindir sayısı / 2,5 (inç). Stroka hiç bakmaz.')}</p>
              <p>{t('1910-1947 arası Avrupa’da araç vergisi buna göre alınır: düşük vergi beygiri alıcının cebinde kalan paradır.')}</p>
            </Info>
          </span>
          <b>{fixed(es.taxHp, 1)}</b>
        </div>
        <div>
          <span>{t('Motor ağırlığı')}</span>
          <b>{t('{v} kg', { v: Math.round(es.massKg) })}</b>
        </div>
        <div>
          <span>{t('Motor maliyeti')}</span>
          <b>{money(es.cost)}</b>
        </div>
      </div>
      <EngineSound spec={sound} onRunning={setSoundOn} />
      <EngineBlock
        cylinders={e.cylinders}
        layout={e.layout}
        bore={e.bore}
        stroke={e.stroke}
        diesel={diesel}
        live={
          soundOn
            ? () => ({ rpm: engineSound.rpm, throttle: engineSound.throttle, redline: es.redline, fullTorqueNm: torqueAt(curve, engineSound.rpm) })
            : undefined
        }
      />
      <div className="engine-viz">
        <div className="engine-anim">
          <FourStroke bore={e.bore} stroke={e.stroke} rpm={Math.round(es.peakPowerRpm)} controls={false} diesel={diesel} />
        </div>
        <div className="engine-right">
          <div className="engine-charts">
            <LineChart
              title={t('Güç (bg)')}
              series={[{ id: 'hp', name: t('Güç'), color: 'var(--series-2)', points: curve.map((p) => ({ x: p.rpm, y: p.hp })), area: true }]}
              height={130}
              xFormat={(v) => `${Math.round(v)}`}
              yFormat={(v) => v.toFixed(0)}
              xLabel={t('Devir (d/d)')}
              ariaLabel={t('Motor güç eğrisi')}
            />
            <LineChart
              title={t('Tork (Nm)')}
              series={[{ id: 'tq', name: t('Tork'), color: 'var(--series-1)', points: curve.map((p) => ({ x: p.rpm, y: p.torque })), area: true }]}
              height={130}
              xFormat={(v) => `${Math.round(v)}`}
              yFormat={(v) => v.toFixed(0)}
              xLabel={t('Devir (d/d)')}
              ariaLabel={t('Motor tork eğrisi')}
            />
          </div>
          <EngineVerdict e={e} yf={yf} segment={project.segment} />
        </div>
      </div>
    </div>
  );
}

/** The engine's strong and weak points next to the class's typical engine. */
function EngineVerdict({ e, yf, segment }: { e: EngineDesign; yf: number; segment: Project['segment'] }) {
  const n = useMemo(() => engineNotes(e, yf, segment), [e, yf, segment]);
  return <ProsCons intro={t('Sınıfın tipik motoruna göre ({engine}):', { engine: n.typical })} pros={n.pros} cons={n.cons} />;
}

function ProsCons({ intro, pros, cons }: { intro: string; pros: string[]; cons: string[] }) {
  return (
    <div className="engine-notes">
      <p className="muted small">{intro}</p>
      <div className="pc-grid">
        <div>
          <h5 className="tone-good">{t('Artıları')}</h5>
          <ul className="pc pc-pro">{pros.length ? pros.map((x) => <li key={x}>{x}</li>) : <li className="muted">{t('Belirgin bir artısı yok.')}</li>}</ul>
        </div>
        <div>
          <h5 className="tone-bad">{t('Eksileri')}</h5>
          <ul className="pc pc-con">{cons.length ? cons.map((x) => <li key={x}>{x}</li>) : <li className="muted">{t('Belirgin bir eksisi yok.')}</li>}</ul>
        </div>
      </div>
    </div>
  );
}

const GEAR_COLORS = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)'];

function GearboxTab({
  d,
  yf,
  bonus,
  segment,
  onChange,
}: {
  d: CarDesign;
  yf: number;
  bonus?: Project['bonus'];
  segment: Project['segment'];
  onChange: (p: Partial<CarDesign>) => void;
}) {
  const st = useCarStats(d, yf, bonus);
  const notes = useMemo(() => gearboxNotes(d, yf, segment, bonus), [d, yf, segment, bonus]);
  const g = d.gearbox;
  const s = useGameState();
  const gate = useTechGate();
  const eraMax = maxGears(yf);
  const maxG = g.type === 'automatic' ? 4 : knownMaxGears(s, eraMax);
  const curves = tractionCurves(d, st, yf, bonus);
  const speeds = gearSpeeds(st, yf, d.size);
  const maxKmh = Math.max(...speeds) * 1.05;
  // Road load (rolling + air) for the loaded car.
  const load = Array.from({ length: 24 }, (_, i) => {
    const kmhv = (maxKmh * i) / 23;
    const v = kmhv / 3.6;
    return { x: kmhv, y: rollingResistance(yf) * (st.massKg + 150) * 9.81 + 0.5 * 1.2 * st.cd * st.frontalArea * v * v };
  });
  return (
    <>
      <div className="field">
        <span>
          {t('Şanzıman tipi')}
          <Info>
            <p>{t('Vites değiştirmenin ne kadar kolay olduğunu belirler.')}</p>
            <ul>
              {GEARBOX_TYPES.map((x) => (
                <li key={x.id}>
                  <b>{t(x.name)}</b>
                  {x.year > yf ? ` (${x.year})` : ''}: {t(x.desc)}
                </li>
              ))}
            </ul>
            <p className="up">{t('↑ Kolay şanzıman: konfor ve pratiklik artar, vites değişimi hızlanır.')}</p>
            <p className="down">{t('↓ Ama pahalı ve ağırdır; otomatik biraz güç yutar. Yeni teknoloji ilk yıllarında arıza çıkarır.')}</p>
          </Info>
        </span>
        <Choice
          compact
          value={g.type}
          onChange={(v) => onChange({ gearbox: { ...g, type: v, gears: v === 'automatic' ? 4 : Math.min(g.gears, knownMaxGears(s, eraMax)) } })}
          options={GEARBOX_TYPES.map((x) => {
            const gg = gate(`gb:${x.id}`, x.year);
            return { value: x.id, label: t(x.name), disabled: gg.disabled, title: gg.long ?? t(x.desc), sub: gg.short };
          })}
        />
        <ResearchHint ids={[...GEARBOX_TYPES.map((x) => `gb:${x.id}`), 'gears:4', 'gears:5']} />
      </div>
      <div className="grid-2 tight">
        <div className="field">
          <span>
            {t('İleri vites sayısı')}
            <Info>
              <p className="up">{t('↑ Daha çok vites: vitesler birbirine yaklaşır, motor güçlü olduğu devirde kalır. Hızlanma iyileşir; uzun son vites az yakar.')}</p>
              <p className="down">{t('↓ Daha az vites: ucuz ve hafif; ama vitesler arası boşluk büyük, motor her geçişte güçsüz devre düşer.')}</p>
              <p>{t('Dönemin teknolojisi en fazla {n} vitese izin veriyor.', { n: maxGears(yf) })}</p>
            </Info>
          </span>
          <Choice
            compact
            value={g.gears}
            onChange={(v) => onChange({ gearbox: { ...g, gears: v } })}
            options={[2, 3, 4, 5].map((n) => ({
              value: n,
              label: `${n}`,
              disabled: n > maxG || (g.type === 'automatic' && n !== 4),
              sub: g.type !== 'automatic' && n > maxG && n <= eraMax ? t('Ar-Ge') : undefined,
            }))}
          />
        </div>
        <Slider
          label={
            <>
              {t('Oranlar')}
              <Info>
                <p className="up">
                  {t('↑ Uzun oranlar: motor yolda düşük devirde döner; az yakar ve sessizdir, son hız artabilir. Ama kalkış ve hızlanma yavaşlar, güçsüz motor son viteste zorlanır.')}
                </p>
                <p className="down">{t('↓ Kısa oranlar: çevik kalkış ve güçlü çekiş. Ama motor hep yüksek devirde döner: çok yakar, son hız devir sınırına takılabilir.')}</p>
                <p>{t('Aşağıdaki grafikte eğrilerin yol direncini kestiği yer son hızdır.')}</p>
              </Info>
            </>
          }
          value={g.spread}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onChange({ gearbox: { ...g, spread: v } })}
          left={t('Kısa: çevik')}
          right={t('Uzun: az yakar')}
          format={(v) => (v < 0.3 ? t('Kısa') : v > 0.6 ? t('Uzun') : t('Dengeli'))}
        />
      </div>
      <p className="muted small readouts-note">{t('Çizim üzerindeki hesap:')}</p>
      <div className="readouts">
        <div>
          <span>{t('Son hız')}</span>
          <b>{kmh(st.topSpeed)}</b>
        </div>
        <div>
          <span>{t('0-50 km/s')}</span>
          <b>{secs(st.accel50)}</b>
        </div>
        <div>
          <span>{t('0-100 km/s')}</span>
          <b>{secs(st.accel100)}</b>
        </div>
        <div>
          <span>{t('Tüketim')}</span>
          <b>{litres(st.fuel)}</b>
        </div>
        <div>
          <span>{t('Vites başına hız')}</span>
          <b>{speeds.map((v) => Math.round(v)).join(' / ')}</b>
        </div>
      </div>
      <LineChart
        title={t('Tekerlekteki çekiş kuvveti: her vites bir eğri, kesikli çizgi yol direnci')}
        series={[
          ...curves.map((c, i) => ({
            id: `g${c.gear}`,
            name: t('{n}. vites', { n: c.gear }),
            color: GEAR_COLORS[i],
            points: c.points.map((p) => ({ x: p.kmh, y: p.force })),
          })),
          { id: 'load', name: t('Yol direnci'), color: 'var(--muted)', dashed: true, points: load },
        ]}
        height={220}
        xMin={0}
        xMax={maxKmh}
        xFormat={(v) => `${Math.round(v)}`}
        yFormat={(v) => `${Math.round(v)}`}
        xLabel={t('Hız (km/s)')}
        yLabel={t('Kuvvet (N)')}
        ariaLabel={t('Viteslere göre çekiş kuvveti grafiği')}
      />
      <p className="muted small">{t('Eğrilerin yol direncini kestiği yer son hızdır. Vites sayısı arttıkça eğriler birbirine yaklaşır ve motor güçlü olduğu devirde kalır.')}</p>
      <ProsCons intro={t('Aynı arabaya sınıfın tipik şanzımanı takılsaydı:')} pros={notes.pros} cons={notes.cons} />
    </>
  );
}

function SuspensionTab({
  d,
  yf,
  bonus,
  segment,
  locked,
  onChange,
}: {
  d: CarDesign;
  yf: number;
  bonus?: Project['bonus'];
  segment: Project['segment'];
  locked: boolean;
  onChange: (p: Partial<CarDesign>) => void;
}) {
  const notes = useMemo(() => suspensionNotes(d, yf, segment, bonus), [d, yf, segment, bonus]);
  const typBal = useMemo(() => typicalSuspBalance(yf, segment), [yf, segment]);
  const gate = useTechGate();
  return (
    <>
      <div className="field">
        <span>
          {t('Süspansiyon tipi')}
          <Info>
            <p>{t('Tekerleklerin yoldaki darbeleri gövdeye nasıl ilettiğini belirler.')}</p>
            <ul>
              {SUSPENSIONS.map((x) => (
                <li key={x.id}>
                  <b>{t(x.name)}</b>
                  {x.year > yf ? ` (${x.year})` : ''}: {t(x.desc)}
                </li>
              ))}
            </ul>
            <p className="up">{t('↑ Gelişmiş sistem: hem konfor hem yol tutuş artar.')}</p>
            <p className="down">{t('↓ Ama pahalı ve ağır; yeni teknoloji ilk yıllarında arıza çıkarır.')}</p>
          </Info>
        </span>
        <Choice
          compact
          value={d.suspension}
          onChange={(v) => onChange({ suspension: v })}
          options={SUSPENSIONS.map((x) => {
            const g = gate(`susp:${x.id}`, x.year);
            return { value: x.id, label: t(x.name), disabled: locked || g.disabled, title: g.long ?? t(x.desc), sub: g.short };
          })}
        />
        <ResearchHint ids={SUSPENSIONS.map((x) => `susp:${x.id}`)} />
      </div>
      <Slider
        label={
          <>
            {t('Ayar')}
            <Info>
              <p className="up">{t('↑ Sert (yol tutuş): araç virajda yatmaz, direksiyon isabetli; ama bozuk yolda yolcular sarsılır.')}</p>
              <p className="down">{t('↓ Yumuşak (konfor): darbeleri yutar; ama virajda yatar, hızlıyken yüzer gibi gider.')}</p>
              <p>{t('Dengeyi kimin için yaptığına göre seç.')}</p>
            </Info>
          </>
        }
        value={d.suspBalance}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => onChange({ suspBalance: v })}
        left={t('Konfor')}
        right={t('Yol tutuş')}
        format={(v) => (Math.abs(v - typBal) <= 0.07 ? t('Sınıfın olağan ayarı') : v < typBal ? t('Olağandan yumuşak') : t('Olağandan sert'))}
      />
      <SuspensionSim suspension={d.suspension} balance={d.suspBalance} knowhow={d.knowhow} year={yf} body={d.body} />
      <ProsCons intro={t('Aynı arabaya sınıfın tipik süspansiyonu takılsaydı:')} pros={notes.pros} cons={notes.cons} />
    </>
  );
}
