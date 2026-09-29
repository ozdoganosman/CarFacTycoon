import { useEffect, useState } from 'react';
import { formatDate, yearOf } from '../../core/time';
import type { CarModel, GameState, NewsArt, NewsIssue } from '../../core/types';
import { store, useGameState } from '../store';
import { money } from '../format';
import { CarSVG } from '../viz/CarSVG';
import { Button } from './ui';
import { PaperAdSlot } from './Sponsor';

// Period front pages. Three mastheads follow the look of the press of their
// day: blackletter and dense columns before 1920, high-contrast display type
// in the twenties and thirties, bold condensed headlines after the war.
// Illustrations are drawn here as line engravings; car pictures are printed
// through a halftone screen.

type Era = 'early' | 'mid' | 'late';

const eraOf = (year: number): Era => (year < 1920 ? 'early' : year < 1940 ? 'mid' : 'late');

const MAST: Record<Era, { name: string; tagline: string; price: string }> = {
  early: { name: 'Otomobil Gazetesi', tagline: 'Motorlu Araçlar, Yollar ve Sanayi Üzerine Haftalık Havadis', price: 'Fiyatı 5 kuruş' },
  mid: { name: 'Motor ve Yol', tagline: 'Otomobilciliğin ve Seyahatin Sesi', price: 'Her yerde 10 kuruş' },
  late: { name: 'Otomobil Dünyası', tagline: 'Sanayi · Ticaret · Yol · Spor', price: '25 kuruş' },
};

/** The newest paper waits in a corner; the clock keeps running. */
export function NewsCard() {
  const s = useGameState();
  const item = s.modals.find((m) => m.kind === 'news');
  const issue = item?.kind === 'news' ? s.news?.find((n) => n.id === item.newsId) : undefined;
  // Folds into a small tab after a few seconds so it does not cover the page, and goes away later.
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (!issue) return;
    setCompact(false);
    const fold = setTimeout(() => setCompact(true), 8000);
    const t = setTimeout(() => store.act((st) => void (st.modals = st.modals.filter((m) => m.kind !== 'news'))), 60000);
    return () => {
      clearTimeout(fold);
      clearTimeout(t);
    };
  }, [issue?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!issue) return null;
  const era = eraOf(yearOf(issue.week));
  const dismiss = () => store.act((st) => void (st.modals = st.modals.filter((m) => m.kind !== 'news')));
  const read = () => {
    dismiss();
    store.openNews(issue.id);
  };
  if (compact)
    return (
      <aside className={`news-card is-compact ${issue.kind === 'boom' ? 'is-boom' : ''}`}>
        <button type="button" className="news-card-tab" onClick={read} title={issue.lead.headline}>
          📰 <span className={`mast-${era}`}>{MAST[era].name}</span>
        </button>
        <button type="button" className="year-card-x" aria-label="Kapat" onClick={dismiss}>
          ×
        </button>
      </aside>
    );
  return (
    <aside className={`news-card ${issue.kind === 'boom' ? 'is-boom' : ''}`} aria-live="polite">
      <div className="news-card-head">
        <span className={`news-card-mast mast-${era}`}>{MAST[era].name}</span>
        <button type="button" className="year-card-x" aria-label="Kapat" onClick={dismiss}>
          ×
        </button>
      </div>
      <b className="news-card-headline">{issue.lead.headline}</b>
      <Button kind={issue.kind === 'boom' ? 'primary' : 'ghost'} onClick={read}>
        📰 Gazeteyi oku (oyun durur)
      </Button>
    </aside>
  );
}

