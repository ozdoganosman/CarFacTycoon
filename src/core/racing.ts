import { costIndex } from '../data/economy';
import { MARKETS } from '../data/markets';
import { modelScores } from './market';
import { publish } from './news';
import { rand } from './rng';
import { weekOfYear, yearFloat, yearOf } from './time';
import type { CarModel, GameState, MarketId } from './types';
import { clamp, log, money, spend } from './util';

// A racing team: money that buys fame. Each season the team's best car and
// engineers meet the field; wins make the headlines, raise the brand's prestige
// and bring buyers to the showroom. Fame fades when the team stops winning.

export const RACING_YEAR = 1906;

export const RACING_LEVELS = [
  { name: 'Yarışmıyor', share: 0, floor: 0, desc: 'Yarış bütçesi yok.' },
  { name: 'Amatör sürücüler', share: 0.01, floor: 3000, desc: 'Müşteri arabalarıyla yerel yarışlar ve tepe tırmanışları. Ucuz, ünü yavaş büyür.' },
  { name: 'Fabrika takımı', share: 0.025, floor: 12000, desc: 'Kendi sürücülerin ve hazırlanmış arabalarınla büyük yarışlarda.' },
  { name: 'Grand Prix takımı', share: 0.05, floor: 40000, desc: 'Özel yarış arabaları ve en iyi sürücüler: kazanmak için. Çok pahalı.' },
];

/** Fame gained per result, by level. */
const FAME = { win: [0, 1, 2.5, 4], podium: [0, 0.5, 1.2, 2] };

/** Yearly racing budget: a share of the last year's revenue, never below the level's floor. */
export function racingBudget(s: GameState, level: number): number {
  if (level <= 0) return 0;
  const rev = s.finance.slice(-52).reduce((a, f) => a + f.revenue, 0);
  const l = RACING_LEVELS[level];
  return Math.max(l.floor * costIndex(yearFloat(s.week)), l.share * rev);
}

/** Prestige points every model of the company gets from the team's fame (applied in modelScores). */
export const racingPrestige = (s: GameState) => Math.min(8, s.racing?.fame ?? 0);

/** The races of the day in the company's home market. */
function raceName(home: MarketId, year: number, level: number): string {
  if (level === 1) return home === 'usa' ? 'Pikes Peak tepe tırmanışı' : 'Shelsley Walsh tepe tırmanışı';
  if (home === 'usa') return year >= 1911 ? 'Indianapolis 500' : 'Vanderbilt Kupası';
  if (year >= 1927 && level === 2) return 'Mille Miglia';
  if (year >= 1923 && level === 2) return 'Le Mans 24 Saat';
  return 'Fransa Grand Prix’si';
}

function bestCar(s: GameState): { m: CarModel; perf: number } | null {
  let best: { m: CarModel; perf: number } | null = null;
  for (const m of s.models) {
    if (m.status !== 'active') continue;
    const sc = modelScores(s, m).scores;
    const perf = (sc.accel + sc.topSpeed + sc.handling + sc.reliability) / 4;
    if (!best || perf > best.perf) best = { m, perf };
  }
  return best;
}

/** No racing at home while the country is at war (the Indianapolis 500 and the Grands Prix stopped). */
export function racingPaused(home: MarketId, yf: number): boolean {
  if (home === 'usa') return (yf >= 1917.3 && yf < 1919) || (yf >= 1942 && yf < 1946);
  return (yf >= 1914.6 && yf < 1919) || (yf >= 1939.7 && yf < 1946);
}

export interface RacingOutlook {
  model: string;
  /** Years since the car was launched or facelifted. */
  age: number;
  win: number;
  podium: number;
}

/** Chances for the coming season with the company's best car at a given budget level. */
export function racingOutlook(s: GameState, level: number): RacingOutlook | null {
  const car = bestCar(s);
  if (!car || level <= 0) return null;
  const strength = teamStrength(s, car.perf, level);
  // The field is uniform between its floor and floor + FIELD_SPAN.
  const p = (x: number) => clamp((x - FIELD_LO[level]) / FIELD_SPAN, 0, 1);
  return { model: car.m.name, age: (s.week - car.m.refreshWeek) / 52, win: p(strength - WIN_MARGIN), podium: p(strength) };
}

/**
 * Bigger races draw stronger fields: a hill climb is won by a good road car, a Grand Prix needs a
 * fast, reliable car and a strong team on top of the money.
 */
const FIELD_LO = [0, 38, 46, 54];
const FIELD_SPAN = 18;
const WIN_MARGIN = 7;
const teamStrength = (s: GameState, perf: number, level: number) => 0.5 * perf + 0.3 * s.company.skill + 4 * level;

