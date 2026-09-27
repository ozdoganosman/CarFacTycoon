import { useMemo, useState } from 'react';
import * as A from '../../core/actions';
import { missingRequirements, researchCost, researchDefs, researchSlots, researchSpeed, researchWeeks, rivalAdoption, techState, type ResearchDef } from '../../core/research';
import { yearFloat } from '../../core/time';
import { store, useGameState } from '../store';
import { money } from '../format';
import { inYear } from '../format';
import { Badge, Button, Info, Panel, Progress, Stat } from '../components/ui';

const CATEGORIES: ResearchDef['category'][] = ['Motor', 'Şanzıman', 'Şasi ve süspansiyon', 'Donanım', 'Güvenlik'];

/** Research: technologies appear in the world by year, but a company must learn them before building them. */
export function Research() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const r = s.research ?? { known: [], active: [] };
  const slots = researchSlots(s.company.engineers);
  const free = slots - r.active.length;
  const adoption = useMemo(() => rivalAdoption(s), [s.week, s.rivalModels.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const defs = researchDefs();
  const available = defs.filter((d) => techState(s, d.id, yf) === 'available').length;
  const [tab, setTab] = useState<'Tümü' | ResearchDef['category']>('Tümü');
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>Ar-Ge</h1>
          <p className="muted">
            Yeni teknolojiler dünyada ortaya çıkar, ama tasarımlarında kullanmak için önce senin mühendislerinin öğrenmesi gerekir. İlk öğrenen pahalıya ve yavaş öğrenir;
            teknoloji yaygınlaştıkça ucuzlar ve hızlanır.
          </p>
        </div>
      </div>
      <div className="stats-row">
        <Stat
          label={
            <>
              Aynı anda araştırılan
              <Info>
                <p>Her 15 mühendis bir konu daha yürütebilir.</p>
              </Info>
            </>
          }
          value={`${r.active.length} / ${slots}`}
        />
        <Stat
          label={
            <>
              Araştırma hızı
              <Info>
                <p>Mühendis sayısı arttıkça araştırmalar kısalır. Mühendisleri Finans ekranından işe alırsın.</p>
              </Info>
            </>
          }
          value={`×${researchSpeed(s.company.engineers).toFixed(1)}`}
          sub={`${s.company.engineers} mühendis`}
        />
        <Stat label="Araştırılabilir" value={available} sub="teknoloji" />
      </div>
      {r.active.length > 0 && (
        <Panel title="Süren araştırmalar">
          {r.active.map((a) => {
            const d = defs.find((x) => x.id === a.id);
            return (
              <div key={a.id} className="research-active">
                <div className="test-head">
                  <b>{d?.name ?? a.id}</b>
                  <span className="muted small">{a.weeksLeft} hafta kaldı</span>
                </div>
                <Progress value={a.weeks - a.weeksLeft} max={a.weeks} />
              </div>
            );
          })}
        </Panel>
      )}
      {free <= 0 && available > 0 && (
        <p className="note">
          Bütün araştırma yerlerin dolu: yeni bir konuya başlamak için süren araştırmanın bitmesini bekle. Her 15 mühendis bir araştırma yeri daha açar.
        </p>
      )}
      <div className="tabs research-tabs" role="tablist">
        {(['Tümü', ...CATEGORIES] as const).map((c) => {
          const n = defs.filter((d) => (c === 'Tümü' || d.category === c) && techState(s, d.id, yf) === 'available').length;
          return (
            <button key={c} type="button" role="tab" aria-selected={tab === c} className={`tab ${tab === c ? 'is-on' : ''}`} onClick={() => setTab(c)}>
              {c}
              {n > 0 && <span className="tab-count">{n}</span>}
            </button>
          );
        })}
      </div>
      {CATEGORIES.filter((c) => tab === 'Tümü' || tab === c).map((cat) => {
        const list = defs.filter((d) => d.category === cat).sort((a, b) => a.year - b.year);
        const near = list.filter((d) => d.year <= yf + 10);
        const later = list.length - near.length;
        return (
          <Panel key={cat} title={cat}>
            <div className="research-grid">
              {near.map((d) => {
                const st = techState(s, d.id, yf);
                const cost = researchCost(d, yf);
                const weeks = researchWeeks(d, yf, s.company.engineers);
                const share = adoption[d.id] ?? 0;
                const active = r.active.find((a) => a.id === d.id);
                const missing = missingRequirements(s, d.id);
                return (
                  <div key={d.id} className={`rcard is-${st}`}>
                    <div className="rcard-head">
                      <b>{d.name}</b>
                      <span className="muted small">{d.year}</span>
                    </div>
                    {d.passive && (
                      <span className="rcard-tag" title="Araştırıldıktan sonra bütün yeni tasarımlara ve makyajlara kendiliğinden girer.">
                        Otomatik uygulanır
                      </span>
                    )}
                    <p className="muted small">{d.desc}</p>
                    {d.effects && (
                      <p className="small rcard-effects">
                        <b>Etkisi:</b> {d.effects}
                      </p>
                    )}
                    {missing.length > 0 && st !== 'known' && (
                      <p className="small tone-warn">
                        <b>Önce:</b> {missing.map((m) => m.name).join(', ')}
                      </p>
                    )}
                    {st !== 'future' && <p className="small">{share > 0 ? `Rakip araçların %${Math.round(share * 100)}’i kullanıyor.` : 'Rakiplerde henüz yok.'}</p>}
                    {st === 'known' && <Badge tone="good">Biliniyor</Badge>}
                    {st === 'future' && <p className="muted small">{inYear(d.year)} ortaya çıkar.</p>}
                    {st === 'researching' && active && <Progress value={active.weeks - active.weeksLeft} max={active.weeks} label={`${active.weeksLeft} hf`} />}
                    {st === 'available' && (
                      <Button
                        small
                        kind="primary"
                        disabled={free <= 0 || s.company.cash < cost || missing.length > 0}
                        onClick={() => store.try((st2) => A.startResearch(st2, d.id), `${d.name} araştırması başladı`)}
                      >
                        Araştır · {money(cost)} · {weeks} hf
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            {later > 0 && <p className="muted small">İleride: {later} teknoloji daha.</p>}
          </Panel>
        );
      })}
    </div>
  );
}