/** Full-page reader for the issue the player opened. */
export function NewspaperHost() {
  const s = useGameState();
  const issue = store.newsOpen ? s.news?.find((n) => n.id === store.newsOpen) : undefined;
  useEffect(() => {
    if (!issue) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && store.closeNews();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [issue]);
  if (!issue) return null;
  return (
    <div className="paper-backdrop" onClick={(e) => e.target === e.currentTarget && store.closeNews()}>
      <div className="paper-wrap" role="dialog" aria-modal="true" aria-label={issue.lead.headline}>
        <button type="button" className="paper-close" onClick={() => store.closeNews()} aria-label="Gazeteyi kapat">
          ×
        </button>
        <Newspaper s={s} issue={issue} />
      </div>
      <PaperAdSlot />
    </div>
  );
}

export function Newspaper({ s, issue }: { s: GameState; issue: NewsIssue }) {
  const year = yearOf(issue.week);
  const era = eraOf(year);
  const mast = MAST[era];
  const model = issue.lead.art.kind === 'car' ? s.models.find((m) => m.id === (issue.lead.art as { modelId: string }).modelId) : undefined;
  const adModel = issue.ad ? s.models.find((m) => m.id === issue.ad!.modelId) : undefined;
  return (
    <article className={`paper paper-${era}`}>
      <header className="paper-mast">
        <div className="paper-ears">
          <span className="paper-ear">{issue.kind === 'boom' ? 'ÖZEL BASKI' : 'Hava: açık, yollar kuru'}</span>
          <h1 className="paper-name">{mast.name}</h1>
          <span className="paper-ear">Son telgraflar içeride</span>
        </div>
        <div className="paper-tagline">{mast.tagline}</div>
        <div className="paper-dateline">
          <span>
            Cilt {year - 1899} · Sayı {1000 + issue.week}
          </span>
          <span>{formatDate(issue.week)}</span>
          <span>{mast.price}</span>
        </div>
      </header>
      <div className="paper-body">
        <div className="paper-lead">
          <h2 className="paper-headline">{issue.lead.headline}</h2>
          {issue.lead.deck && <p className="paper-deck">{issue.lead.deck}</p>}
          <figure className={`paper-figure ${issue.lead.art.kind === 'car' ? 'is-car' : ''}`}>
            <div className="halftone">
              <Art art={issue.lead.art} model={model} year={year} />
            </div>
            {issue.lead.caption && <figcaption>{issue.lead.caption}</figcaption>}
          </figure>
          {issue.stats && (
            <div className="paper-stats">
              {issue.stats.map((x) => (
                <div key={x.label}>
                  <span>{x.label}</span>
                  <b>{x.value}</b>
                </div>
              ))}
            </div>
          )}
          <div className="paper-cols">
            <p className="dropcap">{issue.lead.body}</p>
            {(issue.lead.paragraphs ?? []).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
        <aside className="paper-side">
          {issue.side.map((x) => (
            <section key={x.headline} className="paper-story">
              <h3>{x.headline}</h3>
              {x.deck && <p className="paper-subdeck">{x.deck}</p>}
              <p>{x.body}</p>
            </section>
          ))}
          {issue.world && (
            <section className="paper-box">
              <h4>Dünyadan</h4>
              <h3>{issue.world.headline}</h3>
              <p>{issue.world.body}</p>
            </section>
          )}
        </aside>
      </div>
      {(issue.ad || issue.letters?.length) && (
        <div className="paper-bottom">
          {issue.ad && adModel && (
            <div className="paper-ad">
              <div className="paper-ad-flag">YENİ!</div>
              <div className="paper-ad-maker">{s.company.name}</div>
              <div className="paper-ad-model">{adModel.name}</div>
              <div className="halftone paper-ad-car">
                <CarSVG body={adModel.design.body} size={adModel.design.size} year={yearOf(adModel.refreshWeek)} cylinders={adModel.design.engine.cylinders} styling={adModel.design.styling} />
              </div>
              <div className="paper-ad-slogan">{issue.ad.slogan}</div>
              <ul>
                {issue.ad.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <div className="paper-ad-price">Fiyatı yalnızca {money(issue.ad.price)}</div>
              <div className="paper-ad-foot">En yakın bayimizde sizi bekliyor</div>
            </div>
          )}
          {!!issue.letters?.length && (
            <section className="paper-letters">
              <h4>Okur mektupları</h4>
              {issue.letters.map((l, i) => (
                <blockquote key={i}>
                  <p>“{l.text}”</p>
                  <footer>
                    — {l.name}, {l.role}, {l.place} <span className="paper-stars">{'★'.repeat(l.stars)}</span>
                  </footer>
                </blockquote>
              ))}
            </section>
          )}
        </div>
      )}
    </article>
  );
}

/** A small list of past front pages. */
export function NewsArchive() {
  const s = useGameState();
  const list = [...(s.news ?? [])].reverse().slice(0, 12);
  if (!list.length) return <p className="muted small">Henüz gazetede çıkan bir haber yok.</p>;
  return (
    <ul className="archive">
      {list.map((n) => (
        <li key={n.id}>
          <button type="button" className="link-btn" onClick={() => store.openNews(n.id)}>
            <span className="news-date">{formatDate(n.week)}</span> {n.kind === 'boom' ? '🎉 ' : '📰 '}
            {n.lead.headline}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Art({ art, model, year }: { art: NewsArt; model?: CarModel; year: number }) {
  if (art.kind === 'car' && model)
    return <CarSVG body={model.design.body} size={model.design.size} year={yearOf(model.refreshWeek)} cylinders={model.design.engine.cylinders} styling={model.design.styling} />;
  const area = art.kind === 'tech' ? art.area : 'Motor';
  return <Engraving scene={area} year={year} />;
}

/** Line engravings for technology stories: an engine, gears, a wheel with its spring, a lamp, a body shell. */
function Engraving({ scene }: { scene: string; year: number }) {
  const stroke = { stroke: 'currentColor', strokeWidth: 2 } as const;
  return (
    <svg viewBox="0 0 320 170" className="engraving" role="img" aria-label={scene}>
      <defs>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" strokeWidth="1.2" />
        </pattern>
        <pattern id="hatch2" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="0.8" />
        </pattern>
      </defs>
      {scene === 'Motor' && (
        <g>
          <rect x="60" y="40" width="200" height="80" rx="6" fill="url(#hatch2)" {...stroke} />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x={75 + i * 46} y="22" width="34" height="30" rx="3" fill="#fff" {...stroke} />
              <rect x={79 + i * 46} y={58 + (i % 2) * 18} width="26" height="18" fill="url(#hatch)" {...stroke} />
              <line x1={92 + i * 46} y1={76 + (i % 2) * 18} x2={92 + i * 46} y2="132" {...stroke} />
              <line x1={92 + i * 46} y1="10" x2={92 + i * 46} y2="22" {...stroke} />
            </g>
          ))}
          <line x1="50" y1="135" x2="270" y2="135" strokeWidth="5" stroke="currentColor" />
          <circle cx="40" cy="135" r="18" fill="url(#hatch)" {...stroke} />
          <circle cx="40" cy="135" r="5" fill="currentColor" />
          <path d="M270 125 h28 v20 h-28" fill="url(#hatch2)" {...stroke} />
        </g>
      )}
      {scene === 'Şanzıman' && (
        <g>
          <Gear cx={120} cy={85} r={55} teeth={18} />
          <Gear cx={212} cy={85} r={38} teeth={12} />
          <circle cx="120" cy="85" r="10" fill="currentColor" />
          <circle cx="212" cy="85" r="8" fill="currentColor" />
          <line x1="20" y1="85" x2="65" y2="85" strokeWidth="6" stroke="currentColor" />
          <line x1="250" y1="85" x2="300" y2="85" strokeWidth="6" stroke="currentColor" />
        </g>
      )}
      {scene === 'Şasi ve süspansiyon' && (
        <g>
          <circle cx="110" cy="100" r="52" fill="url(#hatch2)" {...stroke} />
          <circle cx="110" cy="100" r="30" fill="#fff" {...stroke} />
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1="110" y1="100" x2={110 + 30 * Math.cos((i * Math.PI) / 6)} y2={100 + 30 * Math.sin((i * Math.PI) / 6)} {...stroke} strokeWidth={1.4} />
          ))}
          <circle cx="110" cy="100" r="6" fill="currentColor" />
          <path d="M110 100 L230 60" fill="none" {...stroke} strokeWidth={5} />
          <path
            d={`M200 20 ${Array.from({ length: 8 }, (_, i) => `L${(i % 2 ? 188 : 216)} ${26 + i * 6}`).join(' ')} L202 76`}
            fill="none"
            {...stroke}
            strokeWidth={2.5}
          />
          <rect x="235" y="30" width="16" height="50" fill="url(#hatch)" {...stroke} />
          <line x1="180" y1="18" x2="280" y2="18" strokeWidth="6" stroke="currentColor" />
          <line x1="20" y1="154" x2="300" y2="154" {...stroke} />
        </g>
      )}
      {scene === 'Donanım' && (
        <g>
          <path d="M110 40 a55 55 0 0 1 0 90 z" fill="url(#hatch2)" {...stroke} />
          <ellipse cx="110" cy="85" rx="16" ry="45" fill="#fff" {...stroke} />
          {Array.from({ length: 7 }, (_, i) => (
            <line key={i} x1="140" y1={85 + (i - 3) * 9} x2={290} y2={85 + (i - 3) * 22} {...stroke} strokeWidth={1.2} />
          ))}
          <rect x="70" y="125" width="30" height="30" fill="url(#hatch)" {...stroke} />
        </g>
      )}
      {scene === 'Güvenlik' && (
        <g>
          <path d="M40 120 q20 -50 70 -55 h90 q35 5 60 55 z" fill="url(#hatch2)" {...stroke} />
          <circle cx="90" cy="125" r="20" fill="#fff" {...stroke} />
          <circle cx="230" cy="125" r="20" fill="#fff" {...stroke} />
          <path d="M160 20 l40 14 v28 q0 30 -40 44 q-40 -14 -40 -44 v-28 z" fill="#fff" {...stroke} strokeWidth={3} />
          <path d="M142 58 l14 14 l26 -28" fill="none" {...stroke} strokeWidth={5} />
        </g>
      )}
    </svg>
  );
}

function Gear({ cx, cy, r, teeth }: { cx: number; cy: number; r: number; teeth: number }) {
  const pts: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i * Math.PI) / teeth;
    const rr = i % 2 ? r - 8 : r;
    pts.push(`${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`);
  }
  return (
    <g>
      <polygon points={pts.join(' ')} fill="url(#hatch2)" stroke="currentColor" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#fff" stroke="currentColor" strokeWidth="2" />
    </g>
  );
}

