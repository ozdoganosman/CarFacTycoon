import { useMemo, useState } from 'react';
import * as A from '../../core/actions';
import {
  labSlots,
  labSpeed,
  missingRequirements,
  queueHold,
  researchCost,
  researchDef,
  researchDefs,
  researchSlots,
  researchSpeed,
  researchWeeks,
  researcherHireCost,
  researcherSalary,
  rivalAdoption,
  techState,
  type ResearchDef,
} from '../../core/research';
import { yearFloat } from '../../core/time';
import { store, useGameState } from '../store';
import { dec, money, pct, pctOf } from '../format';
import { inYear } from '../format';
import { Button, Info, Panel, Progress, Stat } from '../components/ui';
import { locale, msg, t } from '../../i18n';
import { tx } from '../i18n';

const CATEGORIES: ResearchDef['category'][] = [msg('Motor'), msg('Şanzıman'), msg('Şasi ve süspansiyon'), msg('Donanım'), msg('Güvenlik')];
const ICON: Record<ResearchDef['category'], string> = { Motor: '⚙️', Şanzıman: '🔩', 'Şasi ve süspansiyon': '🛞', Donanım: '💡', Güvenlik: '🛡️' };

type Filter = 'open' | 'rivals' | 'new' | 'queued' | 'known' | 'future';
type Sort = 'rivals' | 'year' | 'cost';

const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: 'open', label: msg('Araştırılabilir'), hint: msg('Dünyada var, sen bilmiyorsun, sırada da değil.') },
  { id: 'rivals', label: msg('Rakiplerde var'), hint: msg('Rakip araçların en az onda biri kullanıyor, sen bilmiyorsun.') },
  { id: 'new', label: msg('Yeni çıkan'), hint: msg('Son iki yılda ortaya çıktı: ilk öğrenen pahalıya öğrenir ama önde olur.') },
  { id: 'queued', label: msg('Sırada'), hint: msg('Araştırılan ve sıradaki konular.') },
  { id: 'known', label: msg('Biliniyor'), hint: msg('Şirketin bildikleri.') },
  { id: 'future', label: msg('Yakında'), hint: msg('Önümüzdeki on yılda ortaya çıkacaklar.') },
];

