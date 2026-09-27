import { useState } from 'react';
import * as A from '../../core/actions';
import { enginePresets, withStrokeRatio } from '../../core/ai';
import { displacementCc, knockLimit } from '../../core/engine';
import { bonusFromPoints, evenFocus, productivity } from '../../core/development';
import { engineersBusy } from '../../core/game';
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
import { store, useGameState } from '../store';
import { kmh, litres, money, secs } from '../format';
import { inYear } from '../format';
import { Button, Choice, Panel, Slider, Toggle } from '../components/ui';
import { StatsPanel, useCarStats } from '../components/StatsPanel';
import { CarSVG } from '../viz/CarSVG';
import { LineChart } from '../viz/LineChart';
import { FourStroke } from '../cards/animations';

/** What an evenly focused, fully developed car would get: lets the design screen show realistic numbers. */
function expectedBonus(skill: number) {
  const f = evenFocus();
  return bonusFromPoints({ performance: f.performance, efficiency: f.efficiency, comfort: f.comfort, safety: f.safety, cost: f.cost }, 1, 1, skill);
}

type Tab = 'chassis' | 'body' | 'engine' | 'gearbox' | 'suspension' | 'safety' | 'equipment';
const TABS: { id: Tab; label: string }[] = [
  { id: 'chassis', label: 'Şasi' },
  { id: 'body', label: 'Gövde' },
  { id: 'engine', label: 'Motor' },
  { id: 'gearbox', label: 'Şanzıman' },
  { id: 'suspension', label: 'Süspansiyon' },
  { id: 'safety', label: 'Güvenlik' },
  { id: 'equipment', label: 'İç mekân' },
];

export function Designer({ project, readOnly }: { project: Project; readOnly?: boolean }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const [tab, setTab] = useState<Tab>('body');
  const d = project.design;
  const facelift = project.kind === 'facelift';
  const platformLocked = !!project.platformId || facelift;
  const engineLocked = !!project.engineRefId || facelift;
  const set = (patch: Partial<CarDesign>) => {
    if (readOnly) return;
    store.act((st) => A.updateDesign(st, project.id, { ...d, ...patch }));
  };
  const setEngine = (e: EngineDesign) => set({ engine: e });

  return (
    <div className="designer">
      <div className="designer-main">
        <div className="designer-car">
          <CarSVG body={d.body} size={d.size} year={yf} cylinders={d.engine.cylinders} styling={d.styling} />
        </div>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <fieldset className="tab-body" disabled={readOnly}>
          {tab === 'chassis' && (
            <>
              {platformLocked && (
                <p className="note">
                  {facelift ? 'Makyajda şasi değişmez.' : 'Mevcut bir platformu kullanıyorsun: şasi, boyut ve süspansiyon sabit. Geliştirme ve kalıp maliyeti düşük.'}
                </p>
              )}
              <Choice
                value={d.chassis}
                onChange={(v) => set({ chassis: v })}
                options={CHASSIS.map((c) => ({
                  value: c.id,
                  label: c.name,
                  disabled: platformLocked || c.year > yf,
                  sub: c.year > yf ? `${inYear(c.year)} gelir` : c.desc,
                }))}
              />
              <Slider
                label="Boyut"
                value={d.size}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => set({ size: v })}
                left="Küçük"
                right="Büyük"
                format={(v) => `${Math.round(v * 100)}`}
                disabled={platformLocked}
                hint="Büyük araç: konfor, pratiklik ve prestij ↑; ağırlık, maliyet ve üretim zorluğu ↑."
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
                  label: b.name,
                  disabled: b.year > yf || (facelift && b.id !== d.body),
                  sub: b.year > yf ? `${inYear(b.year)} gelir` : b.desc,
                }))}
              />
              <Slider
                label="Tasarım ve karoser işçiliği"
                value={d.styling}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => set({ styling: v })}
                left="Sade"
                right="Gösterişli"
                format={(v) => `${Math.round(v * 100)}`}
                hint="Prestiji ve biraz da aerodinamiği artırır; maliyet ve üretim zorluğu artar."
              />
            </>
          )}
          {tab === 'engine' && <EngineTab s={s} d={d} yf={yf} locked={engineLocked} onChange={setEngine} project={project} />}
          {tab === 'gearbox' && <GearboxTab d={d} yf={yf} bonus={project.bonus} onChange={set} />}
          {tab === 'suspension' && (
            <>
              <Choice
                value={d.suspension}
                onChange={(v) => set({ suspension: v })}
                options={SUSPENSIONS.map((x) => ({
                  value: x.id,
                  label: x.name,
                  disabled: platformLocked || x.year > yf,
                  sub: x.year > yf ? `${inYear(x.year)} gelir` : x.desc,
                }))}
              />
              <Slider
                label="Ayar"
                value={d.suspBalance}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => set({ suspBalance: v })}
                left="Konfor"
                right="Yol tutuş"
                format={(v) => (v < 0.4 ? 'Yumuşak' : v > 0.6 ? 'Sert' : 'Dengeli')}
              />
            </>
          )}
          {tab === 'safety' && <FeatureList d={d} yf={yf} group="safety" onChange={(features) => set({ features })} />}
          {tab === 'equipment' && (
            <>
              <FeatureList d={d} yf={yf} group="equipment" onChange={(features) => set({ features })} />
              <Slider
                label="İç mekân kalitesi"
                value={d.interior}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => set({ interior: v })}
                left="Tahta sıra"
                right="Deri ve ceviz"
                format={(v) => `${Math.round(v * 100)}`}
                hint="Konfor ve prestij ↑, maliyet ↑ (hızla artar)."
              />
            </>
          )}
        </fieldset>
      </div>
      <aside className="designer-side">
        <StatsPanel
          s={s}
          design={d}
          segment={project.segment}
          yf={yf}
          bonus={project.bonus ?? expectedBonus(s.company.skill)}
          targetPrice={project.targetPrice}
          note="Dengeli bir geliştirme sonrası tahmini"
        />
      </aside>
    </div>
  );
}

