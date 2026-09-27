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

/** Weekly: pay the team, let fame fade a little and bring people to the showroom. */
export function racingWeek(s: GameState) {
  const r = s.racing;
  if (!r) return;
  r.fame *= 0.997; // about 15% a year
  if (r.level > 0 && yearFloat(s.week) >= RACING_YEAR) spend(s, racingBudget(s, r.level) / 52, 'marketing');
  const hq = s.markets[s.company.hq];
  hq.awareness = clamp(hq.awareness + 0.0004 * r.fame, 0, 1);
  // Race season: once a year, in September.
  if (r.level > 0 && weekOfYear(s.week) === 38 && yearFloat(s.week) >= RACING_YEAR) raceSeason(s);
}

export function raceSeason(s: GameState) {
  const r = s.racing!;
  const year = yearOf(s.week);
  const car = bestCar(s);
  if (!car) return;
  const race = raceName(s.company.hq, year, r.level);
  // Team strength against the field: the car, the engineers, and how much money is behind it.
  const strength = 0.45 * car.perf + 0.25 * s.company.skill + 12 * r.level;
  const field = 58 + 16 * rand(s);
  const margin = strength - field;
  const result: 'win' | 'podium' | 'none' = margin > 10 ? 'win' : margin > 0 ? 'podium' : 'none';
  r.last = { year, race, result, model: car.m.name };
  if (result === 'win') {
    r.fame += FAME.win[r.level];
    r.wins = (r.wins ?? 0) + 1;
    s.company.reputation = clamp(s.company.reputation + [0, 0.5, 1.5, 3][r.level], 0, 100);
    log(s, `🏁 ${s.company.name} ${car.m.name} ile ${race}’i kazandı! Marka ünü arttı.`, 'good');
    if (r.level >= 2) publishWin(s, car.m, race);
  } else if (result === 'podium') {
    r.fame += FAME.podium[r.level];
    log(s, `🏁 ${race}: ${car.m.name} ilk üçe girdi.`, 'good');
  } else {
    r.fame += 0.2;
    log(s, `🏁 ${race}: ${car.m.name} dereceye giremedi. Daha güçlü bir araba ya da daha büyük bir takım gerekiyor.`, 'info');
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
