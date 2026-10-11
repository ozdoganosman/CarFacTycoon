import { msg, t } from '../i18n';
import { recentUnits } from './investments';
import { openStates } from './network';
import { ledSegments, salesRank } from './rivalMoves';
import { weekFor, yearOf } from './time';
import type { ChapterSnapshot, GameState } from './types';
import { fmtNumber } from '../i18n/format';
import { log } from './util';

// The campaign in six chapters, one a decade. Each has three goals that send the player to a part of
// the game (the network, the class lead, the races, buying a rival, the army, the paint). A goal is
// met once and stays met; each is worth GOAL_POINTS of the final score. The new decade's paper opens
// the chapter (news.ts chapterIssue) with the last decade's report card.

export const GOAL_POINTS = 10;

interface GoalDef {
  id: string;
  /** What to do, marked with msg(): show it with t(); {n} is the target. */
  text: string;
  /** How, marked with msg(). */
  hint: string;
  target: number;
  /** Where the company stands (a count, cars, a rank…). */
  value: (s: GameState, c: Chapter) => number;
  /** A rank: met at the target or better (lower). */
  atMost?: boolean;
  /** Show the value as a number of cars (thousands separated). */
  cars?: boolean;
}

export interface ChapterDef {
  decade: number;
  /** The decade as written ("1920’ler"), marked with msg(). */
  label: string;
  /** Marked with msg(). */
  name: string;
  intro: string;
  goals: GoalDef[];
}

type Chapter = ChapterSnapshot;

const totalSold = (s: GameState) => s.models.reduce((a, m) => a + m.unitsSold, 0);
const launchedIn = (s: GameState, c: Chapter, from = c.decade, to = c.decade + 10) =>
  s.models.filter((m) => m.launchWeek >= weekFor(from, 0) && m.launchWeek < weekFor(to, 0));
const activeClasses = (s: GameState) => new Set(s.models.filter((m) => m.status === 'active').map((m) => m.segment)).size;
const profitableYears = (s: GameState, from: number, to: number) => s.years.filter((y) => y.year >= from && y.year <= to && y.profit > 0).length;