function FeatureList({ d, yf, group, onChange }: { d: CarDesign; yf: number; group: 'safety' | 'equipment'; onChange: (f: FeatureId[]) => void }) {
  const list = FEATURES.filter((f) => f.group === group);
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
        const future = f.year > yf;
        return (
          <Toggle
            key={f.id}
            checked={d.features.includes(f.id)}
            disabled={future || missing.length > 0}
            onChange={(v) => toggle(f.id, v)}
            label={
              <>
                {f.name} <span className="muted small">{money(f.cost)}’dan</span>
              </>
            }
            sub={future ? `${inYear(f.year)} gelir` : missing.length ? `Önce: ${missing.map((m) => FEATURES.find((x) => x.id === m)!.name).join(', ')}` : f.desc}
          />
        );
      })}
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
  const presets = enginePresets(Math.floor(yf));
  const ratio = e.stroke / e.bore;
  const curve = engineCurve(d, yf, project.bonus?.powerMult);
  const engineer = s.settings.engineerMode;
  const cylOpts = CYLINDER_OPTIONS.filter((c) => c.year <= yf);
  const kl = knockLimit(e.bore, yf);
  const eu = yf >= 1910 && yf <= 1947;

  return (
    <div className="engine-tab">
      {locked && (
        <p className="note">
          {project.kind === 'facelift' ? 'Makyajda motor değişmez.' : 'Kütüphanedeki bir motoru kullanıyorsun: geliştirme işi %25 azalır ve motor daha az kusurlu çıkar.'}{' '}
          {project.kind !== 'facelift' && (
            <Button small kind="ghost" onClick={() => store.act((st2) => (st2.projects.find((p) => p.id === project.id)!.engineRefId = undefined))}>
              Yeni motor tasarla
            </Button>
          )}
        </p>
      )}
      <fieldset disabled={locked} className="engine-controls">
        {!engineer ? (
          <>
            <div className="field">
              <span>Hazır motorlar</span>
              <Choice
                value={presets.find((p) => p.design.cylinders === e.cylinders && Math.abs(displacementCc(p.design) - displacementCc(e)) < 60)?.id ?? ''}
                onChange={(id) => {
                  const p = presets.find((x) => x.id === id);
                  if (p) onChange({ ...p.design });
                }}
                options={presets.map((p) => ({
                  value: p.id,
                  label: `${p.name} · ${(displacementCc(p.design) / 1000).toFixed(1)} L ${p.design.layout === 'v' ? 'V' : ''}${p.design.cylinders}`,
                  sub: p.desc,
                }))}
              />
            </div>
            <Slider
              label="Karakter (strok / çap)"
              value={Math.round(ratio * 100) / 100}
              min={0.75}
              max={1.6}
              step={0.05}
              onChange={(v) => onChange(withStrokeRatio(e, v, yf))}
              left="Kısa strok: devir, güç"
              right="Uzun strok: tork, verim, vergi"
              format={(v) => v.toFixed(2)}
              hint={eu ? 'Avrupa’da vergi beygiri yalnızca silindir çapına bakar: uzun strok vergiyi düşürür.' : 'Uzun strok düşük devirde çeker, kısa strok yüksek devirde güç verir.'}
            />
            <p className="muted small">Her ayar için “Mühendis modu”nu Ayarlar’dan açabilirsin.</p>
          </>
        ) : (
          <>
            <div className="field">
              <span>Silindir düzeni</span>
              <Choice
                value={`${e.cylinders}${e.layout}`}
                onChange={(v) => {
                  const c = cylOpts.find((x) => `${x.cylinders}${x.layout}` === v)!;
                  const cc = displacementCc(e);
                  const perCyl = cc / c.cylinders;
                  const bore = Math.round(Math.cbrt((4 * perCyl) / (Math.PI * ratio)) * 10 * 2) / 2;
                  onChange({ ...e, cylinders: c.cylinders, layout: c.layout, bore, stroke: Math.round(bore * ratio * 2) / 2 });
                }}
                options={cylOpts.map((c) => ({ value: `${c.cylinders}${c.layout}`, label: c.label }))}
              />
            </div>
            <div className="grid-2 tight">
              <Slider label="Silindir çapı" value={e.bore} min={50} max={160} step={0.5} onChange={(v) => onChange({ ...e, bore: v })} format={(v) => `${v} mm`} />
              <Slider label="Strok" value={e.stroke} min={50} max={180} step={0.5} onChange={(v) => onChange({ ...e, stroke: v })} format={(v) => `${v} mm`} />
            </div>
            <Slider
              label="Sıkıştırma oranı"
              value={e.compression}
              min={3.5}
              max={Math.round(maxCompression(yf) * 10) / 10}
              step={0.1}
              onChange={(v) => onChange({ ...e, compression: v })}
              format={(v) => `${v.toFixed(1)} : 1`}
              hint={
                <>
                  Bu çapta vuruntu sınırı <b>{kl.toFixed(1)}</b>. {e.compression > kl ? <span className="tone-bad">Motor vuruntu yapıyor: güç ve güvenilirlik düşer!</span> : 'Güvenli.'}
                </>
              }
            />
            <div className="field">
              <span>Supap düzeni</span>
              <Choice
                value={e.valvetrain}
                onChange={(v) => onChange({ ...e, valvetrain: v })}
                options={VALVETRAINS.map((v) => ({ value: v.id, label: v.name, disabled: v.year > yf, sub: v.year > yf ? `${inYear(v.year)}` : v.desc }))}
              />
            </div>
            <div className="grid-2 tight">
              <div className="field">
                <span>Yakıt sistemi</span>
                <Choice
                  value={e.fuelSystem}
                  onChange={(v) => onChange({ ...e, fuelSystem: v })}
                  options={FUEL_SYSTEMS.map((f) => ({ value: f.id, label: f.name, disabled: f.year > yf, sub: f.year > yf ? `${inYear(f.year)}` : undefined }))}
                />
              </div>
              <div className="field">
                <span>Aşırı besleme</span>
                <Choice
                  value={e.aspiration}
                  onChange={(v) => onChange({ ...e, aspiration: v })}
                  options={ASPIRATIONS.map((a) => ({ value: a.id, label: a.name, disabled: a.year > yf, sub: a.year > yf ? `${inYear(a.year)}` : undefined }))}
                />
              </div>
            </div>
          </>
        )}
      </fieldset>
      <div className="readouts">
        <div>
          <span>Hacim</span>
          <b>{(es.displacementCc / 1000).toFixed(2)} L</b>
        </div>
        <div>
          <span>Güç</span>
          <b>
            {es.powerHp.toFixed(0)} bg @ {Math.round(es.peakPowerRpm)}
          </b>
        </div>
        <div>
          <span>Tork</span>
          <b>
            {es.torqueNm.toFixed(0)} Nm @ {Math.round(es.peakTorqueRpm)}
          </b>
        </div>
        <div>
          <span>Devir sınırı</span>
          <b>{Math.round(es.redline)} d/d</b>
        </div>
        <div>
          <span>Çap × strok</span>
          <b>
            {e.bore} × {e.stroke} mm
          </b>
        </div>
        <div title="İngiliz vergi beygiri: çap² × silindir / 2,5 (inç)">
          <span>Vergi beygiri</span>
          <b>{es.taxHp.toFixed(1)}</b>
        </div>
        <div>
          <span>Motor ağırlığı</span>
          <b>{Math.round(es.massKg)} kg</b>
        </div>
        <div>
          <span>Motor maliyeti</span>
          <b>{money(es.cost)}</b>
        </div>
      </div>
      <div className="engine-viz">
        <div className="engine-anim">
          <FourStroke bore={e.bore} stroke={e.stroke} rpm={Math.round(es.peakPowerRpm)} controls={false} />
        </div>
        <div className="engine-charts">
          <LineChart
            title="Güç (bg)"
            series={[{ id: 'hp', name: 'Güç', color: 'var(--series-2)', points: curve.map((p) => ({ x: p.rpm, y: p.hp })), area: true }]}
            height={130}
            xFormat={(v) => `${Math.round(v)}`}
            yFormat={(v) => v.toFixed(0)}
            xLabel="Devir (d/d)"
            ariaLabel="Motor güç eğrisi"
          />
          <LineChart
            title="Tork (Nm)"
            series={[{ id: 'tq', name: 'Tork', color: 'var(--series-1)', points: curve.map((p) => ({ x: p.rpm, y: p.torque })), area: true }]}
            height={130}
            xFormat={(v) => `${Math.round(v)}`}
            yFormat={(v) => v.toFixed(0)}
            xLabel="Devir (d/d)"
            ariaLabel="Motor tork eğrisi"
          />
        </div>
      </div>
    </div>
  );
}