/** Weekly: pay the team, let fame fade a little and bring people to the showroom. */
export function racingWeek(s: GameState) {
  const r = s.racing;
  if (!r) return;
  const yf = yearFloat(s.week);
  r.fame *= 0.997; // about 15% a year
  const paused = racingPaused(s.company.hq, yf);
  if (r.level > 0 && paused !== !!r.paused) {
    r.paused = paused;
    log(s, paused ? 'Savaş yüzünden yarışlar yapılmıyor: takım bekliyor, yarış bütçesi harcanmıyor.' : 'Savaş bitti, yarışlar yeniden başlıyor: takım sezona hazırlanıyor.', 'info');
  }
  if (r.level > 0 && yf >= RACING_YEAR && !paused) spend(s, racingBudget(s, r.level) / 52, 'marketing');
  const hq = s.markets[s.company.hq];
  hq.awareness = clamp(hq.awareness + 0.0004 * r.fame, 0, 1);
  // Race season: once a year, in September.
  if (r.level > 0 && weekOfYear(s.week) === 38 && yf >= RACING_YEAR && !paused) raceSeason(s);
}

export function raceSeason(s: GameState) {
  const r = s.racing!;
  const year = yearOf(s.week);
  const car = bestCar(s);
  if (!car) return;
  const race = raceName(s.company.hq, year, r.level);
  // Team strength against the field: the car, the engineers, and how much money is behind it.
  const strength = teamStrength(s, car.perf, r.level);
  const field = FIELD_LO[r.level] + FIELD_SPAN * rand(s);
  const margin = strength - field;
  const result: 'win' | 'podium' | 'none' = margin > WIN_MARGIN ? 'win' : margin > 0 ? 'podium' : 'none';
  r.dry = result === 'none' ? (r.dry ?? 0) + 1 : 0;
  r.last = { year, race, result, model: car.m.name };
  if (result === 'win') {
    r.fame += FAME.win[r.level];
    r.wins = (r.wins ?? 0) + 1;
    (r.winYears ??= []).push(year);
    s.company.reputation = clamp(s.company.reputation + [0, 0.5, 1.5, 3][r.level], 0, 100);
    log(s, `🏁 ${s.company.name} ${car.m.name} ile ${race}’i kazandı! Marka ünü arttı.`, 'good');
    if (r.level >= 2) publishWin(s, car.m, race);
  } else if (result === 'podium') {
    r.fame += FAME.podium[r.level];
    log(s, `🏁 ${race}: ${car.m.name} ilk üçe girdi.`, 'good');
  } else {
    r.fame += 0.2;
    const age = (s.week - car.m.refreshWeek) / 52;
    log(
      s,
      `🏁 ${race}: ${car.m.name} dereceye giremedi.${age > 5 ? ` Araba ${Math.floor(age)} yaşında; yeni ve güçlü bir araba olmadan takım para yakıyor.` : ' Daha güçlü bir araba ya da daha büyük bir takım gerekiyor.'}`,
      (r.dry ?? 0) >= 2 ? 'warn' : 'info',
    );
  }
}

function publishWin(s: GameState, m: CarModel, race: string) {
  const r = s.racing!;
  const market = MARKETS.find((x) => x.id === s.company.hq)!.name;
  publish(s, {
    id: `n${s.nextId++}`,
    week: s.week,
    kind: 'boom',
    lead: {
      headline: `${m.name}, ${race}’i kazandı!`,
      deck: `${s.company.name} takımı rakiplerini geride bıraktı; bayilerde yarışı gören meraklılar kuyrukta`,
      body: `${s.company.name} fabrika takımı, ${race}’de ${m.name} ile birinciliği aldı. Takımın bu ${r.wins === 1 ? 'ilk' : `${r.wins}.`} büyük zaferi, ${market} basınında geniş yer buldu.`,
      paragraphs: [
        'Yarış çevreleri zaferin sırrını motorun dayanıklılığına ve takımın hazırlığına bağlıyor. Sokaktaki alıcı için mesaj açık: kazanan arabanın kardeşi bayide satılıyor.',
        `Sektör gözlemcileri, ${s.company.name} markasının önümüzdeki aylarda satışlarını artırmasını bekliyor.`,
      ],
      art: { kind: 'car', modelId: m.id },
      caption: `Kazanan ${m.name}, damalı bayrağın ardından.`,
    },
    side: [{ headline: 'Rakip Takımlar Kara Kara Düşünüyor', body: 'Yenilen takımlar gelecek sezon için daha güçlü motorlar ve yeni sürücüler arıyor.' }],
  });
}

export function setRacingLevel(s: GameState, level: number) {
  s.racing ??= { level: 0, fame: 0 };
  s.racing.level = clamp(Math.round(level), 0, 3);
  log(s, s.racing.level ? `Yarış bütçesi: ${RACING_LEVELS[s.racing.level].name} (yılda ~${money(racingBudget(s, s.racing.level))}).` : 'Yarış takımı dağıtıldı.', 'info');
}