export const CHAPTERS: ChapterDef[] = [
  {
    decade: 1900,
    label: msg('1900’ler'),
    name: msg('Atölyeden yola'),
    intro: msg('Otomobil zenginlerin oyuncağı; yollar toz, benzin eczanede satılıyor. Atölyede başlayan her marka ilk arabasını yola çıkarmaya çalışıyor.'),
    goals: [
      { id: 'first-car', text: msg('İlk arabanı piyasaya çıkar'), hint: msg('Projeler ekranında yeni bir proje başlat.'), target: 1, value: (s) => s.models.length },
      { id: 'states-10', text: msg('{n} eyalette satış yap'), hint: msg('Harita ekranında komşu eyaletlerde bayi ara.'), target: 10, value: (s) => openStates(s).length },
      { id: 'sold-5k', text: msg('Toplam {n} araba sat'), hint: msg('Talebi karşılayacak kadar üret; fiyat rehberine bak.'), target: 5000, value: totalSold, cars: true },
    ],
  },
  {
    decade: 1910,
    label: msg('1910’lar'),
    name: msg('Hareketli hat'),
    intro: msg('Seri üretim otomobili halka indiriyor. Büyük fabrikalar küçük atölyeleri geride bırakıyor; Büyük Savaş çeliği pahalandıracak.'),
    goals: [
      { id: 'year-50k', text: msg('Bir yılda {n} araba sat'), hint: msg('Hatlarını büyüt ve bayi ağını genişlet.'), target: 50000, value: (s) => recentUnits(s), cars: true },
      { id: 'top-5', text: msg('Amerika’nın en büyük {n} üreticisinden biri ol'), hint: msg('Geçen yılın satışlarına göre sayılır.'), target: 5, value: (s) => salesRank(s), atMost: true },
      { id: 'lead-class', text: msg('Bir sınıfın lideri ol'), hint: msg('Sınıfın en az sekizde birini sat ve her rakipten fazla sat.'), target: 1, value: (s) => ledSegments(s).length },
    ],
  },
  {
    decade: 1920,
    label: msg('1920’ler'),
    name: msg('Kükreyen yirmiler'),
    intro: msg('Kapalı gövde, taksitli satış ve her yıl yeni model: otomobil artık bir moda. Dergiler ve yarış pistleri markaları konuşuyor.'),
    goals: [
      { id: 'review-85', text: msg('Dergilerden 8,5 üstü alan bir araba çıkar'), hint: msg('Sınıfın alıcılarının önem verdiği alanlara öncelik ver, iyi test et.'), target: 1, value: (s, c) => launchedIn(s, c).filter((m) => m.reviewScore >= 8.5).length },
      { id: 'rep-80', text: msg('İtibarını {n}’e çıkar'), hint: msg('İyi arabalar, yeterli servis ve olağanın üstünde reklam.'), target: 80, value: (s) => Math.round(s.company.reputation) },
      { id: 'race-win', text: msg('Bir yarış kazan'), hint: msg('Şirket ekranında yarış takımı kur; hızlı ve dayanıklı bir arabayla yarış.'), target: 1, value: (s, c) => (s.racing?.winYears?.length ?? 0) - c.wins },
    ],
  },
  {
    decade: 1930,
    label: msg('1930’lar'),
    name: msg('Buhran yılları'),
    intro: msg('Borsa çöktü, bankalar krediyi kıstı, lüks talep yok oldu. Ayakta kalan markalar ucuzlayan rakiplerini toplayacak.'),
    goals: [
      { id: 'depression-profit', text: msg('1930-1933 yıllarının dördünü de kârla kapat'), hint: msg('Fiyatı ve üretimi talebe uydur, boştaki hatları sat.'), target: 4, value: (s) => profitableYears(s, 1930, 1933) },
      { id: 'buy-rival', text: msg('Bir rakibi satın al'), hint: msg('Şirket ekranında senden küçük rakipler satılık.'), target: 1, value: (s, c) => (s.acquired?.length ?? 0) - c.acquired },
      { id: 'classes-3', text: msg('{n} farklı sınıfta araba sat'), hint: msg('Yeni bir sınıfa araba çıkar.'), target: 3, value: activeClasses },
    ],
  },
  {
    decade: 1940,
    label: msg('1940’lar'),
    name: msg('Savaş ve barış'),
    intro: msg('Fabrikalar orduya çalışacak, sivil araba yapılmayacak. Barış gelince herkes yeni bir araba isteyecek.'),
    goals: [
      { id: 'army-10k', text: msg('Orduya {n} araç üret'), hint: msg('Savaş sözleşmelerini kabul et; hatlar Fabrika ekranında orduya ayrılır.'), target: 10000, value: (s, c) => Math.round((s.flags.militaryUnits ?? 0) - c.military), cars: true },
      { id: 'postwar-car', text: msg('Barışın ilk üç yılında (1945-1947) yeni bir araba çıkar'), hint: msg('Savaş biterken bir projeyi hazır tut.'), target: 1, value: (s, c) => launchedIn(s, c, 1945, 1948).length },
      { id: 'suv', text: msg('Arazi aracı sınıfına bir araba çıkar'), hint: msg('Arazi aracı sınıfı 1946’da açılır; cip tecrübesi işe yarar.'), target: 1, value: (s, c) => launchedIn(s, c).filter((m) => m.segment === 'suv').length },
    ],
  },
  {
    decade: 1950,
    label: msg('1950’ler'),
    name: msg('Altın çağ'),
    intro: msg('Otoyollar, banliyöler, iki renkli boyalar ve kuyruk kanatları. Amerika tekerlekler üstünde; büyükler daha da büyüyor.'),
    goals: [
      { id: 'year-750k', text: msg('Bir yılda {n} araba sat'), hint: msg('Her sınıfta güncel bir araba ve yetecek kadar hat.'), target: 750000, value: (s) => recentUnits(s), cars: true },
      { id: 'top-3', text: msg('Amerika’nın en büyük {n} üreticisinden biri ol'), hint: msg('Geçen yılın satışlarına göre sayılır.'), target: 3, value: (s) => salesRank(s), atMost: true },
      { id: 'two-tone', text: msg('İki renkli boyalı bir araba çıkar'), hint: msg('Tasarımda tavan için ikinci bir renk seç.'), target: 1, value: (s, c) => launchedIn(s, c).filter((m) => !!m.design.roof).length },
    ],
  },
];

