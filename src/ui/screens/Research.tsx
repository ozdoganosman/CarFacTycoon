import { useMemo, useState } from 'react';
import * as A from '../../core/actions';
import {
  missingRequirements,
  queueHold,
  researchCost,
  researchDef,
  researchDefs,
  researchSlots,
  researchSpeed,
  researchWeeks,
  rivalAdoption,
  techState,
  type ResearchDef,
} from '../../core/research';
import { yearFloat } from '../../core/time';
import { store, useGameState } from '../store';
import { money, pctOf } from '../format';
import { inYear } from '../format';
import { Button, Info, Panel, Progress, Stat } from '../components/ui';

const CATEGORIES: ResearchDef['category'][] = ['Motor', 'Şanzıman', 'Şasi ve süspansiyon', 'Donanım', 'Güvenlik'];
const ICON: Record<ResearchDef['category'], string> = { Motor: '⚙️', Şanzıman: '🔩', 'Şasi ve süspansiyon': '🛞', Donanım: '💡', Güvenlik: '🛡️' };

type Filter = 'open' | 'rivals' | 'new' | 'queued' | 'known' | 'future';
type Sort = 'rivals' | 'year' | 'cost';

const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: 'open', label: 'Araştırılabilir', hint: 'Dünyada var, sen bilmiyorsun, sırada da değil.' },
  { id: 'rivals', label: 'Rakiplerde var', hint: 'Rakip araçların en az onda biri kullanıyor, sen bilmiyorsun.' },
  { id: 'new', label: 'Yeni çıkan', hint: 'Son iki yılda ortaya çıktı: ilk öğrenen pahalıya öğrenir ama önde olur.' },
  { id: 'queued', label: 'Sırada', hint: 'Araştırılan ve sıradaki konular.' },
  { id: 'known', label: 'Biliniyor', hint: 'Şirketin bildikleri.' },
  { id: 'future', label: 'Yakında', hint: 'Önümüzdeki on yılda ortaya çıkacaklar.' },
];

