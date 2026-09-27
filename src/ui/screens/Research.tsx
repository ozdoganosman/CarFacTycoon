import { useMemo, useState } from 'react';
import * as A from '../../core/actions';
import { missingRequirements, queueHold, researchCost, researchDef, researchDefs, researchSlots, researchSpeed, researchWeeks, rivalAdoption, techState, type ResearchDef } from '../../core/research';
import { yearFloat } from '../../core/time';
import { store, useGameState } from '../store';
import { money, pctOf } from '../format';
import { inYear } from '../format';
import { Badge, Button, Info, Panel, Progress, Stat } from '../components/ui';

const CATEGORIES: ResearchDef['category'][] = ['Motor', 'Şanzıman', 'Şasi ve süspansiyon', 'Donanım', 'Güvenlik'];

/** Research: technologies appear in the world by year, but a company must learn them before building them. */
export function Research() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const r = s.research ?? { known: [], active: [], queue: [] };
  const queue = r.queue ?? [];
  const hold = queueHold(s, yf);
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
      <Panel title={`Ar-Ge sırası${queue.length ? ` (${queue.length})` : ''}`}>
        {queue.length ? (
          <>
            <ol className="rqueue">
              {queue.map((id, i) => {
                const d = researchDef(id);
                if (!d) return null;
                const waiting = missingRequirements(s, id);
                const why =
                  hold?.id === id && hold.reason === 'cash'
                    ? `kasa yetmiyor (${money(researchCost(d, yf))})`
                    : waiting.length
                      ? `önce ${waiting.map((w) => w.name).join(', ')}`
                      : d.year > yf
                        ? `${inYear(d.year)} ortaya çıkar`
                        : 'yer açılınca başlar';
                return (
                  <li key={id}>
                    <span className="rqueue-name">
                      <b>{d.name}</b>
                      <span className="muted small">
                        {' '}
                        {money(researchCost(d, yf))} · {researchWeeks(d, yf, s.company.engineers)} hf · {why}
                      </span>
                    </span>
                    <span className="rqueue-btns">
                      <Button small kind="ghost" disabled={i === 0} onClick={() => store.try((st) => A.moveResearch(st, id, -1))} aria-label="Yukarı taşı">
                        ↑
                      </Button>
                      <Button small kind="ghost" disabled={i === queue.length - 1} onClick={() => store.try((st) => A.moveResearch(st, id, 1))} aria-label="Aşağı taşı">
                        ↓
                      </Button>
                      <Button small kind="ghost" onClick={() => store.try((st) => A.unqueueResearch(st, id))} aria-label="Sıradan çıkar">
                        ×
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="muted small">
              Bir araştırma bitip yer açılınca sıradaki konu kendiliğinden başlar ve bedeli o an ödenir. Kasa yetmezse sıra bekler; önkoşulunu bekleyen konunun yerine arkasındaki
              başlar. Her biten ve başlayan araştırma için köşede not çıkar.
            </p>
          </>
        ) : (
          <p className="muted small">
            Sıra boş. Kartlardaki “Sıraya ekle” ile birden çok konuyu sırala: bir araştırma bitince sıradaki kendiliğinden başlar. Eksik önkoşullar da önüne eklenir.
          </p>
        )}
      </Panel>
      {free <= 0 && available > 0 && (
        <p className="note">
          Bütün araştırma yerlerin dolu: yeni konuları sıraya ekle, yer açılınca başlarlar. Her 15 mühendis bir araştırma yeri daha açar.
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
                    {st !== 'future' && <p className="small">{share > 0 ? `Rakip araçların ${pctOf(share)} kullanıyor.` : 'Rakiplerde henüz yok.'}</p>}
                    {st === 'known' && <Badge tone="good">Biliniyor</Badge>}
                    {st === 'future' && <p className="muted small">{inYear(d.year)} ortaya çıkar.</p>}
                    {st === 'researching' && active && <Progress value={active.weeks - active.weeksLeft} max={active.weeks} label={`${active.weeksLeft} hf`} />}
                    {st === 'available' && queue.includes(d.id) && (
                      <div className="row">
                        <Badge tone="info">Sırada #{queue.indexOf(d.id) + 1}</Badge>
                        <Button small kind="ghost" onClick={() => store.try((st2) => A.unqueueResearch(st2, d.id))}>
                          Sıradan çıkar
                        </Button>
                      </div>
                    )}
                    {st === 'available' && !queue.includes(d.id) && (
                      <div className="row">
                        {free > 0 && missing.length === 0 && (
                          <Button
                            small
                            kind="primary"
                            disabled={s.company.cash < cost}
                            onClick={() => store.try((st2) => A.startResearch(st2, d.id), `${d.name} araştırması başladı`)}
                          >
                            Araştır · {money(cost)} · {weeks} hf
                          </Button>
                        )}
                        <Button small kind={free > 0 && missing.length === 0 ? 'ghost' : 'primary'} onClick={() => store.try((st2) => A.queueResearch(st2, d.id), `${d.name} sıraya eklendi`)}>
                          {missing.length ? 'Önkoşullarıyla sıraya ekle' : 'Sıraya ekle'}
                          {free <= 0 || missing.length ? ` · ${money(cost)} · ${weeks} hf` : ''}
                        </Button>
                      </div>
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