export const chapterOf = (year: number) => CHAPTERS.find((c) => year >= c.decade && year < c.decade + 10) ?? CHAPTERS[CHAPTERS.length - 1];

const snapshot = (s: GameState, decade: number): Chapter => ({
  decade,
  acquired: s.acquired?.length ?? 0,
  military: s.flags.militaryUnits ?? 0,
  wins: s.racing?.winYears?.length ?? 0,
});

function chapterState(s: GameState, decade: number): Chapter {
  s.goals ??= { done: {}, chapters: {} };
  return (s.goals.chapters[decade] ??= snapshot(s, decade));
}

const met = (g: GoalDef, v: number) => (g.atMost ? v > 0 && v <= g.target : v >= g.target);

export interface GoalStatus {
  id: string;
  text: string;
  hint: string;
  done: boolean;
  /** Where the company stands, as shown ("12.400 / 50.000", "6.", "2/4"). */
  progress?: string;
  /** 0-1 towards the target. */
  share: number;
}

const fmtCount = (n: number) => fmtNumber(Math.round(n));

/** The goals of a chapter and how far the company has come with each (a past chapter: what was met in time). */
export function goalStatus(s: GameState, def: ChapterDef = chapterOf(yearOf(s.week))): GoalStatus[] {
  const c = s.goals?.chapters[def.decade] ?? snapshot(s, def.decade);
  const live = def === chapterOf(yearOf(s.week));
  return def.goals.map((g) => {
    const v = g.value(s, c);
    // Met since the last monthly look: shown as met already.
    const done = s.goals?.done[g.id] !== undefined || (live && met(g, v));
    const share = done ? 1 : g.atMost ? (v > 0 && v < 99 ? Math.min(1, g.target / v) : 0) : Math.max(0, Math.min(1, v / g.target));
    const progress = done || g.target === 1 ? undefined : g.atMost ? (v > 0 && v < 99 ? t('şu an {rank}.', { rank: v }) : undefined) : `${fmtCount(v)} / ${fmtCount(g.target)}`;
    return { id: g.id, text: t(g.text, { n: fmtCount(g.target) }), hint: t(g.hint), done, progress, share };
  });
}

/** Monthly: mark the goals of the running chapter the company has met (`year` to look at a closing one). */
export function checkGoals(s: GameState, year = yearOf(s.week)) {
  const def = chapterOf(year);
  const c = chapterState(s, def.decade);
  for (const g of def.goals) {
    if (s.goals!.done[g.id] !== undefined) continue;
    if (met(g, g.value(s, c))) {
      s.goals!.done[g.id] = s.week;
      log(s, t('On yılın hedefi tamam: {goal}. Bitiş puanına +{points}.', { goal: t(g.text, { n: fmtCount(g.target) }), points: GOAL_POINTS }), 'good');
    }
  }
}

/** Goals met in a chapter (its report card). */
export const chapterDone = (s: GameState, def: ChapterDef) => def.goals.filter((g) => s.goals?.done[g.id] !== undefined).length;

/** All goals met so far, and how many there are. */
export function goalsMet(s: GameState): { met: number; of: number } {
  return { met: CHAPTERS.reduce((a, c) => a + chapterDone(s, c), 0), of: CHAPTERS.reduce((a, c) => a + c.goals.length, 0) };
}

/** A new decade: open its chapter (the snapshot its goals count from). */
export function openChapter(s: GameState, year: number) {
  chapterState(s, chapterOf(year).decade);
}