const GEAR_COLORS = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)'];

function GearboxTab({ d, yf, bonus, onChange }: { d: CarDesign; yf: number; bonus?: Project['bonus']; onChange: (p: Partial<CarDesign>) => void }) {
  const st = useCarStats(d, yf, bonus);
  const g = d.gearbox;
  const maxG = g.type === 'automatic' ? 4 : maxGears(yf);
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
      <Choice
        value={g.type}
        onChange={(v) => onChange({ gearbox: { ...g, type: v, gears: v === 'automatic' ? 4 : Math.min(g.gears, maxGears(yf)) } })}
        options={GEARBOX_TYPES.map((x) => ({ value: x.id, label: x.name, disabled: x.year > yf, sub: x.year > yf ? `${inYear(x.year)} gelir` : x.desc }))}
      />
      <div className="grid-2 tight">
        <div className="field">
          <span>İleri vites sayısı</span>
          <Choice
            compact
            value={g.gears}
            onChange={(v) => onChange({ gearbox: { ...g, gears: v } })}
            options={[2, 3, 4, 5].map((n) => ({ value: n, label: `${n}`, disabled: n > maxG || (g.type === 'automatic' && n !== 4) }))}
          />
        </div>
        <Slider
          label="Oranlar"
          value={g.spread}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => onChange({ gearbox: { ...g, spread: v } })}
          left="Kısa: çevik"
          right="Uzun: az yakar"
          format={(v) => (v < 0.3 ? 'Kısa' : v > 0.6 ? 'Uzun' : 'Dengeli')}
        />
      </div>
      <div className="readouts">
        <div>
          <span>Son hız</span>
          <b>{kmh(st.topSpeed)}</b>
        </div>
        <div>
          <span>0-50 km/s</span>
          <b>{secs(st.accel50)}</b>
        </div>
        <div>
          <span>0-100 km/s</span>
          <b>{secs(st.accel100)}</b>
        </div>
        <div>
          <span>Tüketim</span>
          <b>{litres(st.fuel)}</b>
        </div>
        <div>
          <span>Vites başına hız</span>
          <b>{speeds.map((v) => Math.round(v)).join(' / ')}</b>
        </div>
      </div>
      <LineChart
        title="Tekerlekteki çekiş kuvveti: her vites bir eğri, kesikli çizgi yol direnci"
        series={[
          ...curves.map((c, i) => ({
            id: `g${c.gear}`,
            name: `${c.gear}. vites`,
            color: GEAR_COLORS[i],
            points: c.points.map((p) => ({ x: p.kmh, y: p.force })),
          })),
          { id: 'load', name: 'Yol direnci', color: 'var(--muted)', dashed: true, points: load },
        ]}
        height={220}
        xMin={0}
        xMax={maxKmh}
        xFormat={(v) => `${Math.round(v)}`}
        yFormat={(v) => `${Math.round(v)}`}
        xLabel="Hız (km/s)"
        yLabel="Kuvvet (N)"
        ariaLabel="Viteslere göre çekiş kuvveti grafiği"
      />
      <p className="muted small">Eğrilerin yol direncini kestiği yer son hızdır. Vites sayısı arttıkça eğriler birbirine yaklaşır ve motor güçlü olduğu devirde kalır.</p>
    </>
  );
}