/** Research: technologies appear in the world by year, but a company must learn them before building them. */
export function Research() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const r = s.research ?? { known: [], active: [], queue: [] };
  const queue = r.queue ?? [];
  const slots = labSlots(s);
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
  const needle = q.trim().toLocaleLowerCase(locale());
  const inSearch = (d: ResearchDef) => !needle || `${t(d.name)} ${t(d.desc)} ${d.effects ?? ''}`.toLocaleLowerCase(locale()).includes(needle);
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
          <h1>{t('Ar-Ge')}</h1>
          <p className="muted">{t('Yeni teknoloji dünyada ortaya çıkar; tasarımda kullanmak için önce mühendislerinin öğrenmesi gerekir. Sıraya dizdiklerin sırayla kendiliğinden başlar.')}</p>
        </div>
      </div>
      <div className="stats-row">
        <Stat
          label={
            <>
              {t('Araştırma yeri')}
              <Info>
                <p>{t('Her 15 mühendis ya da 6 Ar-Ge uzmanı bir konu daha yürütebilir.')}</p>
              </Info>
            </>
          }
          value={`${r.active.length} / ${slots}`}
        />
        <Stat
          label={t('Araştırma hızı')}
          value={`×${dec(labSpeed(s), 1)}`}
          sub={t('{engineers} mühendis · {researchers} Ar-Ge uzmanı', { engineers: s.company.engineers, researchers: s.company.researchers ?? 0 })}
        />
        <Stat
          label={
            <>
              {t('Son 52 hafta prototip, test ve Ar-Ge')}
              <Info>
                <p>
                  {t(
                    'Araştırma, prototip ve test harcaması bir arada: hiç araştırma yapmayan bir şirket de prototip ve test için para harcar. Büyük şirketin araştırması da büyüktür: önemli bir konu cironun yüzde birkaçına mal olur.',
                  )}
                </p>
              </Info>
            </>
          }
          value={money(spent)}
          sub={revenue > 0 && spent > 0 ? (spent / revenue >= 0.001 ? t('cironun {share}', { share: pctOf(spent / revenue, 1) }) : t('cironun binde birinden az')) : undefined}
        />
        <Stat label={t('Rakiplerde var, sende yok')} value={count('rivals')} sub={t('teknoloji')} tone={count('rivals') > 3 ? 'warn' : undefined} />
      </div>

      <LabStaff />

      <div className="research-layout">
        <div className="research-main">
          <div className="rfilters" role="tablist" aria-label={t('Süzgeç')}>
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} title={t(f.hint)} className={`rchip ${filter === f.id ? 'is-on' : ''}`} onClick={() => setFilter(f.id)}>
                {t(f.label)}
                <span className="rchip-n">{count(f.id)}</span>
              </button>
            ))}
          </div>
          <div className="rtools">
            <div className="rcats" role="group" aria-label={t('Alan')}>
              <button type="button" className={`rcat ${cat === 'all' ? 'is-on' : ''}`} onClick={() => setCat('all')}>
                {t('Hepsi')}
              </button>
              {CATEGORIES.map((c) => (
                <button key={c} type="button" className={`rcat ${cat === c ? 'is-on' : ''}`} onClick={() => setCat(c)} title={t(c)}>
                  {ICON[c]} {c === 'Şasi ve süspansiyon' ? t('Şasi') : t(c)}
                </button>
              ))}
            </div>
            <input className="rsearch" type="search" placeholder={t('Ara: OHV, fren, lastik…')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Teknoloji ara')} />
            {filter !== 'queued' && (
              <select className="rsort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t('Sırala')}>
                <option value="rivals">{t('Rakip kullanımına göre')}</option>
                <option value="year">{t('Yıla göre')}</option>
                <option value="cost">{t('Bedele göre')}</option>
              </select>
            )}
          </div>
          {addable.length > 1 && (filter === 'rivals' || filter === 'new' || needle) && (
            <p className="rbulk">
              <Button small onClick={() => store.act((st) => addable.forEach((d) => A.queueResearch(st, d.id)))}>
                {t('Listedeki {n} konunun hepsini sıraya ekle', { n: addable.length })}
              </Button>
              <span className="muted small">
                {' '}
                {t('toplam ~{cost}; bedeller konu başladığında ödenir.', { cost: money(addable.reduce((a, d) => a + researchCost(d, yf, s), 0)) })}
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
  if (searching) return t('Aramaya uyan konu yok.');
  switch (f) {
    case 'open':
      return t('Şu an öğrenilmemiş bir teknoloji yok: hepsi biliniyor ya da sırada.');
    case 'rivals':
      return t('Rakiplerin kullanıp senin bilmediğin bir teknoloji yok.');
    case 'new':
      return t('Son iki yılda yeni bir teknoloji çıkmadı.');
    case 'queued':
      return t('Sıra boş. “Araştırılabilir” listesinden konu ekle.');
    case 'known':
      return t('Henüz bir şey öğrenilmedi.');
    case 'future':
      return t('Önümüzdeki on yılda yeni bir şey beklenmiyor.');
  }
}

function ResearchRow({ d, expanded, onToggle, share }: { d: ResearchDef; expanded: boolean; onToggle: () => void; share: number }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const r = s.research!;
  const queue = r.queue ?? [];
  const st = techState(s, d.id, yf);
  const cost = researchCost(d, yf, s);
  const weeks = researchWeeks(d, yf, s.company.engineers, s.company.researchers ?? 0);
  const missing = missingRequirements(s, d.id);
  const active = r.active.find((a) => a.id === d.id);
  const free = labSlots(s) - r.active.length;
  const qi = queue.indexOf(d.id);
  return (
    <div className={`rrow is-${st}`} role="listitem">
      <button type="button" className="rrow-main" onClick={onToggle} aria-expanded={expanded}>
        <span className="rrow-icon" aria-hidden>
          {ICON[d.category]}
        </span>
        <span className="rrow-name">
          <b>{t(d.name)}</b>
          <span className="rrow-tags">
            <span className="muted small">{d.year}</span>
            {st === 'available' && d.year >= yf - 2 && <span className="rtag rtag-new">{t('yeni')}</span>}
            {d.passive && <span className="rtag">{t('otomatik uygulanır')}</span>}
            {missing.length > 0 && st !== 'known' && <span className="rtag rtag-warn">{t('önce {techs}', { techs: missing.map((m) => t(m.name)).join(', ') })}</span>}
          </span>
        </span>
      </button>
      <span className="rrow-share" title={t('Bu teknolojiyi kullanan rakip araçların payı')}>
        {st === 'future' ? (
          <span className="muted small">{t('{year} çıkar', { year: inYear(d.year) })}</span>
        ) : (
          <>
            <span className="rbar">
              <i style={{ width: `${Math.round(share * 100)}%` }} />
            </span>
            <span className="small">{share > 0 ? t('rakiplerin {share}', { share: pct(share, 0) }) : t('rakiplerde yok')}</span>
          </>
        )}
      </span>
      <span className="rrow-cost small">
        {st === 'known' ? (
          <span className="tone-good">✓ {t('biliniyor')}</span>
        ) : active ? (
          <Progress value={active.weeks - active.weeksLeft} max={active.weeks} label={t('{n} hf', { n: Math.ceil(active.weeksLeft) })} />
        ) : st === 'future' ? (
          ''
        ) : (
          <>
            {money(cost)} · {t('{n} hf', { n: weeks })}
          </>
        )}
      </span>
      <span className="rrow-act">
        {st === 'available' && qi >= 0 && (
          <>
            <span className="rtag">{t('sırada #{pos}', { pos: qi + 1 })}</span>
            <Button small kind="ghost" onClick={() => store.try((st2) => A.unqueueResearch(st2, d.id))} aria-label={t('{tech} sıradan çıkar', { tech: t(d.name) })}>
              ×
            </Button>
          </>
        )}
        {st === 'available' && qi < 0 && !active && (
          <>
            {free > 0 && missing.length === 0 && (
              <Button small kind="primary" disabled={s.company.cash < cost} onClick={() => store.try((st2) => A.startResearch(st2, d.id), t('{tech} araştırması başladı', { tech: t(d.name) }))}>
                {t('Araştır')}
              </Button>
            )}
            <Button small kind={free > 0 && missing.length === 0 ? 'ghost' : 'primary'} onClick={() => store.try((st2) => A.queueResearch(st2, d.id), t('{tech} sıraya eklendi', { tech: t(d.name) }))}>
              {t('+ Sıra')}
            </Button>
          </>
        )}
      </span>
      {expanded && (
        <div className="rrow-more">
          <p className="small">{t(d.desc)}</p>
          {d.effects && <p className="small">{tx('<b>Etkisi:</b> {effects}', { effects: d.effects })}</p>}
          {d.passive && <p className="small muted">{t('Öğrenildiği andan itibaren bütün yeni tasarımlara ve makyajlara kendiliğinden girer.')}</p>}
          {!d.passive && st !== 'future' && <p className="small muted">{t('Öğrenildikten sonra tasarım ekranında seçilebilir.')}</p>}
        </div>
      )}
    </div>
  );
}

/** Research staff: hire them to learn faster and work on more subjects at once. */
function LabStaff() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const n = s.company.researchers ?? 0;
  const e = s.company.engineers;
  const hire = (k: number) => store.try((st) => A.hireResearchers(st, k), t('{n} Ar-Ge uzmanı işe alındı', { n: k }));
  const next = n + 4;
  return (
    <div className="lab-staff">
      <div className="lab-staff-text">
        <b>{t('Ar-Ge uzmanları: {n}', { n })}</b>
        <span className="muted small">
          {' '}
          ·{' '}
          {t('araştırma hızı ×{speed}, aynı anda {n} konu · maaşları haftada {pay}', {
            speed: dec(labSpeed(s), 1),
            n: labSlots(s),
            pay: money(n * researcherSalary(yf)),
          })}
        </span>
        <span className="small">
          {t(
            '+4 uzmanla hız ×{speed}, {n} konu. Uzmanlar yalnızca araştırır (araba geliştirmez); işe alınca süren araştırmalar da hızlanır. Kişi başı işe alma {hire}, maaş haftada {pay}.',
            { speed: dec(researchSpeed(e, next), 1), n: researchSlots(e, next), hire: money(researcherHireCost(yf)), pay: money(researcherSalary(yf)) },
          )}
        </span>
      </div>
      <div className="lab-staff-btns">
        <Button kind="primary" small disabled={s.company.cash < researcherHireCost(yf)} onClick={() => hire(1)}>
          {t('+1 Ar-Ge uzmanı al')}
        </Button>
        <Button small disabled={s.company.cash < 4 * researcherHireCost(yf)} onClick={() => hire(4)}>
          +4
        </Button>
        <Button small kind="ghost" disabled={n <= 0} onClick={() => store.try((st) => A.fireResearchers(st, 1), t('Bir Ar-Ge uzmanı ayrıldı'))}>
          −1
        </Button>
      </div>
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
      <Panel title={t('Şu an araştırılan')}>
        {r.active.length ? (
          r.active.map((a) => (
            <div key={a.id} className="research-active">
              <div className="test-head">
                <b>{t(researchDef(a.id)?.name ?? a.id)}</b>
                <span className="muted small">{t('{n} hf', { n: Math.ceil(a.weeksLeft) })}</span>
              </div>
              <Progress value={a.weeks - a.weeksLeft} max={a.weeks} />
            </div>
          ))
        ) : (
          <p className="muted small">{t('Mühendisler şu an bir şey araştırmıyor.')}</p>
        )}
      </Panel>
      <Panel title={queue.length ? t('Sıra ({n})', { n: queue.length }) : t('Sıra')}>
        {queue.length ? (
          <>
            <ol className="rqueue">
              {queue.map((id, i) => {
                const d = researchDef(id);
                if (!d) return null;
                const waiting = missingRequirements(s, id);
                const why =
                  hold?.id === id && hold.reason === 'cash'
                    ? t('kasa bekliyor')
                    : waiting.length
                      ? t('önce {techs}', { techs: waiting.map((w) => t(w.name)).join(', ') })
                      : d.year > yf
                        ? t('{year} çıkar', { year: inYear(d.year) })
                        : '';
                return (
                  <li key={id}>
                    <span className="rqueue-name">
                      <b>{t(d.name)}</b>
                      <span className="muted small">
                        {' '}
                        {money(researchCost(d, yf, s))}
                        {why && ` · ${why}`}
                      </span>
                    </span>
                    <span className="rqueue-btns">
                      <Button small kind="ghost" disabled={i === 0} onClick={() => store.try((st) => A.moveResearch(st, id, -1))} aria-label={t('Yukarı taşı')}>
                        ↑
                      </Button>
                      <Button small kind="ghost" disabled={i === queue.length - 1} onClick={() => store.try((st) => A.moveResearch(st, id, 1))} aria-label={t('Aşağı taşı')}>
                        ↓
                      </Button>
                      <Button small kind="ghost" onClick={() => store.try((st) => A.unqueueResearch(st, id))} aria-label={t('Sıradan çıkar')}>
                        ×
                      </Button>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="muted small">
              {t(
                'Yer açılınca sıradaki kendiliğinden başlar ve bedeli o an ödenir. Sıra, birkaç haftalık gideri ayırdıktan sonra kalan kasanın en fazla yarısını harcar (fabrikanın büyümesi için para kalsın); daha pahalı bir konuyu “Araştır” ile elle başlatabilirsin. Önkoşulunu bekleyenin yerine arkasındaki başlar.',
              )}
            </p>
          </>
        ) : (
          <p className="muted small">{t('Sıra boş. Listeden “+ Sıra” ile ekle; eksik önkoşullar kendiliğinden öne girer.')}</p>
        )}
      </Panel>
    </>
  );
}