/** Research: technologies appear in the world by year, but a company must learn them before building them. */
export function Research() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const r = s.research ?? { known: [], active: [], queue: [] };
  const queue = r.queue ?? [];
  const slots = researchSlots(s.company.engineers);
  const adoption = useMemo(() => rivalAdoption(s), [s.week, s.rivalModels.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const defs = researchDefs();
  const [filter, setFilter] = useState<Filter>('open');
  const [cat, setCat] = useState<'all' | ResearchDef['category']>('all');
  const [sort, setSort] = useState<Sort>('rivals');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const isQueued = (id: string) => queue.includes(id) || r.active.some((a) => a.id === id);
  const matches: Record<Filter, (d: ResearchDef) => boolean> = {
    open: (d) => techState(s, d.id, yf) === 'available' && !isQueued(d.id),
    rivals: (d) => techState(s, d.id, yf) === 'available' && !isQueued(d.id) && (adoption[d.id] ?? 0) >= 0.1,
    new: (d) => techState(s, d.id, yf) === 'available' && !isQueued(d.id) && d.year >= yf - 2,
    queued: (d) => isQueued(d.id),
    known: (d) => techState(s, d.id, yf) === 'known',
    future: (d) => techState(s, d.id, yf) === 'future' && d.year <= yf + 10,
  };
  const inCat = (d: ResearchDef) => cat === 'all' || d.category === cat;
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const inSearch = (d: ResearchDef) => !needle || `${d.name} ${d.desc} ${d.effects ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle);
  const count = (f: Filter) => defs.filter((d) => matches[f](d) && inCat(d)).length;
  const list = defs
    .filter((d) => matches[filter](d) && inCat(d) && inSearch(d))
    .sort((a, b) =>
      filter === 'queued'
        ? rank(a.id) - rank(b.id)
        : sort === 'rivals'
          ? (adoption[b.id] ?? 0) - (adoption[a.id] ?? 0) || a.year - b.year
          : sort === 'cost'
            ? researchCost(a, yf, s) - researchCost(b, yf, s)
            : a.year - b.year,
    );
  function rank(id: string) {
    const i = r.active.findIndex((a) => a.id === id);
    return i >= 0 ? i - 100 : queue.indexOf(id);
  }
  const spent = s.finance.slice(-52).reduce((a, f) => a + f.rnd, 0);
  const revenue = s.finance.slice(-52).reduce((a, f) => a + f.revenue, 0);
  const addable = list.filter((d) => techState(s, d.id, yf) === 'available' && !isQueued(d.id));

  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>Ar-Ge</h1>
          <p className="muted">Yeni teknoloji dünyada ortaya çıkar; tasarımda kullanmak için önce mühendislerinin öğrenmesi gerekir. Sıraya dizdiklerin sırayla kendiliğinden başlar.</p>
        </div>
      </div>
      <div className="stats-row">
        <Stat
          label={
            <>
              Araştırma yeri
              <Info>
                <p>Her 15 mühendis bir konu daha yürütebilir.</p>
              </Info>
            </>
          }
          value={`${r.active.length} / ${slots}`}
        />
        <Stat label="Araştırma hızı" value={`×${researchSpeed(s.company.engineers).toFixed(1)}`} sub={`${s.company.engineers} mühendis`} />
        <Stat
          label={
            <>
              Son 52 hafta Ar-Ge
              <Info>
                <p>Araştırma, prototip ve test harcaması. Büyük şirketin araştırması da büyüktür: önemli bir konu cironun yüzde birkaçına mal olur.</p>
              </Info>
            </>
          }
          value={money(spent)}
          sub={revenue > 0 && spent > 0 ? (spent / revenue >= 0.001 ? `cironun ${pctOf(spent / revenue, 1)}` : 'cironun binde birinden az') : undefined}
        />
        <Stat label="Rakiplerde var, sende yok" value={count('rivals')} sub="teknoloji" tone={count('rivals') > 3 ? 'warn' : undefined} />
      </div>

      <div className="research-layout">
        <div className="research-main">
          <div className="rfilters" role="tablist" aria-label="Süzgeç">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} title={f.hint} className={`rchip ${filter === f.id ? 'is-on' : ''}`} onClick={() => setFilter(f.id)}>
                {f.label}
                <span className="rchip-n">{count(f.id)}</span>
              </button>
            ))}
          </div>
          <div className="rtools">
            <div className="rcats" role="group" aria-label="Alan">
              <button type="button" className={`rcat ${cat === 'all' ? 'is-on' : ''}`} onClick={() => setCat('all')}>
                Hepsi
              </button>
              {CATEGORIES.map((c) => (
                <button key={c} type="button" className={`rcat ${cat === c ? 'is-on' : ''}`} onClick={() => setCat(c)} title={c}>
                  {ICON[c]} {c === 'Şasi ve süspansiyon' ? 'Şasi' : c}
                </button>
              ))}
            </div>
            <input className="rsearch" type="search" placeholder="Ara: OHV, fren, lastik…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Teknoloji ara" />
            {filter !== 'queued' && (
              <select className="rsort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sırala">
                <option value="rivals">Rakip kullanımına göre</option>
                <option value="year">Yıla göre</option>
                <option value="cost">Bedele göre</option>
              </select>
            )}
          </div>
          {addable.length > 1 && (filter === 'rivals' || filter === 'new' || needle) && (
            <p className="rbulk">
              <Button small onClick={() => store.act((st) => addable.forEach((d) => A.queueResearch(st, d.id)))}>
                Listedeki {addable.length} konunun hepsini sıraya ekle
              </Button>
              <span className="muted small">
                {' '}
                toplam ~{money(addable.reduce((a, d) => a + researchCost(d, yf, s), 0))}; bedeller konu başladığında ödenir.
              </span>
            </p>
          )}
          <div className="rlist" role="list">
            {list.map((d) => (
              <ResearchRow key={d.id} d={d} expanded={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)} share={adoption[d.id] ?? 0} />
            ))}
            {!list.length && <p className="muted rempty">{emptyText(filter, !!needle)}</p>}
          </div>
        </div>
        <aside className="research-side">
          <ActiveAndQueue />
        </aside>
      </div>
    </div>
  );
}

function emptyText(f: Filter, searching: boolean): string {
  if (searching) return 'Aramaya uyan konu yok.';
  switch (f) {
    case 'open':
      return 'Şu an öğrenilmemiş bir teknoloji yok: hepsi biliniyor ya da sırada.';
    case 'rivals':
      return 'Rakiplerin kullanıp senin bilmediğin bir teknoloji yok.';
    case 'new':
      return 'Son iki yılda yeni bir teknoloji çıkmadı.';
    case 'queued':
      return 'Sıra boş. “Araştırılabilir” listesinden konu ekle.';
    case 'known':
      return 'Henüz bir şey öğrenilmedi.';
    case 'future':
      return 'Önümüzdeki on yılda yeni bir şey beklenmiyor.';
  }
}

function ResearchRow({ d, expanded, onToggle, share }: { d: ResearchDef; expanded: boolean; onToggle: () => void; share: number }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const r = s.research!;
  const queue = r.queue ?? [];
  const st = techState(s, d.id, yf);
  const cost = researchCost(d, yf, s);
  const weeks = researchWeeks(d, yf, s.company.engineers);
  const missing = missingRequirements(s, d.id);
  const active = r.active.find((a) => a.id === d.id);
  const free = researchSlots(s.company.engineers) - r.active.length;
  const qi = queue.indexOf(d.id);
  return (
    <div className={`rrow is-${st}`} role="listitem">
      <button type="button" className="rrow-main" onClick={onToggle} aria-expanded={expanded}>
        <span className="rrow-icon" aria-hidden>
          {ICON[d.category]}
        </span>
        <span className="rrow-name">
          <b>{d.name}</b>
          <span className="rrow-tags">
            <span className="muted small">{d.year}</span>
            {st === 'available' && d.year >= yf - 2 && <span className="rtag rtag-new">yeni</span>}
            {d.passive && <span className="rtag">otomatik uygulanır</span>}
            {missing.length > 0 && st !== 'known' && <span className="rtag rtag-warn">önce {missing.map((m) => m.name).join(', ')}</span>}
          </span>
        </span>
      </button>
      <span className="rrow-share" title="Bu teknolojiyi kullanan rakip araçların payı">
        {st === 'future' ? (
          <span className="muted small">{inYear(d.year)} çıkar</span>
        ) : (
          <>
            <span className="rbar">
              <i style={{ width: `${Math.round(share * 100)}%` }} />
            </span>
            <span className="small">{share > 0 ? `rakiplerin %${Math.round(share * 100)}` : 'rakiplerde yok'}</span>
          </>
        )}
      </span>
      <span className="rrow-cost small">
        {st === 'known' ? (
          <span className="tone-good">✓ biliniyor</span>
        ) : active ? (
          <Progress value={active.weeks - active.weeksLeft} max={active.weeks} label={`${active.weeksLeft} hf`} />
        ) : st === 'future' ? (
          ''
        ) : (
          <>
            {money(cost)} · {weeks} hf
          </>
        )}
      </span>
      <span className="rrow-act">
        {st === 'available' && qi >= 0 && (
          <>
            <span className="rtag">sırada #{qi + 1}</span>
            <Button small kind="ghost" onClick={() => store.try((st2) => A.unqueueResearch(st2, d.id))} aria-label={`${d.name} sıradan çıkar`}>
              ×
            </Button>
          </>
        )}
        {st === 'available' && qi < 0 && !active && (
          <>
            {free > 0 && missing.length === 0 && (
              <Button small kind="primary" disabled={s.company.cash < cost} onClick={() => store.try((st2) => A.startResearch(st2, d.id), `${d.name} araştırması başladı`)}>
                Araştır
              </Button>
            )}
            <Button small kind={free > 0 && missing.length === 0 ? 'ghost' : 'primary'} onClick={() => store.try((st2) => A.queueResearch(st2, d.id), `${d.name} sıraya eklendi`)}>
              + Sıra
            </Button>
          </>
        )}
      </span>
      {expanded && (
        <div className="rrow-more">
          <p className="small">{d.desc}</p>
          {d.effects && (
            <p className="small">
              <b>Etkisi:</b> {d.effects}
            </p>
          )}
          {d.passive && <p className="small muted">Öğrenildiği andan itibaren bütün yeni tasarımlara ve makyajlara kendiliğinden girer.</p>}
          {!d.passive && st !== 'future' && <p className="small muted">Öğrenildikten sonra tasarım ekranında seçilebilir.</p>}
        </div>
      )}
    </div>
  );
}

/** What the engineers are learning now and what comes next. */
function ActiveAndQueue() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const r = s.research ?? { known: [], active: [], queue: [] };
  const queue = r.queue ?? [];
  const hold = queueHold(s, yf);
  return (
    <>
      <Panel title="Şu an araştırılan">
        {r.active.length ? (
          r.active.map((a) => (
            <div key={a.id} className="research-active">
              <div className="test-head">
                <b>{researchDef(a.id)?.name ?? a.id}</b>
                <span className="muted small">{a.weeksLeft} hf</span>
              </div>
              <Progress value={a.weeks - a.weeksLeft} max={a.weeks} />
            </div>
          ))
        ) : (
          <p className="muted small">Mühendisler şu an bir şey araştırmıyor.</p>
        )}
      </Panel>
      <Panel title={`Sıra${queue.length ? ` (${queue.length})` : ''}`}>
        {queue.length ? (
          <>
            <ol className="rqueue">
              {queue.map((id, i) => {
                const d = researchDef(id);
                if (!d) return null;
                const waiting = missingRequirements(s, id);
                const why =
                  hold?.id === id && hold.reason === 'cash'
                    ? 'kasa bekliyor'
                    : waiting.length
                      ? `önce ${waiting.map((w) => w.name).join(', ')}`
                      : d.year > yf
                        ? `${inYear(d.year)} çıkar`
                        : '';
                return (
                  <li key={id}>
                    <span className="rqueue-name">
                      <b>{d.name}</b>
                      <span className="muted small">
                        {' '}
                        {money(researchCost(d, yf, s))}
                        {why && ` · ${why}`}
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
              Yer açılınca sıradaki kendiliğinden başlar; bedeli o an ödenir ve kasada birkaç haftalık gider kadar yedek bırakılır. Önkoşulunu bekleyenin yerine arkasındaki başlar.
            </p>
          </>
        ) : (
          <p className="muted small">Sıra boş. Listeden “+ Sıra” ile ekle; eksik önkoşullar kendiliğinden öne girer.</p>
        )}
      </Panel>
    </>
  );
}