/** Footer shown under the designer in the design phase. */
export function DesignFooter({ project }: { project: Project }) {
  const s = useGameState();
  const free = s.company.engineers - engineersBusy(s);
  const work = A.requiredWork(s, project);
  const eng = Math.max(1, Math.min(project.engineers, free));
  const weeks = work / (eng * productivity(s.company.skill));
  return (
    <Panel className="design-footer">
      <div className="footer-row">
        <Slider
          label="Mühendis sayısı"
          value={eng}
          min={1}
          max={Math.max(1, free)}
          onChange={(v) => store.act((st) => A.setProjectEngineers(st, project.id, v))}
          format={(v) => `${v} / ${s.company.engineers}`}
          disabled={free < 1}
        />
        <div className="footer-info">
          <span className="muted small">Tahmini geliştirme süresi</span>
          <b>{free < 1 ? 'Boşta mühendis yok' : `${Math.ceil(weeks)} hafta`}</b>
          <span className="muted small">İş yükü: {Math.round(work)} mühendis-hafta</span>
        </div>
        <Button kind="primary" disabled={free < 1} onClick={() => store.try((st) => A.beginDevelopment(st, project.id), 'Geliştirme başladı')}>
          Geliştirmeyi başlat
        </Button>
      </div>
    </Panel>
  );
}
